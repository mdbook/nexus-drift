import { CITY, CORRUPTION, DEFENSE, ECONOMY, SCOUT } from "@/game/balance";
import { computeProgressionDirector } from "@/game/progression";
import type { DerivedState, GameState } from "@/game/types";

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
  };
  const corruptedByType = { ore: 0, gems: 0, energy: 0 };

  state.enemies.forEach((enemy) => {
    enemyCounts[enemy.kind] += 1;
  });

  const combatThreats = state.enemies.filter((enemy) => enemy.role === "combat").length;
  const corruptorCount = state.enemies.filter((enemy) => enemy.role === "corruptor").length;

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
      state.eventModifiers.energyRate,
    cores: 0,
    flux: 0,
  };

  const totalIncome = rates.gold + rates.ore * 2 + rates.gems * 18 + rates.energy * 12;
  const targetXp = 80 + state.level * 25;
  const defenseScore =
    state.upgrades.turret * DEFENSE.score.turret +
    state.upgrades.shield * DEFENSE.score.shield +
    state.upgrades.scout * DEFENSE.score.scout +
    state.upgrades.arsenal * DEFENSE.score.arsenal;
  const threatScore =
    combatThreats + corruptorCount * DEFENSE.threat.corruptorMultiplier + corruptedByType.ore + corruptedByType.gems + corruptedByType.energy;
  const colonyHealth = state.agents.length
    ? state.agents.reduce((sum, agent) => sum + agent.hp, 0) / state.agents.length
    : 100;
  const corruptedNodes = state.nodes.filter((node) => node.corrupted).length;
  const activeTurrets = Math.max(1, Math.min(state.turrets.length, 1 + state.upgrades.turret));
  const activeScouts = Math.min(state.scouts.length, state.upgrades.scout, SCOUT.capBase + (state.upgrades.scout >= SCOUT.capBoostThreshold ? SCOUT.capBoostAmount : 0));
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
    state.upgrades.arsenal * DEFENSE.weightedUpgrade.arsenal;
  const homeDevelopment =
    state.level * CITY.developmentWeights.level +
    totalUpgrades * CITY.developmentWeights.totalUpgrades +
    weightedUpgradeScore * CITY.developmentWeights.weightedUpgrade +
    activeTurrets * CITY.developmentWeights.activeTurrets +
    activeScouts * CITY.developmentWeights.activeScouts +
    state.prestige * CITY.developmentWeights.prestige +
    totalIncome * CITY.developmentWeights.totalIncome;

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
  });

  return {
    rates,
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
    hostilePressure,
    corruptionPressure,
    homeDevelopment,
    cityStage,
    cityProgress,
    cityBuildProgress,
    progression,
  };
}
