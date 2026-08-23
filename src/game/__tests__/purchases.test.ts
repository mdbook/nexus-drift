import { describe, expect, it } from "vitest";
import { AUTO_TICK } from "@/game/constants";
import { createInitialGameState } from "@/game/factories";
import { getUpgradeDef } from "@/game/data";
import { nextUpgradeCost } from "@/game/utils";
import {
  purchaseFailReason,
  purchaseUpgrade,
  setUpgradeAutoFlag,
  setUpgradeAutoMaster,
} from "@/game/purchases";
import { computeDerived } from "@/game/selectors";
import { stepAutobuy } from "@/game/subsystems/autobuy";
import type { GameState, ResourceMap } from "@/game/types";

const RICH: ResourceMap = {
  gold: 1_000_000,
  ore: 1_000_000,
  gems: 1_000_000,
  energy: 1_000_000,
  cores: 1_000_000,
  flux: 1_000_000,
};

/** Run `stepAutobuy` for N autobuy-gated ticks with no trace sink. */
function runAutobuy(state: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    state.timers.auto = AUTO_TICK;
    stepAutobuy(state);
  }
}

describe("purchaseUpgrade", () => {
  it("buys an affordable upgrade: increments level, spends resources, logs it", () => {
    const state = createInitialGameState(1);
    const goldBefore = state.resources.gold;
    const spentBefore = state.stats.spent;

    const res = purchaseUpgrade(state, "miner");

    expect(res).toEqual({ ok: true });
    expect(state.upgrades.miner).toBe(1);
    expect(state.resources.gold).toBeLessThan(goldBefore);
    expect(state.stats.spent).toBeGreaterThan(spentBefore);
    expect(state.log[0]?.category).toBe("upgrade");
    expect(state.log[0]?.message).toBe("Purchased Auto Miner v1");
  });

  it("refuses when resources are insufficient (no state mutation)", () => {
    const state = createInitialGameState(1);
    state.resources.gold = 0;
    state.resources.ore = 0;

    const res = purchaseUpgrade(state, "miner");

    expect(res).toEqual({ ok: false, reason: "insufficient" });
    expect(state.upgrades.miner).toBe(0);
    expect(state.stats.spent).toBe(0);
  });

  it("refuses a tier-gated upgrade below its minTier", () => {
    const state = createInitialGameState(1);
    state.resources = { ...RICH };
    // sentinel.minTier = 5; force the derived tier below it.
    const derived = computeDerived(state);
    derived.progression.tier = 0;

    const res = purchaseUpgrade(state, "sentinel", { derived });

    expect(res).toEqual({ ok: false, reason: "locked" });
    expect(state.upgrades.sentinel).toBe(0);
  });

  it("refuses when already at max level (sentinel is capped by deployed slots)", () => {
    const state = createInitialGameState(1);
    state.resources = { ...RICH };
    state.upgrades.sentinel = state.sentinels.length; // at cap
    const derived = computeDerived(state);
    derived.progression.tier = 5; // clear the minTier gate so we hit the cap check

    const res = purchaseUpgrade(state, "sentinel", { derived });

    expect(res).toEqual({ ok: false, reason: "maxed" });
    expect(state.upgrades.sentinel).toBe(state.sentinels.length);
  });

  it("enforceGates:false skips tier/max gates but still checks affordability", () => {
    const state = createInitialGameState(1);
    state.resources = { ...RICH };
    const derived = computeDerived(state);
    derived.progression.tier = 0; // would be "locked" if gates were enforced

    const bought = purchaseUpgrade(state, "sentinel", { enforceGates: false, derived });
    expect(bought).toEqual({ ok: true });
    expect(state.upgrades.sentinel).toBe(1);

    state.resources.gold = 0;
    state.resources.cores = 0;
    const broke = purchaseUpgrade(state, "sentinel", { enforceGates: false });
    expect(broke).toEqual({ ok: false, reason: "insufficient" });
  });

  it("a gem-costed upgrade (reactor) actually requires gems, not just gold (4.4.0 sink)", () => {
    const state = createInitialGameState(1);
    const cost = nextUpgradeCost(getUpgradeDef("reactor"), 0);
    expect(cost.gems ?? 0).toBeGreaterThan(0); // reactor now carries a gem cost

    // Plenty of gold, zero gems → refused for insufficiency.
    state.resources = { ...RICH, gems: 0 };
    expect(purchaseUpgrade(state, "reactor", { enforceGates: false })).toEqual({
      ok: false,
      reason: "insufficient",
    });

    // Give it exactly the gems it needs → the buy goes through and spends them.
    state.resources.gems = cost.gems!;
    expect(purchaseUpgrade(state, "reactor", { enforceGates: false })).toEqual({ ok: true });
    expect(state.upgrades.reactor).toBe(1);
    expect(state.resources.gems).toBe(0); // gems were actually consumed
  });
});

describe("manual purchase UI store actions (4.0 phase 1b)", () => {
  it("a manual buy deducts cost, increments level, and logs a distinct operator message", () => {
    const state = createInitialGameState(1);
    const goldBefore = state.resources.gold;

    // Mirrors the App onPurchase mutateGame closure.
    const res = purchaseUpgrade(state, "miner", {
      log: (label, level) => `Operator purchased ${label} v${level}.`,
    });

    expect(res).toEqual({ ok: true });
    expect(state.upgrades.miner).toBe(1);
    expect(state.resources.gold).toBeLessThan(goldBefore);
    expect(state.log[0]?.category).toBe("upgrade");
    expect(state.log[0]?.message).toBe("Operator purchased Auto Miner v1.");
  });

  it("purchaseFailReason drives the disabled-tile reason: undefined | insufficient | locked | maxed", () => {
    const affordable = createInitialGameState(1);
    expect(purchaseFailReason(affordable, "miner")).toBeUndefined();

    const broke = createInitialGameState(1);
    broke.resources.gold = 0;
    broke.resources.ore = 0;
    expect(purchaseFailReason(broke, "miner")).toBe("insufficient");

    const locked = createInitialGameState(1);
    locked.resources = { ...RICH };
    const lockedDerived = computeDerived(locked);
    lockedDerived.progression.tier = 0; // sentinel.minTier is above 0
    expect(purchaseFailReason(locked, "sentinel", { derived: lockedDerived })).toBe("locked");

    const maxed = createInitialGameState(1);
    maxed.resources = { ...RICH };
    maxed.upgrades.sentinel = maxed.sentinels.length;
    const maxedDerived = computeDerived(maxed);
    maxedDerived.progression.tier = 5; // clear the tier gate so the cap check is reached
    expect(purchaseFailReason(maxed, "sentinel", { derived: maxedDerived })).toBe("maxed");
  });

  it("setUpgradeAutoFlag flips a single upgrade's autobuy opt-in", () => {
    const state = createInitialGameState(1);
    expect(state.upgradeAutoFlags.miner).toBeUndefined();

    setUpgradeAutoFlag(state, "miner", true);
    expect(state.upgradeAutoFlags.miner).toBe(true);

    setUpgradeAutoFlag(state, "miner", false);
    expect(state.upgradeAutoFlags.miner).toBe(false);
  });

  it("setUpgradeAutoMaster switches the master mode", () => {
    const state = createInitialGameState(1);
    setUpgradeAutoMaster(state, "all");
    expect(state.upgradeAutoMaster).toBe("all");
    setUpgradeAutoMaster(state, "custom");
    expect(state.upgradeAutoMaster).toBe("custom");
    setUpgradeAutoMaster(state, "none");
    expect(state.upgradeAutoMaster).toBe("none");
  });
});

describe("autobuy respects the master/flag settings", () => {
  it('master="none" makes zero purchases across many ticks', () => {
    const state = createInitialGameState(1234);
    state.enemies = [];
    state.upgradeAutoMaster = "none";
    state.resources = { ...RICH };
    const before = { ...state.upgrades };
    const spentBefore = state.stats.spent;

    runAutobuy(state, 25);

    expect(state.upgrades).toEqual(before);
    expect(state.stats.spent).toBe(spentBefore);
  });

  it('master="custom" never buys a flagged-off upgrade while buying enabled ones', () => {
    const state = createInitialGameState(1234);
    state.enemies = [];
    state.upgradeAutoMaster = "custom";
    // miner (the cheapest first pick) is intentionally OFF; others are on.
    state.upgradeAutoFlags = { drill: true, reactor: true, bot: true };
    state.resources = { ...RICH };

    runAutobuy(state, 40);

    expect(state.upgrades.miner).toBe(0); // flagged off → never auto-bought
    // At least one enabled upgrade was actually bought, so the test isn't vacuous.
    expect(state.upgrades.drill + state.upgrades.reactor).toBeGreaterThan(0);
  });

  it('master="all" buys the cheapest upgrade first (pre-4.0 behavior intact)', () => {
    const state = createInitialGameState(1234);
    state.enemies = [];
    state.upgradeAutoMaster = "all";
    state.resources = { ...RICH };

    runAutobuy(state, 1);

    // Auto Miner is the cheapest rung, so the "all" ranking buys it first.
    expect(state.upgrades.miner).toBe(1);
  });
});
