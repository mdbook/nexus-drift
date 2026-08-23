import { describe, expect, it } from "vitest";
import { cloneGameState, createInitialGameState, spawnEnemy } from "@/game/factories";
import { OPERATOR_ACTIONS } from "@/game/balance";
import { setLeadPoint, clearLeadPoint } from "@/game/interactions";
import { stepLeadDrain, stepWorkers } from "@/game/subsystems/movement";
import type { Enemy, GameState, ResourceNode } from "@/game/types";
import { dist } from "@/game/utils";

function baseState(): GameState {
  const state = createInitialGameState(1234);
  state.enemies = [];
  return state;
}

function addEnemy(state: GameState, partial: Partial<Enemy>): Enemy {
  const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, partial.kind ?? "mite", state.timers.tick);
  Object.assign(enemy, partial);
  state.enemies.push(enemy);
  return enemy;
}

const soloNode: ResourceNode = {
  id: 9100,
  kind: "ore",
  x: 100,
  y: 300,
  size: 22,
  hp: 40,
  maxHp: 40,
  pulse: 0,
  corruption: 0,
  corrupted: false,
  corruptedBy: null,
  spawnTick: 0,
  workTicks: 0,
};

describe("press-and-hold lead point", () => {
  it("biases an eligible worker's next step toward the lead point (closer than without it)", () => {
    const state = baseState();
    state.nodes = [{ ...soloNode }];
    const miner = state.agents.find((a) => a.kind === "miner" && a.active);
    expect(miner).toBeTruthy();
    if (!miner) return;
    // Worker centered; its only node is far LEFT, the lead point is far RIGHT.
    miner.x = 500;
    miner.y = 300;
    miner.target = null;
    miner.evadeTicks = 0;
    miner.damageTicks = 0;

    const leadXY = { x: 900, y: 300 };

    const withLead = cloneGameState(state);
    setLeadPoint(withLead, leadXY.x, leadXY.y);
    stepWorkers(withLead);

    const withoutLead = cloneGameState(state);
    stepWorkers(withoutLead);

    const led = withLead.agents.find((a) => a.id === miner.id)!;
    const free = withoutLead.agents.find((a) => a.id === miner.id)!;

    const ledDist = dist(led.x, led.y, leadXY.x, leadXY.y);
    const freeDist = dist(free.x, free.y, leadXY.x, leadXY.y);

    // The led worker is meaningfully closer to the held point than the one that
    // followed its normal node target (which sits in the opposite direction).
    expect(ledDist).toBeLessThan(freeDist);
    expect(led.x).toBeGreaterThan(miner.x); // moved toward the lead (rightward)
    expect(led.task).toBe("Following");
  });

  it("nearer workers respond harder than far ones (distance falloff)", () => {
    const state = baseState();
    state.nodes = [{ ...soloNode }];
    const miners = state.agents.filter((a) => a.kind === "miner");
    // Two miners at different distances from the same lead point, both eligible.
    const near = miners[0];
    const far = miners[1];
    for (const m of [near, far]) {
      m.active = true;
      m.target = null;
      m.evadeTicks = 0;
      m.damageTicks = 0;
      m.veteranRank = 0;
      m.speedMod = 1;
    }
    const leadXY = { x: 500, y: 300 };
    near.x = 460; // 40px away
    near.y = 300;
    far.x = 200; // 300px away
    far.y = 300;

    const nearBefore = dist(near.x, near.y, leadXY.x, leadXY.y);
    const farBefore = dist(far.x, far.y, leadXY.x, leadXY.y);

    setLeadPoint(state, leadXY.x, leadXY.y);
    stepWorkers(state);

    const nearAfter = dist(near.x, near.y, leadXY.x, leadXY.y);
    const farAfter = dist(far.x, far.y, leadXY.x, leadXY.y);

    // Fractional closing: the near worker eats a larger fraction of its gap.
    const nearClosedFrac = (nearBefore - nearAfter) / nearBefore;
    const farClosedFrac = (farBefore - farAfter) / farBefore;
    expect(nearClosedFrac).toBeGreaterThan(farClosedFrac);
  });

  it("a fleeing worker ignores the lead point (flee/survival wins)", () => {
    const state = baseState();
    state.nodes = [{ ...soloNode }];
    const miner = state.agents.find((a) => a.kind === "miner" && a.active);
    expect(miner).toBeTruthy();
    if (!miner) return;
    miner.x = 500;
    miner.y = 300;
    miner.target = null;
    miner.evadeTicks = 0;
    miner.damageTicks = 0;

    // A live threat just to the RIGHT, inside the evade-enter radius.
    addEnemy(state, { kind: "raider", x: 538, y: 300, hp: 30, role: "combat" });
    // Lead point sits BEYOND the threat — honoring it would walk into the enemy.
    setLeadPoint(state, 700, 300);

    stepWorkers(state);

    // Survival wins: the worker evades AWAY from the enemy (leftward), not toward
    // the lead point, and is in the Evading state rather than Following.
    expect(miner.task).toBe("Evading");
    expect(miner.evadeTicks).toBeGreaterThan(0);
    expect(miner.x).toBeLessThan(500);
  });

  it("is a strict no-op when no lead point is set (neutrality)", () => {
    const state = baseState();
    state.nodes = [{ ...soloNode }];
    const miner = state.agents.find((a) => a.kind === "miner" && a.active);
    if (!miner) return;
    miner.x = 500;
    miner.y = 300;
    miner.target = null;

    // Two identical clones, neither carrying a lead point, must step identically.
    const a = cloneGameState(state);
    const b = cloneGameState(state);
    expect(a.leadPoint).toBeUndefined();
    stepWorkers(a);
    stepWorkers(b);

    for (let i = 0; i < a.agents.length; i++) {
      expect(a.agents[i].x).toBe(b.agents[i].x);
      expect(a.agents[i].y).toBe(b.agents[i].y);
      expect(a.agents[i].task).toBe(b.agents[i].task);
    }
    // No worker ever enters the lead branch without a lead point.
    expect(a.agents.some((agent) => agent.task === "Following")).toBe(false);
  });

  it("setLeadPoint clamps into the field; clearLeadPoint removes it", () => {
    const state = baseState();
    setLeadPoint(state, 5000, -200);
    expect(state.leadPoint).toEqual({ x: 1000, y: 0 });
    clearLeadPoint(state);
    expect(state.leadPoint).toBeUndefined();
  });
});

describe("drag-to-lead energy drain (4.4.0)", () => {
  it("drains energy each tick while the lead is held", () => {
    const state = baseState();
    setLeadPoint(state, 500, 300);
    state.resources.energy = 10;

    stepLeadDrain(state);
    expect(state.resources.energy).toBeCloseTo(10 - OPERATOR_ACTIONS.leadDrainPerTick, 6);
    stepLeadDrain(state);
    expect(state.resources.energy).toBeCloseTo(10 - 2 * OPERATOR_ACTIONS.leadDrainPerTick, 6);
    // The lead is still held (energy comfortably above the per-tick cost).
    expect(state.leadPoint).toBeDefined();
  });

  it("auto-releases the lead at 0 and never goes negative", () => {
    const state = baseState();
    setLeadPoint(state, 500, 300);
    // Just under one tick's drain — the next tick can't be covered.
    state.resources.energy = OPERATOR_ACTIONS.leadDrainPerTick / 2;

    stepLeadDrain(state);
    expect(state.resources.energy).toBe(0); // floored, not negative
    expect(state.leadPoint).toBeUndefined(); // lead auto-released
  });

  it("is a strict no-op when no lead point is set (headless neutrality)", () => {
    const state = baseState();
    expect(state.leadPoint).toBeUndefined();
    state.resources.energy = 42;
    stepLeadDrain(state);
    expect(state.resources.energy).toBe(42); // untouched on the headless path
  });
});
