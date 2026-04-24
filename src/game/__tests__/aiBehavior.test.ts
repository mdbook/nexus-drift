import { describe, expect, it } from "vitest";
import { ENEMY_AI, WORKER, WORKER_AI } from "@/game/balance";
import { createInitialGameState, migrateGameState, SCHEMA_VERSION, spawnEnemy } from "@/game/factories";
import { chooseFleeDirectionTarget, chooseWorkerTarget } from "@/game/ai/workerTargeting";
import { stepScouts } from "@/game/subsystems/scouts";
import { stepSentinels } from "@/game/subsystems/sentinels";
import { stepEnemies, stepWorkers } from "@/game/subsystems/movement";
import { computeAndApplyGroupDispersal } from "@/game/subsystems/workerAI";
import { pickEnemyTarget } from "@/game/targeting";
import { threatAlongPath } from "@/game/subsystems/threatField";
import type { Enemy, GameState, ResourceNode } from "@/game/types";

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

describe("worker target scoring", () => {
  it("prefers the safer of two equidistant equal-type nodes", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active);
    expect(miner).toBeTruthy();
    if (!miner) return;
    miner.x = 500;
    miner.y = 440;

    // Two ore nodes equidistant from worker, left and right.
    const nodeA: ResourceNode = {
      id: 9001,
      kind: "ore",
      x: 300,
      y: 440,
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
    const nodeB: ResourceNode = { ...nodeA, id: 9002, x: 700, y: 440 };
    state.nodes = [nodeA, nodeB];

    // Cluster of enemies beside node A — path to A should be much scarier.
    for (let i = 0; i < 4; i++) {
      addEnemy(state, { kind: "raider", x: 290 + i * 4, y: 440, hp: 30, role: "combat" });
    }

    miner.target = null;
    const picked = chooseWorkerTarget(state, miner);
    expect(picked).toBe(nodeB.id);
  });
});

describe("enemy archetype targeting", () => {
  it("flanker with a tangent-blend path produces lower threat than straight line would for adjacent approach", () => {
    const state = baseState();
    const raider = addEnemy(state, { kind: "raider", x: 100, y: 300, hp: 30, role: "combat" });
    // archetype field set by spawnEnemy via ENEMY_ARCHETYPE
    expect(raider.archetype).toBe("flanker");
  });

  it("pickEnemyTarget for a direct archetype prefers wounded workers", () => {
    const state = baseState();
    // Deactivate all agents so only the two we configure compete.
    for (const agent of state.agents) agent.active = false;
    const [a, b] = state.agents;
    a.active = true;
    b.active = true;
    a.hp = a.maxHp * 0.3;
    b.hp = b.maxHp;
    // b slightly closer — but the wounded multiplier flips a's score below b's.
    a.x = 260;
    a.y = 300;
    b.x = 230;
    b.y = 300;
    const rusher = addEnemy(state, { kind: "rusher", x: 300, y: 300, hp: 30, role: "combat" });
    const picked = pickEnemyTarget(rusher, state);
    expect(picked?.id).toBe(a.id);
  });

  it("pickEnemyTarget for a flanker prefers isolated workers", () => {
    const state = baseState();
    for (const agent of state.agents) agent.active = false;
    const workers = state.agents.slice(0, 3);
    workers.forEach((w) => {
      w.active = true;
    });
    workers[0].x = 200;
    workers[0].y = 400;
    workers[1].x = 220;
    workers[1].y = 400;
    workers[2].x = 800;
    workers[2].y = 400;
    const wisp = addEnemy(state, { kind: "wisp", x: 500, y: 400, hp: 30, role: "combat" });
    const picked = pickEnemyTarget(wisp, state);
    expect(picked?.id).toBe(workers[2].id);
  });
});

describe("squad bearing spread", () => {
  it("squadmates share the same squadId when spawned in the same bucket", () => {
    const state = baseState();
    state.timers.tick = 100;
    const a = addEnemy(state, { kind: "rusher" });
    const b = addEnemy(state, { kind: "rusher" });
    expect(a.squadId).toBe(b.squadId);
    const bucket = Math.floor(100 / ENEMY_AI.squadBucketTicks);
    expect(a.squadId).toBe(bucket);
  });
});

describe("sentinel intercept", () => {
  it("prioritizes a brute that's near a worker over a closer brute that's far from any worker", () => {
    const state = baseState();
    state.upgrades.sentinel = 1;
    for (const agent of state.agents) agent.active = false;
    const worker = state.agents[0];
    worker.active = true;
    worker.x = 850;
    worker.y = 400;
    worker.tx = 850;
    worker.ty = 400;

    state.sentinels[0].x = 300;
    state.sentinels[0].y = 400;

    addEnemy(state, { kind: "brute", x: 800, y: 400, hp: 60, role: "combat" });
    addEnemy(state, { kind: "brute", x: 240, y: 400, hp: 60, role: "combat" });

    stepSentinels(state);
    const sentinelTargetId = state.sentinels[0].targetId;
    const targeted = state.enemies.find((enemy) => enemy.id === sentinelTargetId);
    expect(targeted).toBeTruthy();
    // The near-worker brute is at x=800; that's the intended target.
    expect(targeted?.x).toBe(800);
  });
});

describe("scout node priority", () => {
  it("with finish pile larger, prefers a near-cleanse node over a deeper-corrupted one", () => {
    const state = baseState();
    state.upgrades.scout = 1;
    state.nodes = [
      {
        id: 1,
        kind: "ore",
        x: 200,
        y: 300,
        size: 22,
        hp: 40,
        maxHp: 40,
        pulse: 0,
        corruption: 15,
        corrupted: false,
        corruptedBy: null,
        spawnTick: 0,
        workTicks: 0,
      },
      {
        id: 2,
        kind: "ore",
        x: 210,
        y: 300,
        size: 22,
        hp: 40,
        maxHp: 40,
        pulse: 0,
        corruption: 10,
        corrupted: false,
        corruptedBy: null,
        spawnTick: 0,
        workTicks: 0,
      },
      {
        id: 3,
        kind: "ore",
        x: 600,
        y: 300,
        size: 22,
        hp: 40,
        maxHp: 40,
        pulse: 0,
        corruption: 60,
        corrupted: false,
        corruptedBy: null,
        spawnTick: 0,
        workTicks: 0,
      },
    ];
    state.enemies = []; // no corruptors → scouts sweep

    stepScouts(state);
    // First live scout should have been routed toward a low-corruption node
    // (finish-job bias wins when finish pile is larger).
    const target = { x: state.scouts[0].tx, y: state.scouts[0].ty };
    const finishNodeDist = Math.hypot(target.x - 200, target.y - 300);
    const deepNodeDist = Math.hypot(target.x - 600, target.y - 300);
    expect(finishNodeDist).toBeLessThan(deepNodeDist);
  });
});

describe("save migration", () => {
  it("fills new AI fields with defaults on old saves", () => {
    const fresh = createInitialGameState(7);
    // Simulate an old save: strip the new fields and set a pre-v5 schema version.
    const serialized = JSON.parse(JSON.stringify(fresh));
    serialized.schemaVersion = SCHEMA_VERSION - 1;
    for (const node of serialized.nodes) delete node.workTicks;
    for (const agent of serialized.agents) delete agent.threatMemory;
    for (const enemy of serialized.enemies) {
      delete enemy.archetype;
      delete enemy.squadId;
    }

    const migrated = migrateGameState(serialized);
    for (const node of migrated.nodes) expect(typeof node.workTicks).toBe("number");
    for (const agent of migrated.agents) expect(typeof agent.threatMemory).toBe("number");
    for (const enemy of migrated.enemies) {
      expect(typeof enemy.squadId).toBe("number");
      expect(enemy.archetype).toBeTruthy();
    }
  });
});

describe("threat field", () => {
  it("threatAlongPath weights destination higher than origin", () => {
    const enemies: Enemy[] = [{ id: 1, kind: "brute", role: "combat", hp: 20 } as Enemy];
    // Enemy right at the destination — threat near (100, 0); origin at (0,0), dest at (100,0).
    enemies[0].x = 100;
    enemies[0].y = 0;
    const enemyAtDest = threatAlongPath(0, 0, 100, 0, enemies);
    // Enemy right at the origin — same three samples but flipped.
    enemies[0].x = 0;
    const enemyAtOrigin = threatAlongPath(0, 0, 100, 0, enemies);
    expect(enemyAtDest).toBeGreaterThan(enemyAtOrigin);
  });
});

describe("sticky retarget", () => {
  it("stays on current node when candidate is only marginally better", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
    expect(miner).toBeTruthy();
    for (const a of state.agents) if (a.id !== miner.id) a.active = false;
    state.enemies = [];
    miner.x = 200;
    miner.y = 250;
    // nodeA (current) is ore at d=140; nodeB is ore at d=90 — better but not by 28%.
    const nodeA: ResourceNode = {
      id: 9001,
      kind: "ore",
      x: 340,
      y: 250,
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
    const nodeB: ResourceNode = { ...nodeA, id: 9002, x: 290, y: 250 };
    state.nodes = [nodeA, nodeB];
    miner.target = nodeA.id;
    expect(chooseWorkerTarget(state, miner)).toBe(nodeA.id);
  });

  it("switches when candidate is materially better", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
    expect(miner).toBeTruthy();
    for (const a of state.agents) if (a.id !== miner.id) a.active = false;
    state.enemies = [];
    miner.x = 200;
    miner.y = 250;
    // nodeA (current) is far ore; nodeC is nearby gold — materially better for a miner.
    const nodeA: ResourceNode = {
      id: 9001,
      kind: "ore",
      x: 400,
      y: 250,
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
    const nodeC: ResourceNode = { ...nodeA, id: 9003, kind: "gold", x: 250, y: 250 };
    state.nodes = [nodeA, nodeC];
    miner.target = nodeA.id;
    expect(chooseWorkerTarget(state, miner)).toBe(nodeC.id);
  });

  it("stays committed to a partially mined current node over a closer fresh peer", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
    expect(miner).toBeTruthy();
    for (const a of state.agents) if (a.id !== miner.id) a.active = false;
    state.enemies = [];
    miner.x = 200;
    miner.y = 250;
    const currentNode: ResourceNode = {
      id: 9001,
      kind: "ore",
      x: 340,
      y: 250,
      size: 22,
      hp: 20,
      maxHp: 40,
      pulse: 0,
      corruption: 0,
      corrupted: false,
      corruptedBy: null,
      spawnTick: 0,
      workTicks: WORKER_AI.progressActiveThreshold + 20,
    };
    const freshNode: ResourceNode = {
      ...currentNode,
      id: 9002,
      x: 290,
      hp: 40,
      workTicks: 0,
    };
    state.nodes = [currentNode, freshNode];
    miner.target = currentNode.id;
    expect(chooseWorkerTarget(state, miner)).toBe(currentNode.id);
  });
});

describe("worker evasion commitment", () => {
  it("holds a harvesting worker under one nearby enemy until actual damage lands", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
    expect(miner).toBeTruthy();
    for (const a of state.agents) if (a.id !== miner.id) a.active = false;
    const node: ResourceNode = {
      id: 9101,
      kind: "gold",
      x: 260,
      y: 260,
      size: 30,
      hp: 40,
      maxHp: 40,
      pulse: 0,
      corruption: 0,
      corrupted: false,
      corruptedBy: null,
      spawnTick: 0,
      workTicks: 0,
    };
    state.nodes = [node];
    miner.x = node.x;
    miner.y = node.y;
    miner.target = node.id;
    state.timers.tick = 1;
    const rusher = addEnemy(state, {
      kind: "rusher",
      x: node.x + WORKER_AI.harvestingEvasionRadius + 8,
      y: node.y,
      hp: 30,
      role: "combat",
    });

    stepWorkers(state);
    expect(miner.evadeTicks).toBe(0);
    expect(miner.task).not.toBe("Evading");

    miner.x = node.x;
    miner.y = node.y;
    miner.evadeTicks = 0;
    miner.evadeDx = 0;
    miner.evadeDy = -1;
    rusher.x = node.x + WORKER_AI.harvestingEvasionRadius - 2;
    rusher.y = node.y;

    stepWorkers(state);
    expect(miner.evadeTicks).toBe(0);
    expect(miner.task).not.toBe("Evading");

    miner.x = node.x;
    miner.y = node.y;
    miner.evadeTicks = 0;
    miner.evadeDx = 0;
    miner.evadeDy = -1;
    miner.damageTicks = 1;

    stepWorkers(state);
    expect(miner.evadeTicks).toBeGreaterThan(0);
    expect(miner.task).toBe("Evading");
  });

  it("3.1.3: maxed-panic flee speed sits within 12% of base work speed", () => {
    // The evade multiplier applied per tick is
    //   evadeSpeedBase + min(evadeSpeedPanicCap, panic / evadePanicDivisor)
    // Sprint cooldown is intentionally outside this clamp.
    const maxedPanicMult =
      WORKER.evadeSpeedBase + Math.min(WORKER.evadeSpeedPanicCap, 100 / WORKER.evadePanicDivisor);
    expect(maxedPanicMult).toBeLessThanOrEqual(1.12);
    expect(maxedPanicMult).toBeGreaterThanOrEqual(0.95);
  });

  it("flees a harvesting node before damage when three enemies crowd it", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
    expect(miner).toBeTruthy();
    for (const a of state.agents) if (a.id !== miner.id) a.active = false;
    const node: ResourceNode = {
      id: 9151,
      kind: "gold",
      x: 260,
      y: 260,
      size: 30,
      hp: 40,
      maxHp: 40,
      pulse: 0,
      corruption: 0,
      corrupted: false,
      corruptedBy: null,
      spawnTick: 0,
      workTicks: 0,
    };
    state.nodes = [node];
    miner.x = node.x;
    miner.y = node.y;
    miner.target = node.id;
    state.timers.tick = 1;
    for (let i = 0; i < 3; i += 1) {
      addEnemy(state, {
        kind: "rusher",
        x: node.x + WORKER_AI.harvestingEvasionRadius - 4,
        y: node.y + i * 4,
        hp: 30,
        role: "combat",
      });
    }

    stepWorkers(state);

    expect(miner.evadeTicks).toBeGreaterThan(0);
    expect(miner.task).toBe("Evading");
  });

  it("avoids choosing a node crowded by nearby enemies", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
    expect(miner).toBeTruthy();
    for (const a of state.agents) if (a.id !== miner.id) a.active = false;
    miner.x = 500;
    miner.y = 260;
    miner.target = null;
    const crowdedNode: ResourceNode = {
      id: 9181,
      kind: "gold",
      x: 360,
      y: 260,
      size: 24,
      hp: 40,
      maxHp: 40,
      pulse: 0,
      corruption: 0,
      corrupted: false,
      corruptedBy: null,
      spawnTick: 0,
      workTicks: 0,
    };
    const openNode: ResourceNode = {
      ...crowdedNode,
      id: 9182,
      x: 640,
    };
    state.nodes = [crowdedNode, openNode];
    for (let i = 0; i < 3; i += 1) {
      addEnemy(state, {
        kind: "mite",
        x: crowdedNode.x + i * 6,
        y: crowdedNode.y + 8,
        hp: 30,
        role: "combat",
      });
    }

    expect(chooseWorkerTarget(state, miner)).toBe(openNode.id);
  });

  it("ignores dying enemies when scoring worker targets", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
    expect(miner).toBeTruthy();
    for (const a of state.agents) if (a.id !== miner.id) a.active = false;
    miner.x = 500;
    miner.y = 260;
    miner.target = null;
    const visuallyCrowdedNode: ResourceNode = {
      id: 9191,
      kind: "gold",
      x: 360,
      y: 260,
      size: 24,
      hp: 40,
      maxHp: 40,
      pulse: 0,
      corruption: 0,
      corrupted: false,
      corruptedBy: null,
      spawnTick: 0,
      workTicks: 0,
    };
    const fartherOpenNode: ResourceNode = {
      ...visuallyCrowdedNode,
      id: 9192,
      x: 675,
    };
    state.nodes = [visuallyCrowdedNode, fartherOpenNode];
    for (let i = 0; i < 4; i += 1) {
      addEnemy(state, {
        kind: "mite",
        x: visuallyCrowdedNode.x + i * 4,
        y: visuallyCrowdedNode.y + 8,
        hp: 0,
        dyingTicks: 8,
        role: "combat",
      });
    }

    expect(chooseWorkerTarget(state, miner)).toBe(visuallyCrowdedNode.id);
  });

  it("retargets toward a safe node ahead while coasting out of evasion", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
    expect(miner).toBeTruthy();
    for (const a of state.agents) if (a.id !== miner.id) a.active = false;
    const oldNode: ResourceNode = {
      id: 9201,
      kind: "gold",
      x: 180,
      y: 260,
      size: 24,
      hp: 40,
      maxHp: 40,
      pulse: 0,
      corruption: 0,
      corrupted: false,
      corruptedBy: null,
      spawnTick: 0,
      workTicks: 0,
    };
    const aheadNode: ResourceNode = {
      ...oldNode,
      id: 9202,
      x: 390,
      y: 260,
    };
    state.nodes = [oldNode, aheadNode];
    miner.x = 260;
    miner.y = 260;
    miner.target = oldNode.id;
    miner.evadeTicks = 12;
    miner.evadeDx = 1;
    miner.evadeDy = 0;
    state.timers.tick = 0;

    stepWorkers(state);

    expect(miner.target).toBe(aheadNode.id);
  });

  it("does not retarget toward a node when the flee path ahead is threatened", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
    expect(miner).toBeTruthy();
    for (const a of state.agents) if (a.id !== miner.id) a.active = false;
    const oldNode: ResourceNode = {
      id: 9301,
      kind: "gold",
      x: 180,
      y: 260,
      size: 24,
      hp: 40,
      maxHp: 40,
      pulse: 0,
      corruption: 0,
      corrupted: false,
      corruptedBy: null,
      spawnTick: 0,
      workTicks: 0,
    };
    const aheadNode: ResourceNode = {
      ...oldNode,
      id: 9302,
      x: 390,
      y: 260,
    };
    state.nodes = [oldNode, aheadNode];
    miner.x = 260;
    miner.y = 260;
    miner.target = oldNode.id;
    miner.evadeTicks = 12;
    miner.evadeDx = 1;
    miner.evadeDy = 0;
    state.timers.tick = 0;
    addEnemy(state, {
      kind: "brute",
      x: 360,
      y: 260,
      hp: 80,
      role: "combat",
    });

    stepWorkers(state);

    expect(miner.target).toBe(oldNode.id);
  });

  it("ignores dying enemies when choosing a flee-direction target", () => {
    const state = baseState();
    const miner = state.agents.find((a) => a.kind === "miner" && a.active)!;
    expect(miner).toBeTruthy();
    for (const a of state.agents) if (a.id !== miner.id) a.active = false;
    const oldNode: ResourceNode = {
      id: 9401,
      kind: "gold",
      x: 180,
      y: 260,
      size: 24,
      hp: 40,
      maxHp: 40,
      pulse: 0,
      corruption: 0,
      corrupted: false,
      corruptedBy: null,
      spawnTick: 0,
      workTicks: 0,
    };
    const aheadNode: ResourceNode = {
      ...oldNode,
      id: 9402,
      x: 390,
      y: 260,
    };
    state.nodes = [oldNode, aheadNode];
    miner.x = 260;
    miner.y = 260;
    miner.target = oldNode.id;
    miner.evadeDx = 1;
    miner.evadeDy = 0;
    addEnemy(state, {
      kind: "brute",
      x: 360,
      y: 260,
      hp: 0,
      dyingTicks: 8,
      role: "combat",
    });

    expect(chooseFleeDirectionTarget(state, miner)).toBe(aheadNode.id);
  });
});

describe("ambusher dash", () => {
  it("does not trigger outside dash range", () => {
    const state = baseState();
    for (const a of state.agents) a.active = false;
    const worker = state.agents[0];
    worker.active = true;
    worker.x = 500;
    worker.y = 400;
    worker.tx = 500;
    worker.ty = 400;
    const sapper = addEnemy(state, { kind: "sapper", x: 200, y: 400, hp: 30, role: "combat" });
    // distance = 300 > 90 (ENEMY_AI.ambusherDashTrigger) — dash should not fire.
    stepEnemies(state);
    expect(sapper.dashTicks ?? 0).toBe(0);
  });

  it("triggers and counts down when inside dash range", () => {
    const state = baseState();
    for (const a of state.agents) a.active = false;
    const worker = state.agents[0];
    worker.active = true;
    worker.x = 300;
    worker.y = 400;
    worker.tx = 300;
    worker.ty = 400;
    const sapper = addEnemy(state, { kind: "sapper", x: 270, y: 400, hp: 30, role: "combat" });
    // distance = 30 < 90 (ENEMY_AI.ambusherDashTrigger) — should trigger.
    stepEnemies(state);
    expect(sapper.dashTicks).toBe(ENEMY_AI.ambusherDashDuration);
    stepEnemies(state);
    expect(sapper.dashTicks).toBe(ENEMY_AI.ambusherDashDuration - 1);
  });
});

describe("brute movement stability", () => {
  it("keeps a brute on its current valid target between target refresh ticks", () => {
    const state = baseState();
    for (const agent of state.agents) agent.active = false;
    const currentTarget = state.agents[0];
    const closerTarget = state.agents[1];
    currentTarget.active = true;
    closerTarget.active = true;
    currentTarget.x = 820;
    currentTarget.y = 360;
    closerTarget.x = 180;
    closerTarget.y = 360;
    const brute = addEnemy(state, {
      kind: "brute",
      x: 120,
      y: 360,
      hp: 80,
      role: "combat",
      targetId: currentTarget.id,
    });
    state.timers.tick = 1;

    stepEnemies(state);

    expect(brute.targetId).toBe(currentTarget.id);
  });
});

describe("ghost reposition", () => {
  it("moves toward a point behind the worker during cloak window", () => {
    const state = baseState();
    for (const a of state.agents) a.active = false;
    const worker = state.agents[0];
    worker.active = true;
    worker.x = 500;
    worker.y = 300;
    worker.tx = 700;
    worker.ty = 300; // heading right
    // cloakPhase = 50/120 ≈ 0.417, inside [ghostRepositionPhaseStart, ghostRepositionPhaseEnd].
    const phantom = addEnemy(state, {
      kind: "phantom",
      x: 600,
      y: 300,
      hp: 30,
      role: "combat",
      cloakTicks: 50,
    });
    const xBefore = phantom.x;
    stepEnemies(state);
    // Ghost repositions behind the worker's travel direction — should move leftward (x decreases).
    expect(phantom.x).toBeLessThan(xBefore);
  });
});

describe("group dispersal", () => {
  it("pushes same-kind workers apart when crowded", () => {
    const state = baseState();
    const miners = state.agents.filter((a) => a.kind === "miner");
    miners.forEach((m, i) => {
      m.active = true;
      m.evadeTicks = 0;
      m.x = 300 + i * 5; // slight offset so centroid repulsion is non-zero
      m.y = 300;
    });
    const meanDist = (ms: typeof miners) =>
      (Math.hypot(ms[0].x - ms[1].x, ms[0].y - ms[1].y) +
        Math.hypot(ms[0].x - ms[2].x, ms[0].y - ms[2].y) +
        Math.hypot(ms[1].x - ms[2].x, ms[1].y - ms[2].y)) /
      3;
    const before = meanDist(miners);
    computeAndApplyGroupDispersal(state.agents);
    expect(meanDist(miners)).toBeGreaterThan(before);
  });

  it("does not move workers that are already spread out", () => {
    const state = baseState();
    const miners = state.agents.filter((a) => a.kind === "miner");
    miners[0].active = true;
    miners[0].x = 100;
    miners[0].y = 300;
    miners[0].evadeTicks = 0;
    miners[1].active = true;
    miners[1].x = 400;
    miners[1].y = 300;
    miners[1].evadeTicks = 0;
    miners[2].active = true;
    miners[2].x = 700;
    miners[2].y = 300;
    miners[2].evadeTicks = 0;
    // All pairwise distances ≥ 300 >> groupRepelRadius (130) — no dispersal should fire.
    const xBefore = miners.map((m) => m.x);
    const yBefore = miners.map((m) => m.y);
    computeAndApplyGroupDispersal(state.agents);
    miners.forEach((m, i) => {
      expect(m.x).toBe(xBefore[i]);
      expect(m.y).toBe(yBefore[i]);
    });
  });
});
