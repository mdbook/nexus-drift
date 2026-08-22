import { describe, expect, it } from "vitest";
import { PRIORITY_MARK } from "@/game/balance";
import { createInitialGameState, spawnEnemy } from "@/game/factories";
import { chooseWorkerTarget } from "@/game/ai/workerTargeting";
import { stepWorkers } from "@/game/subsystems/movement";
import { getTurretTargetScore, stepTurrets } from "@/game/subsystems/turrets";
import { computeDerived } from "@/game/selectors";
import { isPriorityMarked, suggestDefensePriority, suggestWorkerToNode } from "@/game/interactions";
import type { Enemy, GameState, ResourceNode } from "@/game/types";

function baseState(): GameState {
  const state = createInitialGameState(4242);
  state.enemies = [];
  return state;
}

function soloMiner(state: GameState) {
  const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
  for (const a of state.agents) if (a.id !== miner.id) a.active = false;
  return miner;
}

function makeNode(partial: Partial<ResourceNode> & Pick<ResourceNode, "id" | "x" | "y">): ResourceNode {
  return {
    kind: "gold",
    size: 22,
    hp: 40,
    maxHp: 40,
    pulse: 0,
    corruption: 0,
    corrupted: false,
    corruptedBy: null,
    spawnTick: 0,
    workTicks: 0,
    ...partial,
  };
}

function addEnemy(state: GameState, partial: Partial<Enemy>): Enemy {
  const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, partial.kind ?? "mite", state.timers.tick);
  Object.assign(enemy, partial);
  state.enemies.push(enemy);
  return enemy;
}

describe("worker suggestion (4.0 phase 2)", () => {
  it("honors a suggested node the worker would not otherwise pick, when the path is safe", () => {
    const state = baseState();
    const miner = soloMiner(state);
    const near = makeNode({ id: 8001, x: 260, y: 260 });
    const far = makeNode({ id: 8002, x: 720, y: 260 });
    state.nodes = [near, far];
    miner.x = 300;
    miner.y = 260;
    miner.target = null;

    // With no suggestion the worker picks the nearer node.
    expect(chooseWorkerTarget(state, miner)).toBe(near.id);

    miner.suggestedTarget = { kind: "node", id: String(far.id), expiresAt: state.timers.tick + 120 };
    expect(chooseWorkerTarget(state, miner)).toBe(far.id);
    // Still en route (far away) → suggestion is retained.
    expect(miner.suggestedTarget).toBeTruthy();
  });

  it("rejects and clears the suggestion when the path to it crosses threat", () => {
    const state = baseState();
    const miner = soloMiner(state);
    const near = makeNode({ id: 8101, x: 260, y: 260, kind: "gold" });
    const far = makeNode({ id: 8102, x: 760, y: 260, kind: "gold" });
    state.nodes = [near, far];
    miner.x = 300;
    miner.y = 260;
    miner.target = null;

    // Cluster of raiders straddling the path to the far node.
    for (let i = 0; i < 4; i++) {
      addEnemy(state, { kind: "raider", x: 540 + i * 6, y: 260, hp: 30, role: "combat" });
    }

    miner.suggestedTarget = { kind: "node", id: String(far.id), expiresAt: state.timers.tick + 120 };
    const picked = chooseWorkerTarget(state, miner);
    expect(picked).not.toBe(far.id);
    expect(miner.suggestedTarget).toBeUndefined();
  });

  it("clears the suggestion on arrival at the node", () => {
    const state = baseState();
    const miner = soloMiner(state);
    const target = makeNode({ id: 8201, x: 500, y: 300 });
    state.nodes = [target, makeNode({ id: 8202, x: 200, y: 300 })];
    miner.x = target.x;
    miner.y = target.y; // already on top of the suggested node
    miner.target = null;

    miner.suggestedTarget = { kind: "node", id: String(target.id), expiresAt: state.timers.tick + 120 };
    expect(chooseWorkerTarget(state, miner)).toBe(target.id);
    expect(miner.suggestedTarget).toBeUndefined();
  });

  it("clears an expired suggestion and falls back to normal scoring", () => {
    const state = baseState();
    const miner = soloMiner(state);
    const near = makeNode({ id: 8301, x: 260, y: 260 });
    const far = makeNode({ id: 8302, x: 720, y: 260 });
    state.nodes = [near, far];
    miner.x = 300;
    miner.y = 260;
    miner.target = null;
    state.timers.tick = 500;

    miner.suggestedTarget = { kind: "node", id: String(far.id), expiresAt: 400 }; // already past
    expect(chooseWorkerTarget(state, miner)).toBe(near.id);
    expect(miner.suggestedTarget).toBeUndefined();
  });

  it("does not let a suggestion pull an evading worker through threat (flee rules win)", () => {
    // Extends §Worker Flee-Retarget Invariant: even with a player nudge toward
    // the node straight ahead, a threatened flee lane keeps the worker off it.
    const state = baseState();
    const miner = soloMiner(state);
    const oldNode = makeNode({ id: 8401, x: 180, y: 260 });
    const aheadNode = makeNode({ id: 8402, x: 390, y: 260 });
    state.nodes = [oldNode, aheadNode];
    miner.x = 260;
    miner.y = 260;
    miner.target = oldNode.id;
    miner.evadeTicks = 12;
    miner.evadeDx = 1;
    miner.evadeDy = 0;
    state.timers.tick = 0;
    addEnemy(state, { kind: "brute", x: 360, y: 260, hp: 80, role: "combat" });

    // Nudge the worker straight into the threatened lane.
    miner.suggestedTarget = { kind: "node", id: String(aheadNode.id), expiresAt: 120 };
    stepWorkers(state);

    // The threatened ahead node never becomes the target; the nudge is rejected.
    expect(miner.target).not.toBe(aheadNode.id);
    expect(miner.suggestedTarget).toBeUndefined();
  });

  it("suggestWorkerToNode stamps the nearest eligible worker and skips fleeing/rebooting ones", () => {
    const state = baseState();
    const node = makeNode({ id: 8501, x: 500, y: 300 });
    state.nodes = [node];
    const workers = state.agents.filter((a) => a.active);
    // Park a rebooting worker right on the node — it must be skipped.
    const rebooting = workers[0];
    rebooting.x = node.x;
    rebooting.y = node.y;
    rebooting.rebootTicks = 30;
    // A healthy worker a bit farther is the valid nearest pick.
    const healthy = workers[1];
    healthy.x = node.x + 40;
    healthy.y = node.y;

    expect(suggestWorkerToNode(state, node.id)).toBe(true);
    expect(rebooting.suggestedTarget).toBeUndefined();
    expect(healthy.suggestedTarget).toMatchObject({ kind: "node", id: String(node.id) });
  });
});

describe("defense priority marks (4.0 phase 2)", () => {
  it("raises a marked enemy's turret priority (lower score) without touching others", () => {
    const state = baseState();
    const turret = state.turrets[0];
    turret.x = 500;
    turret.y = 480;
    const enemy = addEnemy(state, { kind: "raider", x: 520, y: 480, hp: 30, role: "combat" });

    const before = getTurretTargetScore(state, turret, enemy);
    expect(suggestDefensePriority(state, enemy.id)).toBe(true);
    const after = getTurretTargetScore(state, turret, enemy);

    expect(after).toBeCloseTo(before - PRIORITY_MARK.turretScoreBonus, 5);
    expect(isPriorityMarked(state, enemy.id)).toBe(true);
  });

  it("does not override the cloak filter — a marked cloaked enemy is never fired on", () => {
    const state = baseState();
    state.upgrades.turret = 5; // ensure at least one active turret with usable range
    const derived = computeDerived(state);
    expect(derived.activeTurrets).toBeGreaterThan(0);
    const turret = state.turrets[0];
    turret.x = 500;
    turret.y = 480;
    turret.cooldown = 0;

    // Only target in range is cloaked. Marking it must not make it targetable.
    const cloaked = addEnemy(state, {
      kind: "mite",
      x: 512,
      y: 480,
      hp: 40,
      role: "combat",
      permanentCloak: true,
    });
    suggestDefensePriority(state, cloaked.id);
    expect(isPriorityMarked(state, cloaked.id)).toBe(true);

    const projectilesBefore = state.projectiles.length;
    stepTurrets(state);
    expect(cloaked.hp).toBe(40); // untouched
    expect(state.projectiles.length).toBe(projectilesBefore); // no shot fired

    // Positive control: an identical but visible enemy IS engaged.
    const visible = addEnemy(state, { kind: "mite", x: 512, y: 480, hp: 40, role: "combat" });
    turret.cooldown = 0;
    stepTurrets(state);
    expect(visible.hp).toBeLessThan(40);
  });
});
