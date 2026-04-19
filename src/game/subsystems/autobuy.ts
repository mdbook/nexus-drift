import { AUTO_TICK } from "@/game/constants";
import { ECONOMY, PRESTIGE } from "@/game/balance";
import { upgradeDefs } from "@/game/data";
import { computeDerived } from "@/game/selectors";
import type { DerivedState, GameState, UpgradeKey } from "@/game/types";
import { nextUpgradeCost, pushLog } from "@/game/utils";

const upgradeDefByKey = Object.fromEntries(upgradeDefs.map((def) => [def.key, def])) as Record<
  UpgradeKey,
  (typeof upgradeDefs)[number]
>;

type EmergencyUpgradeChoice = { key: UpgradeKey; reason: string };

export function getAutobuyWeight(state: GameState, derived: DerivedState, key: UpgradeKey) {
  let weight = 1;

  if (state.level < 3 && (key === "miner" || key === "drill")) weight *= 0.72;
  if (derived.totalIncome < 6 && (key === "miner" || key === "drill")) weight *= 0.86;
  if (state.resources.energy < 10 && key === "reactor") weight *= 0.82;
  if (derived.progression.tier >= 2 && key === "turret" && state.upgrades.turret < 1) weight *= 0.52;
  if (derived.progression.tier >= 2 && key === "reactor" && state.upgrades.reactor < 1) weight *= 0.62;
  if (derived.progression.tier >= 3 && key === "shield" && state.upgrades.shield < 1) weight *= 0.68;

  if (derived.hostilePressure) {
    if (key === "turret") weight *= 0.62;
    else if (key === "shield") weight *= 0.72;
    else if (key === "reactor") weight *= 0.82;
    else if (key === "miner" || key === "drill") weight *= 1.18;
  }

  if (derived.enemyCounts.wisp > 0) {
    if (key === "turret") weight *= 0.36;
    else if (key === "reactor") weight *= 0.76;
  }

  if (derived.enemyCounts.raider > 0) {
    if (key === "reactor") weight *= 0.32;
    else if (key === "shield") weight *= 0.55;
    else if (key === "turret") weight *= 0.78;
  }

  if (derived.corruptionPressure) {
    if (key === "scout") weight *= state.upgrades.scout === 0 ? 0.12 : 0.42;
    else if (key === "arsenal") weight *= state.upgrades.scout > 0 ? 0.28 : 0.9;
    else if (key === "shield") weight *= 0.9;
    else if (key === "turret") weight *= 1.08;
  }

  if (derived.progression.recoveryMode && (key === "miner" || key === "drill")) weight *= 1.18;
  if (key === "bot" && state.upgrades.bot > Math.max(2, state.prestige + 1)) weight *= 1.25;
  if (key === "arsenal" && state.upgrades.scout === 0) weight *= 1.25;

  return weight;
}

export function getEmergencyUpgradeChoice(state: GameState, derived: DerivedState): EmergencyUpgradeChoice | null {
  const canAfford = (key: UpgradeKey) => state.resources.gold >= nextUpgradeCost(upgradeDefByKey[key], state.upgrades[key]);

  if (
    (derived.corruptorCount > 0 || derived.activeCorruptionNodes > 0 || derived.progression.tier >= 3) &&
    state.upgrades.scout < 1 &&
    canAfford("scout")
  ) {
    return { key: "scout", reason: "corrupter pressure" };
  }

  if (
    (derived.corruptorCount > 0 || derived.activeCorruptionNodes > 1) &&
    state.upgrades.scout > 0 &&
    state.upgrades.arsenal < state.upgrades.scout + 1 &&
    canAfford("arsenal")
  ) {
    return { key: "arsenal", reason: "purge cleanup" };
  }

  if (
    (derived.enemyCounts.raider > 0 || derived.progression.tier >= 4) &&
    state.upgrades.reactor < Math.max(1, Math.ceil(derived.progression.tier / 2)) &&
    canAfford("reactor")
  ) {
    return { key: "reactor", reason: "heavy-contact pressure" };
  }

  if (
    (derived.enemyCounts.wisp > 0 || derived.combatThreats >= 4) &&
    state.upgrades.turret < Math.max(1, Math.ceil(derived.progression.tier / 2)) &&
    canAfford("turret")
  ) {
    return { key: "turret", reason: "fast-contact pressure" };
  }

  if (
    (derived.enemyCounts.mite + derived.enemyCounts.raider >= 4 || derived.colonyHealth < 70) &&
    state.upgrades.shield < Math.max(1, Math.ceil(derived.progression.tier / 3)) &&
    canAfford("shield")
  ) {
    return { key: "shield", reason: "worker attrition" };
  }

  return null;
}

export function stepAutobuy(state: GameState) {
  if (state.timers.auto < AUTO_TICK) return;
  state.timers.auto = 0;

  const derived = computeDerived(state);
  const emergencyChoice = getEmergencyUpgradeChoice(state, derived);
  if (emergencyChoice) {
    const def = upgradeDefByKey[emergencyChoice.key];
    const cost = nextUpgradeCost(def, state.upgrades[def.key]);
    state.resources.gold = Math.max(0, state.resources.gold - cost);
    state.upgrades[def.key] += 1;
    state.stats.spent += cost;
    state.log = pushLog(
      state.log,
      `Ops bot fast-tracked ${def.label} v${state.upgrades[def.key]} for ${emergencyChoice.reason}.`
    );
    return;
  }

  const candidates = upgradeDefs
    .map((def) => ({
      def,
      cost: nextUpgradeCost(def, state.upgrades[def.key]),
    }))
    .filter(({ def, cost }) => {
      const smartGate =
        (def.key !== "bot" || state.upgrades.drill >= 2) &&
        (def.key !== "shield" || state.upgrades.turret >= 1 || derived.progression.tier >= 3) &&
        (def.key !== "turret" || state.upgrades.reactor >= 1 || state.level >= 3 || derived.progression.tier >= 2) &&
        (def.key !== "scout" || state.upgrades.reactor >= 1 || state.level >= 4 || derived.progression.tier >= 3) &&
        (def.key !== "arsenal" || state.upgrades.scout >= 1);

      return smartGate && state.resources.gold >= cost;
    })
    .sort((a, b) => {
      const weightedA = a.cost * getAutobuyWeight(state, derived, a.def.key);
      const weightedB = b.cost * getAutobuyWeight(state, derived, b.def.key);
      return weightedA - weightedB || a.cost - b.cost;
    });

  const chosen = candidates[0];
  if (chosen) {
    state.resources.gold = Math.max(0, state.resources.gold - chosen.cost);
    state.upgrades[chosen.def.key] += 1;
    state.stats.spent += chosen.cost;
    state.log = pushLog(state.log, `Purchased ${chosen.def.label} v${state.upgrades[chosen.def.key]}`);
    return;
  }

  if (
    state.resources.gold > PRESTIGE.goldGate &&
    state.resources.gems > PRESTIGE.gemsGate &&
    state.enemies.length < PRESTIGE.maxEnemies &&
    derived.corruptedNodes === 0
  ) {
    state.resources.gold *= PRESTIGE.resetMultipliers.gold;
    state.resources.ore *= PRESTIGE.resetMultipliers.ore;
    state.resources.gems *= PRESTIGE.resetMultipliers.gems;
    state.resources.energy *= PRESTIGE.resetMultipliers.energy;
    state.prestige += 1;
    state.combo = Math.min(state.combo + PRESTIGE.comboBonus, ECONOMY.comboMax);
    state.log = pushLog(state.log, "Quantum reset complete. Prestige +1.");
  }
}
