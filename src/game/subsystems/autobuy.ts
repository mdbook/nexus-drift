import { AUTO_TICK } from "@/game/constants";
import { ECONOMY, FLUX, PRESTIGE } from "@/game/balance";
import { getUpgradeDef, upgradeDefs } from "@/game/data";
import { purchaseUpgrade } from "@/game/purchases";
import { computeDerived } from "@/game/selectors";
import type { SimTraceCtx } from "@/game/trace";
import type { DerivedState, GameState, UpgradeKey } from "@/game/types";
import { canAffordUpgrade, getUpgradeCostTotal, nextUpgradeCost, appendLog } from "@/game/utils";

type EmergencyUpgradeChoice = { key: UpgradeKey; reason: string };

/**
 * 4.0 — whether autobuy is allowed to buy `key` under the current master
 * setting. `"all"` → always (byte-identical to pre-4.0); `"none"` → never;
 * `"custom"` → only when the per-upgrade flag is explicitly on.
 */
function isAutoEligible(state: GameState, key: UpgradeKey): boolean {
  const master = state.upgradeAutoMaster;
  if (master === "all") return true;
  if (master === "none") return false;
  return state.upgradeAutoFlags[key] === true;
}

export function getAutobuyWeight(state: GameState, derived: DerivedState, key: UpgradeKey) {
  let weight = 1;

  if (state.level < 3 && (key === "miner" || key === "drill")) weight *= 0.72;
  if (derived.totalIncome < 6 && (key === "miner" || key === "drill")) weight *= 0.86;
  if (state.resources.energy < 10 && key === "reactor") weight *= 0.82;
  if (derived.progression.tier >= 3 && key === "turret" && state.upgrades.turret < 1) weight *= 0.52;
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

  // 3.1.5 defense flip: missile launcher is now the early-game default. The
  // first silo is armed at upgrade 0; investing in the track buys range,
  // damage, and additional silos. Lean into it whenever heavy targets show up.
  if (key === "missileLauncher") {
    if (derived.enemyCounts.brute > 0 || derived.enemyCounts.leech > 0) {
      weight *= 0.62; // big-target suppression — strongly favour
    }
  }

  return weight;
}

export function getEmergencyUpgradeChoice(
  state: GameState,
  derived: DerivedState
): EmergencyUpgradeChoice | null {
  const canAfford = (key: UpgradeKey) =>
    canAffordUpgrade(state.resources, nextUpgradeCost(getUpgradeDef(key), state.upgrades[key]));

  if (
    (derived.corruptorCount > 0 || derived.activeCorruptionNodes > 0 || derived.progression.tier >= 2) &&
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

  if (derived.progression.tier >= 3 && state.upgrades.foundry === 0 && canAfford("foundry")) {
    return { key: "foundry", reason: "yield ramp" };
  }

  if (
    derived.progression.tier >= 5 &&
    state.stats.brutesKilled > 0 &&
    derived.enemyCounts.brute >= 2 &&
    state.upgrades.sentinel < state.sentinels.length &&
    canAfford("sentinel")
  ) {
    return { key: "sentinel", reason: "heavy-contact pressure" };
  }

  // 3.1.5 defense flip: silos are the early-game default, but L1 still adds
  // damage and range. Push it past the free L0 silo when heavy targets show up.
  if (
    state.upgrades.missileLauncher < 1 &&
    (derived.enemyCounts.brute >= 1 || derived.enemyCounts.leech >= 2) &&
    canAfford("missileLauncher")
  ) {
    return { key: "missileLauncher", reason: "heavy-target suppression" };
  }

  return null;
}

export function stepAutobuy(state: GameState, ctx?: SimTraceCtx) {
  if (state.timers.auto < AUTO_TICK) return;
  state.timers.auto = 0;

  const derived = computeDerived(state);
  const emergencyChoice = getEmergencyUpgradeChoice(state, derived);
  // 4.0 — the emergency path respects the autobuy flags too: if the player has
  // opted this upgrade out, fall through to the ranking (which is also filtered).
  if (emergencyChoice && isAutoEligible(state, emergencyChoice.key)) {
    // enforceGates: false — getEmergencyUpgradeChoice already gates its picks
    // (and deliberately fast-tracks some below their minTier), so purchaseUpgrade
    // must not re-gate here. This keeps the emergency path byte-identical.
    purchaseUpgrade(state, emergencyChoice.key, {
      enforceGates: false,
      log: (label, level) => `Ops bot fast-tracked ${label} v${level} for ${emergencyChoice.reason}.`,
    });
    // ponytail: emit before the early-return so emergency ticks are still traced.
    // The candidate ranking is bypassed on this path, so candidates is empty.
    if (ctx) {
      ctx.recordAutobuy({
        tick: state.timers.tick,
        candidates: [],
        emergency: true,
        chosenKey: emergencyChoice.key,
      });
    }
    return;
  }

  const candidates = upgradeDefs
    .map((def) => ({
      def,
      cost: nextUpgradeCost(def, state.upgrades[def.key]),
    }))
    .filter(({ def, cost }) => {
      // 4.0 — drop upgrades the player has opted out of BEFORE ranking, so the
      // trace's candidates/chosenKey reflect only what was actually auto-eligible.
      if (!isAutoEligible(state, def.key)) return false;
      if (def.minTier !== undefined && derived.progression.tier < def.minTier) return false;

      const smartGate =
        (def.key !== "bot" || state.upgrades.drill >= 2) &&
        (def.key !== "shield" || state.upgrades.turret >= 1 || derived.progression.tier >= 3) &&
        (def.key !== "turret" ||
          state.upgrades.reactor >= 1 ||
          state.level >= 3 ||
          derived.progression.tier >= 2) &&
        (def.key !== "scout" ||
          state.upgrades.reactor >= 1 ||
          state.level >= 4 ||
          derived.progression.tier >= 3) &&
        (def.key !== "arsenal" || state.upgrades.scout >= 1) &&
        (def.key !== "sentinel" || state.stats.brutesKilled > 0) &&
        (def.key !== "sentinel" || state.upgrades.sentinel < state.sentinels.length);

      return smartGate && canAffordUpgrade(state.resources, cost);
    })
    .sort((a, b) => {
      const totalA = getUpgradeCostTotal(a.cost);
      const totalB = getUpgradeCostTotal(b.cost);
      const weightedA = totalA * getAutobuyWeight(state, derived, a.def.key);
      const weightedB = totalB * getAutobuyWeight(state, derived, b.def.key);
      return weightedA - weightedB || totalA - totalB;
    });

  const chosen = candidates[0];
  // ponytail: emit before the early-returns so a no-purchase tick is still recorded.
  // Weights are recomputed here (only when tracing) since the sort consumed them inline.
  if (ctx) {
    ctx.recordAutobuy({
      tick: state.timers.tick,
      candidates: candidates.map(({ def }) => ({
        key: def.key,
        weight: getAutobuyWeight(state, derived, def.key),
      })),
      emergency: false,
      chosenKey: chosen ? chosen.def.key : null,
    });
  }
  if (chosen) {
    // enforceGates: false — the candidate filter above already applied minTier,
    // the smart gates, and affordability, so purchaseUpgrade only executes the buy.
    purchaseUpgrade(state, chosen.def.key, { enforceGates: false });
    return;
  }

  // 4.0 — don't auto-prestige when autobuy is fully off ("none"); prestige is an
  // autobuy behavior, and a manual player shouldn't have their run reset for them.
  // Under "all" this guard is always true, so the pre-4.0 path is unchanged.
  if (
    state.upgradeAutoMaster !== "none" &&
    state.resources.gold > PRESTIGE.goldGate &&
    state.resources.gems > PRESTIGE.gemsGate &&
    state.enemies.length < PRESTIGE.maxEnemies &&
    derived.corruptedNodes === 0
  ) {
    state.resources.gold *= PRESTIGE.resetMultipliers.gold;
    state.resources.ore *= PRESTIGE.resetMultipliers.ore;
    state.resources.gems *= PRESTIGE.resetMultipliers.gems;
    state.resources.energy *= PRESTIGE.resetMultipliers.energy;
    state.resources.cores *= PRESTIGE.resetMultipliers.cores;
    state.resources.flux *= FLUX.prestigeResetMultiplier;
    state.prestige += 1;
    state.combo = Math.min(state.combo + derived.prestigeComboBonus, ECONOMY.comboMax);
    appendLog(state, "Quantum reset complete. Prestige +1.", "system");
  }
}
