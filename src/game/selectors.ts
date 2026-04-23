import { CITY, CITY_HP, CORRUPTION, DEFENSE, ECONOMY, FLUX, PRESTIGE, SCOUT, SENTINEL, TURRET_SLOTS_BY_LEVEL } from "@/game/balance";
import { TICK_MS } from "@/game/constants";
import { computeProgressionDirector } from "@/game/progression";
import type { DerivedState, GameState } from "@/game/types";

// TODO(3.2.0): `computeDerived` runs ~15 times per tick because subsystems call
// it independently. A naive memoization keyed on `state` identity is unsafe —
// subsystems mutate state between calls (spawns/combat/movement), so cached
// values would go stale. The correct fix is to compute `derived` once at the
// top of `advanceGame`, thread it through subsystem signatures, and recompute
// (or patch) after phases that mutate tracked fields. Deferred from 3.1.0
// because the subsystem-signature churn is too large for release polish.
export function computeDerived(state: GameState): DerivedState {
  const activeCorruptionNodes = state.nodes.filter((node) => node.kind !== "gold" && node.corruption > CORRUPTION.nodeActiveThreshold).length;
  const p = 1 + state.prestige * ECONOMY.prestigeMultiplier;
  const enemyCounts = {
    mite: 0,
    raider: 0,
    wisp: 0,
    corruptor: 0,
    rusher: 0,
    brute: 0,
    sapper: 0,
    blight: 0,
    leech: 0,
    phantom: 0,
    zapper: 0,
    warden: 0,
  };
  const corruptedByType = { ore: 0, gems: 0, energy: 0 };

  // 3.1.3 audit follow-up: dying enemies (hp<=0 but still in the array during
  // the death-fade visual window) must not pressure-feed selectors. They're
  // invisible to combat/targeting/movement already — count/threat selectors
  // now match that invariant so threat scoring, event backdrop, and economy
  // penalties don't double-count corpses.
  state.enemies.forEach((enemy) => {
    if (enemy.hp <= 0) return;
    enemyCounts[enemy.kind] += 1;
  });

  const combatThreats = state.enemies.filter((enemy) => enemy.hp > 0 && enemy.role === "combat").length;
  const corruptorCount = state.enemies.filter((enemy) => enemy.hp > 0 && enemy.role === "corruptor").length;

  state.nodes.forEach((node) => {
    if (node.corrupted && node.kind in corruptedByType) {
      corruptedByType[node.kind as keyof typeof corruptedByType] += 1;
    }
  });

  const threatPenalty = Math.max(ECONOMY.threatPenaltyFloor, 1 - combatThreats * ECONOMY.threatPenaltyPerEnemy + state.upgrades.shield * ECONOMY.threatPenaltyPerShield);
  const corruptionPenalty = {
    ore: Math.max(0.25, 1 - corruptedByType.ore * CORRUPTION.corruptibleKindsBiasWeight.ore),
    gems: Math.max(0.2, 1 - corruptedByType.gems * CORRUPTION.corruptibleKindsBiasWeight.gems),
    energy: Math.max(0.2, 1 - corruptedByType.energy * CORRUPTION.corruptibleKindsBiasWeight.energy),
  };

  // 3.0.0: city HP modulates energy production. At full HP the energy rate
  // runs at 100%; at 0 HP it floors at CITY_HP.energyMinRatio. Linear
  // interpolation between the two keeps the feedback visible without
  // creating a discontinuous cliff.
  const cityIntegrityValue = state.city.maxHp > 0 ? state.city.hp / state.city.maxHp : 1;
  const energyCityScale =
    CITY_HP.energyMinRatio + (1 - CITY_HP.energyMinRatio) * cityIntegrityValue;

  const rates = {
    gold: (ECONOMY.rates.goldBase + state.upgrades.miner * ECONOMY.rates.goldPerMiner + state.upgrades.drill * ECONOMY.rates.goldPerDrill) * p * threatPenalty,
    ore:
      (ECONOMY.rates.oreBase + state.upgrades.miner * ECONOMY.rates.orePerMiner + state.upgrades.drill * ECONOMY.rates.orePerDrill) *
      p *
      threatPenalty *
      corruptionPenalty.ore,
    gems:
      (ECONOMY.rates.gemsBase + state.upgrades.drill * ECONOMY.rates.gemsPerDrill + state.upgrades.reactor * ECONOMY.rates.gemsPerReactor) *
      p *
      corruptionPenalty.gems,
    energy:
      (ECONOMY.rates.energyBase + state.upgrades.reactor * ECONOMY.rates.energyPerReactor + state.upgrades.shield * ECONOMY.rates.energyPerShield) *
      p *
      corruptionPenalty.energy *
      state.eventModifiers.energyRate *
      energyCityScale,
    cores: 0,
    flux: 0,
  };
  const resources = { ...state.resources };
  const fluxRate =
    state.resources.flux > FLUX.softCap
      ? -((state.resources.flux - FLUX.softCap) * 0.002 * 1000) / TICK_MS
      : 0;

  const totalIncome = rates.gold + rates.ore * 2 + rates.gems * 18 + rates.energy * 12;
  const targetXp = 80 + state.level * 25;
  const defenseScore =
    state.upgrades.turret * DEFENSE.score.turret +
    state.upgrades.shield * DEFENSE.score.shield +
    state.upgrades.scout * DEFENSE.score.scout +
    state.upgrades.arsenal * DEFENSE.score.arsenal +
    state.upgrades.sentinel * DEFENSE.score.sentinel;
  const threatScore =
    combatThreats + corruptorCount * DEFENSE.threat.corruptorMultiplier + corruptedByType.ore + corruptedByType.gems + corruptedByType.energy;
  // 3.1.3 audit follow-up: colonyHealth is a 0..100 reading averaged over
  // *active* workers' hp/maxHp, not raw hp across all slots. Inactive slots
  // are not on-field, so they should not drag the reading; and once maxHp
  // drifts from the default 100 (warden toughness buff, future upgrades)
  // raw-hp averaging breaks every downstream 0..100 comparison
  // (hostilePressure, autobuy, `stable_colony`, director recovery ref).
  const activeAgents = state.agents.filter((agent) => agent.active);
  const colonyHealth = activeAgents.length
    ? (activeAgents.reduce((sum, agent) => sum + (agent.maxHp > 0 ? agent.hp / agent.maxHp : 0), 0) / activeAgents.length) * 100
    : 100;
  const corruptedNodes = state.nodes.filter((node) => node.corrupted).length;
  // 3.0.0: turret slot count is gated by both upgrade level AND sector level
  // (mirrors WORKER_SLOTS_BY_LEVEL). The always-on first turret keeps its
  // floor; additional turrets need both upgrade + level to line up.
  const turretLevelSlots = TURRET_SLOTS_BY_LEVEL[Math.min(state.level, TURRET_SLOTS_BY_LEVEL.length - 1)];
  const additionalTurretSlots = Math.min(state.upgrades.turret, turretLevelSlots);
  const activeTurrets = Math.max(1, Math.min(state.turrets.length, 1 + additionalTurretSlots));
  const activeScouts = Math.min(state.scouts.length, state.upgrades.scout, SCOUT.capBase + (state.upgrades.scout >= SCOUT.capBoostThreshold ? SCOUT.capBoostAmount : 0));
  const activeSentinels = Math.min(state.sentinels.length, state.upgrades.sentinel * SENTINEL.capPerUpgrade);
  const activeMissileSilos = state.missileSilos.filter((silo) => silo.active).length;
  const brokenTurrets = state.turrets.filter((turret) => turret.brokenTicks > 0).length;
  const corruptedWorkers = state.agents.filter((agent) => agent.corrupted).length;
  const cityIntegrity = state.city.maxHp > 0 ? state.city.hp / state.city.maxHp : 1;
  const hostilePressure = combatThreats >= DEFENSE.hostilePressureEnemyThreshold || colonyHealth < DEFENSE.hostilePressureColonyHealth;
  const corruptionPressure = corruptorCount > 0 || activeCorruptionNodes > 0;
  const totalUpgrades = Object.values(state.upgrades).reduce((sum, value) => sum + value, 0);
  const weightedUpgradeScore =
    state.upgrades.miner * DEFENSE.weightedUpgrade.miner +
    state.upgrades.drill * DEFENSE.weightedUpgrade.drill +
    state.upgrades.reactor * DEFENSE.weightedUpgrade.reactor +
    state.upgrades.bot * DEFENSE.weightedUpgrade.bot +
    state.upgrades.turret * DEFENSE.weightedUpgrade.turret +
    state.upgrades.shield * DEFENSE.weightedUpgrade.shield +
    state.upgrades.scout * DEFENSE.weightedUpgrade.scout +
    state.upgrades.arsenal * DEFENSE.weightedUpgrade.arsenal +
    state.upgrades.foundry * DEFENSE.weightedUpgrade.foundry +
    state.upgrades.sentinel * DEFENSE.weightedUpgrade.sentinel +
    state.upgrades.archive * DEFENSE.weightedUpgrade.archive;
  const homeDevelopment =
    state.level * CITY.developmentWeights.level +
    totalUpgrades * CITY.developmentWeights.totalUpgrades +
    weightedUpgradeScore * CITY.developmentWeights.weightedUpgrade +
    activeTurrets * CITY.developmentWeights.activeTurrets +
    activeScouts * CITY.developmentWeights.activeScouts +
    activeSentinels * CITY.developmentWeights.activeTurrets +
    state.prestige * CITY.developmentWeights.prestige +
    totalIncome * CITY.developmentWeights.totalIncome;
  const prestigeComboBonus = PRESTIGE.comboBonus + state.upgrades.archive * 0.05;

  const cityBuildProgress = Math.max(0, Math.min(1, (homeDevelopment - CITY.growthStart) / CITY.growthSpan));

  let cityStage = 0;
  while (
    cityStage < CITY.stageThresholds.length &&
    cityBuildProgress >= CITY.stageThresholds[cityStage]
  ) {
    cityStage += 1;
  }

  const previousThreshold = cityStage === 0 ? 0 : CITY.stageThresholds[cityStage - 1];
  const nextThreshold = CITY.stageThresholds[cityStage] ?? 1;
  const cityProgress = Math.max(
    0,
    Math.min(1, (cityBuildProgress - previousThreshold) / Math.max(0.001, nextThreshold - previousThreshold))
  );
  const progression = computeProgressionDirector({
    level: state.level,
    prestige: state.prestige,
    totalUpgrades,
    weightedUpgradeScore,
    totalIncome,
    defenseScore,
    threatScore,
    colonyHealth,
    combatThreats,
    corruptorCount,
    activeCorruptionNodes,
    activeTurrets,
    activeScouts,
    cityStage,
    liveEnemyCount: state.enemies.filter((enemy) => enemy.hp > 0).length,
  });

  return {
    resources,
    rates,
    fluxRate,
    totalIncome,
    targetXp,
    defenseScore,
    threatScore,
    enemyCounts,
    activeEvents: state.activeEvents,
    colonyHealth,
    corruptedByType,
    corruptorCount,
    activeCorruptionNodes,
    corruptedNodes,
    combatThreats,
    activeTurrets,
    activeScouts,
    activeSentinels,
    hostilePressure,
    corruptionPressure,
    homeDevelopment,
    cityStage,
    cityProgress,
    cityBuildProgress,
    prestigeComboBonus,
    progression,
    activeMissileSilos,
    brokenTurrets,
    corruptedWorkers,
    cityIntegrity,
  };
}
