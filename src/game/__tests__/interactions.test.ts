import { describe, expect, it } from "vitest";
import { OPERATOR_ACTIONS, PRIORITY_MARK, WORKER_AI } from "@/game/balance";
import { runHeadless } from "@/sim/runHeadless";
import { TICK_WRAP } from "@/game/constants";
import { idleModeButtonClass, idleModeDotClass, isIdleModeActive } from "@/components/idleModeButton";
import { createInitialGameState, spawnEnemy } from "@/game/factories";
import { chooseWorkerTarget } from "@/game/ai/workerTargeting";
import { stepWorkers } from "@/game/subsystems/movement";
import { getTurretTargetScore, stepTurrets } from "@/game/subsystems/turrets";
import { stepMissileSilos } from "@/game/subsystems/missileSilos";
import { stepSentinels } from "@/game/subsystems/sentinels";
import { computeDerived } from "@/game/selectors";
import {
  canWeaponActOnEnemy,
  cancelWorkerOrder,
  cancelWorkerOrderToNode,
  describeWorkerReason,
  isPriorityMarked,
  isSuggestionHonored,
  suggestDefensePriority,
  suggestWorkerHome,
  suggestWorkerToNode,
} from "@/game/interactions";
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

    miner.suggestedTarget = { kind: "node", id: String(far.id), createdAt: state.timers.tick };
    expect(chooseWorkerTarget(state, miner)).toBe(far.id);
    // Still en route (far away) → suggestion is retained.
    expect(miner.suggestedTarget).toBeTruthy();
  });

  it("4.5.0 FIRM COMMIT: honors the order even across path threat (anti gold-A→gold-B)", () => {
    // Anti-regression for the operator's "clicked gold A → worker went to gold B"
    // bug. Under the OLD 4.x soft nudge, a pathThreat over `suggestionMaxPathThreat`
    // re-litigated the order every tick and silently re-scored the worker onto a
    // DIFFERENT node. Firm-commit removes that gate: the ordered node is a HARD
    // order the worker COMMITS to regardless of pathThreat — safety is preserved by
    // the independent evade branch (movement.ts), not by refusing the order. This
    // test FAILS against the old pathThreat-gated behavior (picked !== far.id).
    const state = baseState();
    const miner = soloMiner(state);
    const near = makeNode({ id: 8101, x: 260, y: 260, kind: "gold" });
    const far = makeNode({ id: 8102, x: 760, y: 260, kind: "gold" });
    state.nodes = [near, far];
    miner.x = 300;
    miner.y = 260;
    miner.target = null;

    // Cluster of raiders straddling the path to the far node — enough to push
    // pathThreat well over the old `suggestionMaxPathThreat` budget.
    for (let i = 0; i < 4; i++) {
      addEnemy(state, { kind: "raider", x: 540 + i * 6, y: 260, hp: 30, role: "combat" });
    }

    miner.suggestedTarget = { kind: "node", id: String(far.id), createdAt: state.timers.tick };
    // Committed to the ORDERED node, not re-scored to the nearer `near` node.
    expect(chooseWorkerTarget(state, miner)).toBe(far.id);
    // Still en route (far away) → the order is retained until the worker mines it.
    expect(miner.suggestedTarget).toBeTruthy();
  });

  it("clears the suggestion on arrival at the node", () => {
    const state = baseState();
    const miner = soloMiner(state);
    const target = makeNode({ id: 8201, x: 500, y: 300 });
    state.nodes = [target, makeNode({ id: 8202, x: 200, y: 300 })];
    miner.x = target.x;
    miner.y = target.y; // already on top of the suggested node
    miner.target = null;

    miner.suggestedTarget = { kind: "node", id: String(target.id), createdAt: state.timers.tick };
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
    state.timers.tick = 800;

    // Created at tick 100 → 700 ticks elapsed, past the 600-tick expiry (4.1.0).
    miner.suggestedTarget = { kind: "node", id: String(far.id), createdAt: 100 };
    expect(chooseWorkerTarget(state, miner)).toBe(near.id);
    expect(miner.suggestedTarget).toBeUndefined();
  });

  it("clears the suggestion when the target node no longer exists", () => {
    const state = baseState();
    const miner = soloMiner(state);
    const near = makeNode({ id: 8351, x: 260, y: 260 });
    state.nodes = [near];
    miner.x = 300;
    miner.y = 260;
    miner.target = null;

    // Points at a node id that isn't in state.nodes → gone → cleared.
    miner.suggestedTarget = { kind: "node", id: "999999", createdAt: state.timers.tick };
    expect(chooseWorkerTarget(state, miner)).toBe(near.id);
    expect(miner.suggestedTarget).toBeUndefined();
  });

  it("4.5.0: a firm order does NOT stop an evading worker from fleeing (evade branch wins)", () => {
    // Safety proof for firm-commit: the ordered `target` may stay pinned to the
    // node under firm-commit, but the independent evade branch (movement.ts) still
    // runs FIRST and returns early, so a firmly-ordered worker keeps fleeing a real
    // threat rather than walking suicidally into it. The order persists so it
    // RETURNS after dodging, and the honest-line gate hides the cyan line while
    // evading (target pinned but worker moving away).
    const state = baseState();
    const miner = soloMiner(state);
    const oldNode = makeNode({ id: 8401, x: 180, y: 260 });
    const aheadNode = makeNode({ id: 8402, x: 390, y: 260 });
    state.nodes = [oldNode, aheadNode];
    miner.x = 260;
    miner.y = 260;
    miner.target = oldNode.id;
    miner.evadeTicks = 12;
    miner.evadeDx = -1; // already fleeing left, AWAY from the brute on the right
    miner.evadeDy = 0;
    miner.hp = miner.maxHp;
    state.timers.tick = 0;
    addEnemy(state, { kind: "brute", x: 360, y: 260, hp: 80, role: "combat" });

    // Order the worker straight into the threatened lane (fresh, unexpired).
    miner.suggestedTarget = { kind: "node", id: String(aheadNode.id), createdAt: 0 };
    const startX = miner.x;
    stepWorkers(state);

    // Evade wins for MOVEMENT: still evading, and moved AWAY (left) from the brute
    // — it did not march right into the ordered node despite the firm order.
    expect(miner.evadeTicks).toBeGreaterThan(0);
    expect(miner.x).toBeLessThan(startX);
    // The order is retained (worker returns after dodging).
    expect(miner.suggestedTarget).toBeTruthy();
    // Honest line: NOT honored while evading, even if target coincides with the order.
    expect(isSuggestionHonored(miner)).toBe(false);
  });

  it("Fix 1(a): a fresh suggestion forces an immediate retarget (next tick, not 300+)", () => {
    const state = baseState();
    const miner = soloMiner(state);
    const near = makeNode({ id: 8701, x: 300, y: 260 });
    const far = makeNode({ id: 8702, x: 760, y: 260 });
    state.nodes = [near, far];
    miner.x = 320;
    miner.y = 260;
    miner.target = near.id; // already settled on the near node...
    state.timers.tick = 7; // ...and deliberately NOT on this worker's slow retarget cadence

    // Nearest eligible worker to the far node is our solo miner.
    expect(suggestWorkerToNode(state, far.id, { x: far.x, y: far.y })).toBe(true);
    expect(miner.suggestedTarget).toMatchObject({ kind: "node", id: String(far.id) });

    // A single sim tick is enough — no waiting ~330t for the cadence window.
    stepWorkers(state);
    expect(miner.target).toBe(far.id);
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

  it("4.4.1: a corrupted node nudges an eligible miner, NOT a nearer corruption-blocked non-miner", () => {
    // Repro for the prod 4.4.0 bug: clicking a corrupted gem node stamped the
    // nearest worker of ANY kind. When that was a non-miner, the sim's corruption
    // hard-block refused the nudge every tick — the "tasked" lead-line drew while
    // the worker kept mining and energy was still spent. The selection now mirrors
    // the sim's eligibility, so the nudge lands on the miner that can accept it.
    const state = baseState();
    const node = makeNode({
      id: 8551,
      x: 500,
      y: 300,
      kind: "gems",
      corruption: WORKER_AI.corruptionHardAvoidAbove + 5, // heavily corrupted
    });
    state.nodes = [node];
    for (const a of state.agents) a.active = false;

    const runner = state.agents.find((a) => a.kind === "runner")!;
    runner.active = true;
    runner.hp = runner.maxHp;
    runner.x = node.x + 10; // NEAREST — but corruption-blocked for a non-miner
    runner.y = node.y;

    const miner = state.agents.find((a) => a.kind === "miner")!;
    miner.active = true;
    miner.hp = miner.maxHp;
    miner.x = node.x + 120; // farther, but the only eligible worker
    miner.y = node.y;

    state.resources.energy = 10;

    expect(suggestWorkerToNode(state, node.id)).toBe(true);
    // The nudge landed on the eligible miner, not the nearer non-miner.
    expect(runner.suggestedTarget).toBeUndefined();
    expect(miner.suggestedTarget).toMatchObject({ kind: "node", id: String(node.id) });
    // Energy charged exactly once.
    expect(state.resources.energy).toBe(10 - OPERATOR_ACTIONS.nudgeWorkerCost);
  });

  it("4.4.1: a corrupted node with ONLY a non-miner refuses and spends no energy", () => {
    const state = baseState();
    const node = makeNode({
      id: 8552,
      x: 500,
      y: 300,
      kind: "gems",
      corruption: WORKER_AI.corruptionHardAvoidAbove + 5,
    });
    state.nodes = [node];
    for (const a of state.agents) a.active = false;

    const drone = state.agents.find((a) => a.kind === "drone")!;
    drone.active = true;
    drone.hp = drone.maxHp;
    drone.x = node.x + 10;
    drone.y = node.y;

    state.resources.energy = 10;

    // No eligible (miner) worker → refused BEFORE charging energy.
    expect(suggestWorkerToNode(state, node.id)).toBe(false);
    expect(drone.suggestedTarget).toBeUndefined();
    expect(state.resources.energy).toBe(10); // untouched
  });

  it("4.4.1: a NON-corrupted node is unchanged — nearest-of-any-kind is nudged", () => {
    const state = baseState();
    const node = makeNode({ id: 8553, x: 500, y: 300, kind: "gems", corruption: 0 });
    state.nodes = [node];
    for (const a of state.agents) a.active = false;

    const runner = state.agents.find((a) => a.kind === "runner")!;
    runner.active = true;
    runner.hp = runner.maxHp;
    runner.x = node.x + 10; // nearest non-miner — eligible on a clean node
    runner.y = node.y;

    const miner = state.agents.find((a) => a.kind === "miner")!;
    miner.active = true;
    miner.hp = miner.maxHp;
    miner.x = node.x + 120; // farther
    miner.y = node.y;

    state.resources.energy = 10;

    expect(suggestWorkerToNode(state, node.id)).toBe(true);
    // Clean node → the nearer non-miner is nudged, exactly as before the fix.
    expect(runner.suggestedTarget).toMatchObject({ kind: "node", id: String(node.id) });
    expect(miner.suggestedTarget).toBeUndefined();
  });
});

describe("worker forced send-home (4.1.0)", () => {
  it("stamps a persistent home command marker and nulls the current target", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.target = 1234;
    state.timers.tick = 100;

    expect(suggestWorkerHome(state, miner.id)).toBe(true);
    // 4.1.0 — a real, persistent forced-return marker (movement.ts routes it home).
    expect(miner.suggestedTarget).toMatchObject({ kind: "home", createdAt: 100 });
    expect(miner.target).toBeNull();
  });

  it("routes the worker toward home, persists (no expiry), then clears on arrival", () => {
    const state = baseState();
    const miner = soloMiner(state);
    // A tempting node far from home so normal AI would keep the worker away.
    state.nodes = [makeNode({ id: 8901, x: 760, y: 260 })];
    miner.x = 700;
    miner.y = 260;
    miner.target = 8901;
    const startDist = Math.hypot(miner.homeX - miner.x, miner.homeY - miner.y);
    expect(startDist).toBeGreaterThan(WORKER_AI.suggestionArrivalRadius);

    expect(suggestWorkerHome(state, miner.id)).toBe(true);

    // A few ticks: the worker heads home and the marker persists.
    for (let i = 0; i < 5; i++) stepWorkers(state);
    expect(Math.hypot(miner.homeX - miner.x, miner.homeY - miner.y)).toBeLessThan(startDist);
    expect(miner.suggestedTarget).toMatchObject({ kind: "home" });
    expect(miner.task).toBe("Returning");

    // Keep going until it arrives; the marker clears exactly on arrival.
    let cleared = false;
    for (let i = 0; i < 2000 && !cleared; i++) {
      stepWorkers(state);
      if (miner.suggestedTarget === undefined) cleared = true;
    }
    expect(cleared).toBe(true);
    expect(Math.hypot(miner.homeX - miner.x, miner.homeY - miner.y)).toBeLessThanOrEqual(
      WORKER_AI.suggestionArrivalRadius
    );
  });

  it("still flees a real threat while returning home (flee wins, marker kept)", () => {
    const state = baseState();
    const miner = soloMiner(state);
    state.nodes = [makeNode({ id: 8951, x: 760, y: 260 })];
    miner.x = 500;
    miner.y = 260;
    miner.target = 8951;

    expect(suggestWorkerHome(state, miner.id)).toBe(true);
    // Drop a brute on top of the worker to force evasion mid-return.
    addEnemy(state, { kind: "brute", x: 512, y: 260, hp: 120, role: "combat" });
    stepWorkers(state);

    expect(miner.task).toBe("Evading");
    // The forced-home command persists through the flee (cleared only on arrival).
    expect(miner.suggestedTarget).toMatchObject({ kind: "home" });
  });

  it("leaves a fleeing / rebooting worker alone and returns false", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.rebootTicks = 20;

    expect(suggestWorkerHome(state, miner.id)).toBe(false);
    expect(miner.suggestedTarget).toBeUndefined();
  });

  it("returns false for an unknown worker id", () => {
    const state = baseState();
    expect(suggestWorkerHome(state, 999999)).toBe(false);
  });
});

describe("idle mode status indicator (4.1.0)", () => {
  it("active state tracks upgradeAutoMaster === 'all'", () => {
    expect(isIdleModeActive("all")).toBe(true);
    expect(isIdleModeActive("none")).toBe(false);
    expect(isIdleModeActive("custom")).toBe(false);
  });

  it("applies the lit/glowing treatment only when active", () => {
    expect(idleModeButtonClass(true)).toContain("shadow-");
    expect(idleModeButtonClass(true)).toContain("emerald");
    expect(idleModeButtonClass(false)).not.toContain("shadow-");
    expect(idleModeDotClass(true)).toContain("shadow-");
    expect(idleModeDotClass(false)).not.toContain("shadow-");
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

describe("priority-mark reaches silos + sentinels (4.x)", () => {
  it("silo picks a marked lower-tier enemy over an unmarked brute in range", () => {
    const state = baseState();
    const silo = state.missileSilos[0];
    silo.cooldown = 0;
    // Both within the 400px silo range of slot 0.
    const brute = addEnemy(state, { kind: "brute", x: silo.x + 30, y: silo.y - 40, hp: 200, role: "combat" });
    const mite = addEnemy(state, { kind: "mite", x: silo.x - 20, y: silo.y - 30, hp: 40, role: "combat" });

    // Unmarked: the higher-tier brute is the silo's pick.
    stepMissileSilos(state);
    expect(silo.targetId).toBe(brute.id);

    // Mark the mite → its effective tier boost outranks the brute.
    silo.cooldown = 0;
    silo.targetId = null;
    expect(suggestDefensePriority(state, mite.id)).toBe(true);
    stepMissileSilos(state);
    expect(silo.targetId).toBe(mite.id);
  });

  it("silo mark does NOT override the cloak filter", () => {
    const state = baseState();
    const silo = state.missileSilos[0];
    silo.cooldown = 0;
    const cloaked = addEnemy(state, {
      kind: "mite",
      x: silo.x,
      y: silo.y - 30,
      hp: 40,
      role: "combat",
      permanentCloak: true,
    });
    const visible = addEnemy(state, { kind: "mite", x: silo.x + 20, y: silo.y - 30, hp: 40, role: "combat" });
    suggestDefensePriority(state, cloaked.id);
    expect(isPriorityMarked(state, cloaked.id)).toBe(true);

    stepMissileSilos(state);
    // The marked cloaked enemy is never a candidate; the visible one is engaged.
    expect(silo.targetId).toBe(visible.id);
  });

  it("sentinel picks a marked enemy over an unmarked leech", () => {
    const state = baseState();
    // Isolate the mark effect: no active workers → equal nearestWorkerDist term.
    for (const a of state.agents) a.active = false;
    state.upgrades.sentinel = 1; // one live sentinel (index 0 @ 300,500)
    const sentinel = state.sentinels[0];
    sentinel.hp = 9999; // clamped to maxHp → full → not retreating
    // Same point → equal selfDist, so only the kind bonus + mark decide.
    const leech = addEnemy(state, { kind: "leech", x: 300, y: 450, hp: 120, role: "combat" });
    const mite = addEnemy(state, { kind: "mite", x: 300, y: 450, hp: 40, role: "combat" });

    stepSentinels(state);
    expect(state.sentinels[0].targetId).toBe(leech.id);

    expect(suggestDefensePriority(state, mite.id)).toBe(true);
    stepSentinels(state);
    expect(state.sentinels[0].targetId).toBe(mite.id);
  });

  it("sentinel mark does NOT override the cloak filter", () => {
    const state = baseState();
    for (const a of state.agents) a.active = false;
    state.upgrades.sentinel = 1;
    state.sentinels[0].hp = 9999;
    const cloaked = addEnemy(state, {
      kind: "brute",
      x: 300,
      y: 450,
      hp: 120,
      role: "combat",
      permanentCloak: true,
    });
    const visible = addEnemy(state, { kind: "mite", x: 300, y: 450, hp: 40, role: "combat" });
    suggestDefensePriority(state, cloaked.id);

    stepSentinels(state);
    expect(state.sentinels[0].targetId).toBe(visible.id);
  });
});

describe("no-op interaction feedback signals (4.x)", () => {
  it("suggestWorkerToNode returns false when no worker is eligible", () => {
    const state = baseState();
    const node = makeNode({ id: 8801, x: 500, y: 300 });
    state.nodes = [node];
    for (const a of state.agents) a.active = false; // no eligible worker
    expect(suggestWorkerToNode(state, node.id)).toBe(false);
  });

  it("suggestDefensePriority returns false for a dead / missing enemy", () => {
    const state = baseState();
    const dead = addEnemy(state, { kind: "raider", x: 500, y: 480, hp: 0, role: "combat" });
    expect(suggestDefensePriority(state, dead.id)).toBe(false);
    expect(suggestDefensePriority(state, 999999)).toBe(false);
  });
});

describe("canWeaponActOnEnemy honest-mark check (4.x)", () => {
  it("false for a cloaked enemy even with a live turret in range", () => {
    const state = baseState();
    state.upgrades.turret = 5;
    const turret = state.turrets[0];
    turret.x = 500;
    turret.y = 480;
    turret.range = 200;
    const cloaked = addEnemy(state, {
      kind: "mite",
      x: 510,
      y: 480,
      hp: 40,
      role: "combat",
      permanentCloak: true,
    });
    expect(canWeaponActOnEnemy(state, cloaked.id)).toBe(false);
  });

  it("false for a corruptor (no mark-consuming weapon targets it)", () => {
    const state = baseState();
    state.upgrades.sentinel = 1;
    const corruptor = addEnemy(state, { kind: "warden", x: 300, y: 450, hp: 100, role: "corruptor" });
    expect(canWeaponActOnEnemy(state, corruptor.id)).toBe(false);
  });

  it("true when a live sentinel exists for a visible combat enemy anywhere", () => {
    const state = baseState();
    state.upgrades.sentinel = 1;
    const enemy = addEnemy(state, { kind: "raider", x: 800, y: 200, hp: 60, role: "combat" });
    expect(canWeaponActOnEnemy(state, enemy.id)).toBe(true);
  });

  it("false pre-any-weapon (no turret / silo / sentinel can reach)", () => {
    const state = baseState();
    // No turret/sentinel upgrades; park the enemy far outside silo range.
    state.upgrades.turret = 0;
    state.upgrades.sentinel = 0;
    const enemy = addEnemy(state, { kind: "raider", x: 990, y: 20, hp: 60, role: "combat" });
    expect(canWeaponActOnEnemy(state, enemy.id)).toBe(false);
  });
});

describe("worker-why derivation (4.x)", () => {
  it("a fleeing worker reports 'fleeing'", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.evadeTicks = 10;
    expect(describeWorkerReason(miner)).toBe("fleeing");
  });

  it("a player-nudged worker reports 'tasked by you'", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.suggestedTarget = { kind: "node", id: "8001", createdAt: state.timers.tick };
    expect(describeWorkerReason(miner)).toBe("tasked by you");
  });

  it("a forced-home worker reports 'returning home'", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.suggestedTarget = { kind: "home", createdAt: state.timers.tick };
    expect(describeWorkerReason(miner)).toBe("returning home");
  });

  it("an ordinary working worker has no special reason", () => {
    const state = baseState();
    const miner = soloMiner(state);
    expect(describeWorkerReason(miner)).toBeNull();
  });

  it("an offline/corrupted state wins over a standing nudge", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.corrupted = true;
    miner.evadeTicks = 5;
    miner.suggestedTarget = { kind: "node", id: "8001", createdAt: state.timers.tick };
    expect(describeWorkerReason(miner)).toBe("void-infested");
  });
});

describe("honest tasked-line gating (4.4.2)", () => {
  it("honored when the worker's target matches the suggested node id", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.suggestedTarget = { kind: "node", id: "8001", createdAt: state.timers.tick };
    miner.target = 8001;
    expect(isSuggestionHonored(miner)).toBe(true);
  });

  it("NOT honored when stamped but the worker is on a different target (rejected/pending nudge)", () => {
    const state = baseState();
    const miner = soloMiner(state);
    // Nudge stamped toward 8001, but the sim keeps the worker on its own node
    // (e.g. corruption hard-block / path threat) — the line must NOT draw.
    miner.suggestedTarget = { kind: "node", id: "8001", createdAt: state.timers.tick };
    miner.target = 8002;
    expect(isSuggestionHonored(miner)).toBe(false);
  });

  it("NOT honored when stamped but the worker has no target yet", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.suggestedTarget = { kind: "node", id: "8001", createdAt: state.timers.tick };
    miner.target = null;
    expect(isSuggestionHonored(miner)).toBe(false);
  });

  it("NOT honored when there is no node suggestion at all", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.suggestedTarget = undefined;
    miner.target = 8001;
    expect(isSuggestionHonored(miner)).toBe(false);
  });

  it("NOT honored for a non-node ('home') suggestion even if target coincides", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.suggestedTarget = { kind: "home", createdAt: state.timers.tick };
    miner.target = 8001;
    expect(isSuggestionHonored(miner)).toBe(false);
  });

  it("4.5.0: NOT honored while the worker is evading, even though target == suggested", () => {
    // Under firm-commit target stays pinned to the order during a dodge, so the
    // cyan line would lie (draw to a node the worker is fleeing FROM). The gate
    // reads evadeTicks and suppresses it.
    const state = baseState();
    const miner = soloMiner(state);
    miner.suggestedTarget = { kind: "node", id: "8001", createdAt: state.timers.tick };
    miner.target = 8001;
    miner.evadeTicks = 8;
    expect(isSuggestionHonored(miner)).toBe(false);
  });

  it("4.5.0: NOT honored while a lead-drag is active, even though target == suggested", () => {
    // A press-and-hold lead pulls the worker to the finger while target stays
    // pinned; the caller passes leadActive so the cyan line hides during the drag.
    const state = baseState();
    const miner = soloMiner(state);
    miner.suggestedTarget = { kind: "node", id: "8001", createdAt: state.timers.tick };
    miner.target = 8001;
    expect(isSuggestionHonored(miner, true)).toBe(false);
    expect(isSuggestionHonored(miner, false)).toBe(true);
  });
});

describe("firm worker orders — commit, arrival, single-owner, cancel (4.5.0)", () => {
  it("corruption carve-out: a non-miner order into a node that became corrupted is CANCELLED", () => {
    const state = baseState();
    // Solo runner (non-miner) — the carve-out only applies to non-miners.
    const runner = state.agents.find((a) => a.kind === "runner" && a.active)!;
    for (const a of state.agents) if (a.id !== runner.id) a.active = false;
    const near = makeNode({ id: 8901, x: 260, y: 260, kind: "ore", corruption: 0 });
    const ordered = makeNode({ id: 8902, x: 760, y: 260, kind: "ore", corruption: 0 });
    state.nodes = [near, ordered];
    runner.x = 300;
    runner.y = 260;
    runner.target = null;

    runner.suggestedTarget = { kind: "node", id: String(ordered.id), createdAt: state.timers.tick };
    // Clean → committed to the order.
    expect(chooseWorkerTarget(state, runner)).toBe(ordered.id);
    expect(runner.suggestedTarget).toBeTruthy();

    // Corruption spreads onto the ordered node past the hard-avoid threshold.
    ordered.corruption = WORKER_AI.corruptionHardAvoidAbove + 5;
    // The order is CANCELLED (non-miner into corruption) → normal AI resumes.
    expect(chooseWorkerTarget(state, runner)).toBe(near.id);
    expect(runner.suggestedTarget).toBeUndefined();
  });

  it("corruption carve-out does NOT apply to a miner — miner keeps the order into corruption", () => {
    const state = baseState();
    const miner = soloMiner(state);
    const near = makeNode({ id: 8911, x: 260, y: 260, kind: "gold", corruption: 0 });
    const ordered = makeNode({
      id: 8912,
      x: 760,
      y: 260,
      kind: "gold",
      corruption: WORKER_AI.corruptionHardAvoidAbove + 5,
    });
    state.nodes = [near, ordered];
    miner.x = 300;
    miner.y = 260;
    miner.target = null;
    miner.suggestedTarget = { kind: "node", id: String(ordered.id), createdAt: state.timers.tick };
    expect(chooseWorkerTarget(state, miner)).toBe(ordered.id);
    expect(miner.suggestedTarget).toBeTruthy();
  });

  it("arrival clears only within the MINING contact radius, not the old 26px marker radius", () => {
    // Default node size 22 → mining contact = max(24, 22*0.52) = 24.
    const state = baseState();
    const miner = soloMiner(state);
    const ordered = makeNode({ id: 8921, x: 500, y: 300, size: 22 });
    state.nodes = [ordered, makeNode({ id: 8922, x: 200, y: 300 })];
    miner.target = null;
    miner.suggestedTarget = { kind: "node", id: String(ordered.id), createdAt: state.timers.tick };

    // 25px out — inside the OLD 26px arrival radius but NOT yet mining (24) → retained.
    miner.x = ordered.x + 25;
    miner.y = ordered.y;
    expect(chooseWorkerTarget(state, miner)).toBe(ordered.id);
    expect(miner.suggestedTarget).toBeTruthy();

    // 23px out — within the 24px mining radius → arrived & mining → cleared.
    miner.x = ordered.x + 23;
    miner.y = ordered.y;
    expect(chooseWorkerTarget(state, miner)).toBe(ordered.id);
    expect(miner.suggestedTarget).toBeUndefined();
  });

  it("single-owner: ordering worker B to a node clears worker A's order on the SAME node", () => {
    const state = baseState();
    const node = makeNode({ id: 8931, x: 500, y: 300 });
    state.nodes = [node];
    for (const a of state.agents) a.active = false;

    const workerA = state.agents[0];
    workerA.active = true;
    workerA.hp = workerA.maxHp;
    workerA.x = node.x + 120; // farther
    workerA.y = node.y;
    workerA.suggestedTarget = { kind: "node", id: String(node.id), createdAt: state.timers.tick };

    const workerB = state.agents[1];
    workerB.active = true;
    workerB.hp = workerB.maxHp;
    workerB.x = node.x + 10; // nearest → the one suggestWorkerToNode picks
    workerB.y = node.y;

    state.resources.energy = 50;
    expect(suggestWorkerToNode(state, node.id)).toBe(true);
    // B now owns the node; A's stale order on the same node was cleared.
    expect(workerB.suggestedTarget).toMatchObject({ kind: "node", id: String(node.id) });
    expect(workerA.suggestedTarget).toBeUndefined();
  });

  it("cancel toggle: clicking a tasked node clears the order and charges NO energy", () => {
    const state = baseState();
    const node = makeNode({ id: 8941, x: 500, y: 300 });
    state.nodes = [node];
    const worker = soloMiner(state);
    worker.suggestedTarget = { kind: "node", id: String(node.id), createdAt: state.timers.tick };
    state.resources.energy = 42;

    expect(cancelWorkerOrderToNode(state, node.id)).toBe(true);
    expect(worker.suggestedTarget).toBeUndefined();
    expect(state.resources.energy).toBe(42); // no charge for a cancel

    // Nothing tasked to it now → nothing to cancel.
    expect(cancelWorkerOrderToNode(state, node.id)).toBe(false);
  });

  it("cancelWorkerOrder clears a specific worker's node order (popover action)", () => {
    const state = baseState();
    const worker = soloMiner(state);
    worker.suggestedTarget = { kind: "node", id: "8951", createdAt: state.timers.tick };
    expect(cancelWorkerOrder(state, worker.id)).toBe(true);
    expect(worker.suggestedTarget).toBeUndefined();
    // A worker with no node order → false.
    expect(cancelWorkerOrder(state, worker.id)).toBe(false);
    // A 'home' order is not a node order → not cancelled by this.
    worker.suggestedTarget = { kind: "home", createdAt: state.timers.tick };
    expect(cancelWorkerOrder(state, worker.id)).toBe(false);
  });
});

describe("wrap-safe expiry across TICK_WRAP (4.0.1)", () => {
  it("a suggestion stamped just before the wrap survives it, then expires by elapsed ticks", () => {
    const state = baseState();
    const miner = soloMiner(state);
    const near = makeNode({ id: 8601, x: 260, y: 260 });
    const far = makeNode({ id: 8602, x: 720, y: 260 });
    state.nodes = [near, far];
    miner.x = 300;
    miner.y = 260;
    miner.target = null;

    // Stamped 60 ticks before the counter wraps.
    miner.suggestedTarget = { kind: "node", id: String(far.id), createdAt: TICK_WRAP - 60 };

    // 300 ticks past the wrap → 360 ticks elapsed (< 600): still honored & retained.
    state.timers.tick = 300;
    expect(chooseWorkerTarget(state, miner)).toBe(far.id);
    expect(miner.suggestedTarget).toBeTruthy();

    // 600 ticks past the wrap → 660 ticks elapsed (>= 600): expired + cleared.
    state.timers.tick = 600;
    expect(chooseWorkerTarget(state, miner)).toBe(near.id);
    expect(miner.suggestedTarget).toBeUndefined();
  });

  it("a priority mark stamped just before the wrap stays marked across it, then expires", () => {
    const state = baseState();
    const enemy = addEnemy(state, { kind: "raider", x: 520, y: 480, hp: 30, role: "combat" });

    // Mark stamped 60 ticks before the wrap (createdAt = TICK_WRAP - 60).
    state.timers.tick = TICK_WRAP - 60;
    expect(suggestDefensePriority(state, enemy.id)).toBe(true);

    // 60 ticks past the wrap → 120 ticks elapsed (< 150): still marked.
    state.timers.tick = 60;
    expect(isPriorityMarked(state, enemy.id)).toBe(true);

    // 120 ticks past the wrap → 180 ticks elapsed (>= 150): expired.
    state.timers.tick = 120;
    expect(isPriorityMarked(state, enemy.id)).toBe(false);
  });
});

describe("operator-action energy economy (4.4.0)", () => {
  it("suggestWorkerToNode deducts energy on success", () => {
    const state = baseState();
    const node = makeNode({ id: 8600, x: 500, y: 300 });
    state.nodes = [node];
    soloMiner(state);
    state.resources.energy = 10;

    expect(suggestWorkerToNode(state, node.id)).toBe(true);
    expect(state.resources.energy).toBe(10 - OPERATOR_ACTIONS.nudgeWorkerCost);
  });

  it("refuses (returns false) + spends nothing when energy is below the nudge cost", () => {
    const state = baseState();
    const node = makeNode({ id: 8601, x: 500, y: 300 });
    state.nodes = [node];
    const miner = soloMiner(state);
    state.resources.energy = OPERATOR_ACTIONS.nudgeWorkerCost - 0.01;

    expect(suggestWorkerToNode(state, node.id)).toBe(false);
    // No worker was tasked and no energy was drained.
    expect(miner.suggestedTarget).toBeUndefined();
    expect(state.resources.energy).toBe(OPERATOR_ACTIONS.nudgeWorkerCost - 0.01);
  });

  it("suggestDefensePriority deducts energy on success and refuses when starved", () => {
    const state = baseState();
    const enemy = addEnemy(state, { kind: "raider", x: 520, y: 480, hp: 30, role: "combat" });

    state.resources.energy = OPERATOR_ACTIONS.markThreatCost;
    expect(suggestDefensePriority(state, enemy.id)).toBe(true);
    expect(state.resources.energy).toBe(0);

    // Now starved: refused, and no mark churn.
    expect(suggestDefensePriority(state, enemy.id)).toBe(false);
  });

  it("suggestWorkerHome deducts energy on success and refuses when starved", () => {
    const state = baseState();
    const miner = soloMiner(state);
    miner.x = 400;
    miner.y = 200;

    state.resources.energy = OPERATOR_ACTIONS.sendHomeCost + 5;
    expect(suggestWorkerHome(state, miner.id)).toBe(true);
    expect(state.resources.energy).toBe(5);

    state.resources.energy = 0;
    miner.suggestedTarget = undefined;
    expect(suggestWorkerHome(state, miner.id)).toBe(false);
    expect(miner.suggestedTarget).toBeUndefined();
  });

  it("idle / autobuy play spends NO energy — energy only grows over a headless run", () => {
    // A headless run never calls the UI interaction helpers or sets leadPoint,
    // so the operator-action economy is invisible to it: energy is pure income.
    const result = runHeadless({ seed: 99, ticks: 1500, snapshotAt: [0, 1500], include: ["state"] });
    const start = result.snapshots[0].state!.resources.energy;
    const end = result.snapshots[1].state!.resources.energy;
    expect(end).toBeGreaterThan(start); // income accrued, nothing deducted it
  });
});
