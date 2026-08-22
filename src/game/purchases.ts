import { getUpgradeDef } from "@/game/data";
import { computeDerived } from "@/game/selectors";
import type { DerivedState, GameState, UpgradeKey } from "@/game/types";
import {
  appendLog,
  canAffordUpgrade,
  deductUpgradeCost,
  getUpgradeCostTotal,
  nextUpgradeCost,
} from "@/game/utils";

/**
 * Why a purchase was refused. `undefined` on success.
 * - `"locked"` — the upgrade's `minTier` gate is above the current tier.
 * - `"maxed"` — the upgrade is at its hard cap (only Sentinel today: capped by deployed slots).
 * - `"insufficient"` — the player cannot afford the next level.
 */
export type PurchaseFailReason = "locked" | "maxed" | "insufficient";

export type PurchaseResult = { ok: boolean; reason?: PurchaseFailReason };

export type PurchaseOptions = {
  /**
   * Precomputed derived state, to avoid a redundant `computeDerived` call.
   * Only consulted when gates are enforced.
   */
  derived?: DerivedState;
  /**
   * When true (default), enforce the tier and max-level gates before buying.
   * The autobuy paths pass `false` because they apply their own candidate
   * gating upstream — and deliberately fast-track some emergency picks below
   * their `minTier` — so re-gating here would alter existing autobuy behavior.
   * Affordability is always checked regardless of this flag.
   */
  enforceGates?: boolean;
  /**
   * Custom activity-log message builder, given the upgrade label and its new
   * level. Defaults to the standard `Purchased <label> v<level>` line that the
   * autobuy ranking path has always emitted.
   */
  log?: (label: string, level: number) => string;
};

/**
 * Single shared purchase path for BOTH manual (future UI) and automatic
 * (`stepAutobuy`) upgrade buys. Performs the cost-check, `deductUpgradeCost`,
 * level increment, `stats.spent` accounting, and activity-log append that the
 * autobuy purchase has always done — in one place so manual and auto stay in
 * lockstep.
 */
export function purchaseUpgrade(
  state: GameState,
  key: UpgradeKey,
  opts: PurchaseOptions = {}
): PurchaseResult {
  const { enforceGates = true, log } = opts;
  const def = getUpgradeDef(key);

  if (enforceGates) {
    const derived = opts.derived ?? computeDerived(state);
    if (def.minTier !== undefined && derived.progression.tier < def.minTier) {
      return { ok: false, reason: "locked" };
    }
    // Sentinel is the only upgrade with a hard cap: one level per deployed slot.
    if (key === "sentinel" && state.upgrades.sentinel >= state.sentinels.length) {
      return { ok: false, reason: "maxed" };
    }
  }

  const cost = nextUpgradeCost(def, state.upgrades[key]);
  if (!canAffordUpgrade(state.resources, cost)) {
    return { ok: false, reason: "insufficient" };
  }

  deductUpgradeCost(state.resources, cost);
  state.upgrades[key] += 1;
  state.stats.spent += getUpgradeCostTotal(cost);
  appendLog(
    state,
    log ? log(def.label, state.upgrades[key]) : `Purchased ${def.label} v${state.upgrades[key]}`,
    "upgrade"
  );

  return { ok: true };
}
