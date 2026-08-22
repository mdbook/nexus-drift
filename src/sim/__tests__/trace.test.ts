import { describe, expect, it } from "vitest";
import { createInitialGameState, spawnEnemy } from "@/game/factories";
import { chooseFleeDirectionTarget, chooseWorkerTarget } from "@/game/ai/workerTargeting";
import { stepAutobuy } from "@/game/subsystems/autobuy";
import { AUTO_TICK } from "@/game/constants";
import type { Enemy, GameState, ResourceNode } from "@/game/types";
import { createTraceCollector } from "@/sim/trace";
import { runHeadless } from "@/sim/runHeadless";

function addEnemy(state: GameState, partial: Partial<Enemy>): Enemy {
  const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, partial.kind ?? "mite", state.timers.tick);
  Object.assign(enemy, partial);
  state.enemies.push(enemy);
  return enemy;
}

describe("trace behavior-neutrality (paramount)", () => {
  it("a full run with a collector attached is byte-identical to one without", () => {
    // Proof, not assertion: run the same seed for N ticks (a) untraced and (b) with a
    // collector, capturing full GameState at several ticks, and assert the sim states
    // are deep-equal. The collector must only observe, never perturb the sim.
    const opts = { seed: 987654, ticks: 500, snapshotEvery: 100 } as const;
    const plain = runHeadless({ ...opts, include: ["derived", "state"] });
    const traced = runHeadless({ ...opts, include: ["derived", "state"], trace: true });

    // JSON of the snapshots serializes GameState including the Rng ({ state }), so
    // equal stringified snapshots proves the full states (and rng) never diverged.
    expect(JSON.stringify(traced.snapshots)).toBe(JSON.stringify(plain.snapshots));

    // Non-vacuous: prove the traced run actually exercised both instrumented paths,
    // so "identical to untraced" isn't trivially true because tracing never fired.
    expect(traced.traces?.autobuy.length).toBeGreaterThan(0);
    expect(traced.traces?.workers.length).toBeGreaterThan(0);

    // Belt-and-suspenders on the class-instance rng the deep-equal could miss.
    const plainFinal = plain.snapshots[plain.snapshots.length - 1]?.state;
    const tracedFinal = traced.snapshots[traced.snapshots.length - 1]?.state;
    expect(plainFinal).toBeDefined();
    expect(tracedFinal).toBeDefined();
    expect(tracedFinal?.rng.getState()).toBe(plainFinal?.rng.getState());
  });

  it("omits traces when trace is off and includes them when on", () => {
    const off = runHeadless({ seed: 42, ticks: 200 });
    expect(off.traces).toBeUndefined();

    const on = runHeadless({ seed: 42, ticks: 200, trace: true });
    expect(on.traces).toBeDefined();
    // 200 ticks well exceeds AUTO_TICK and the initial worker retarget, so both
    // channels capture at least one record.
    expect(on.traces?.autobuy.length).toBeGreaterThan(0);
    expect(on.traces?.workers.length).toBeGreaterThan(0);
  });
});

describe("autobuy trace content", () => {
  it("captures candidate keys + weights and the chosen key", () => {
    const state = createInitialGameState(1234);
    state.enemies = [];
    // Fresh, threat-free state → the emergency path is not taken, so the ranking runs.
    state.resources.gold = 10_000;
    state.resources.ore = 10_000;
    state.resources.gems = 10_000;
    state.resources.energy = 10_000;
    state.resources.cores = 10_000;
    // Let the autobuy gate open this tick.
    state.timers.auto = AUTO_TICK;

    const collector = createTraceCollector();
    stepAutobuy(state, collector);
    const { autobuy } = collector.drain();

    expect(autobuy).toHaveLength(1);
    const record = autobuy[0];
    expect(record.emergency).toBe(false);
    expect(record.candidates.length).toBeGreaterThan(0);
    for (const candidate of record.candidates) {
      expect(typeof candidate.key).toBe("string");
      expect(typeof candidate.weight).toBe("number");
    }
    // A purchase happened this tick, so chosenKey names it and the upgrade incremented.
    expect(record.chosenKey).not.toBeNull();
    if (record.chosenKey) expect(state.upgrades[record.chosenKey]).toBeGreaterThan(0);
  });

  it("does not emit when the autobuy gate is closed", () => {
    const state = createInitialGameState(1234);
    state.timers.auto = 0; // below AUTO_TICK → stepAutobuy returns immediately
    const collector = createTraceCollector();
    stepAutobuy(state, collector);
    expect(collector.drain().autobuy).toHaveLength(0);
  });
});

describe("worker-target trace content", () => {
  function twoNodeState(): { state: GameState; miner: NonNullable<GameState["agents"][number]> } {
    const state = createInitialGameState(1234);
    state.enemies = [];
    const miner = state.agents.find((a) => a.kind === "miner" && a.active);
    if (!miner) throw new Error("expected an active miner");
    miner.x = 500;
    miner.y = 440;
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
    return { state, miner };
  }

  it("chosenId matches the returned target and each candidate carries the why-fields", () => {
    const { state, miner } = twoNodeState();
    // Enemies clustered beside node A → path to A is far scarier than to node B.
    for (let i = 0; i < 4; i++) {
      addEnemy(state, { kind: "raider", x: 290 + i * 4, y: 440, hp: 30, role: "combat" });
    }
    miner.target = null;

    const collector = createTraceCollector();
    const picked = chooseWorkerTarget(state, miner, collector);
    const { workers } = collector.drain();

    expect(workers).toHaveLength(1);
    const record = workers[0];
    expect(record.agentId).toBe(miner.id);
    expect(record.chosenId).toBe(picked); // record agrees with the function's return
    expect(record.chosenId).toBe(9002); // safe node chosen over the threatened one
    expect(record.stickyHeld).toBe(false); // no current target to hold

    // Both nodes are candidates and each surfaces the scoring inputs.
    const byId = new Map(record.candidates.map((c) => [c.nodeId, c]));
    expect(byId.size).toBe(2);
    for (const candidate of record.candidates) {
      expect(typeof candidate.score).toBe("number");
      expect(candidate).toHaveProperty("harvestBias");
      expect(candidate).toHaveProperty("fearMod");
      expect(candidate).toHaveProperty("spookedTicks");
      expect(candidate).toHaveProperty("pathThreat");
      expect(candidate).toHaveProperty("corruption");
    }
    // The rejected node (near the enemies) shows why: a higher path threat.
    expect(byId.get(9001)?.pathThreat).toBeGreaterThan(byId.get(9002)?.pathThreat ?? 0);
  });

  it("flags stickyHeld when the current target is held over a better candidate", () => {
    const { state, miner } = twoNodeState();
    // No enemies; keep the worker parked on node A so sticky retargeting can hold it.
    miner.x = 300;
    miner.y = 440;
    miner.target = 9001;

    const collector = createTraceCollector();
    const picked = chooseWorkerTarget(state, miner, collector);
    const record = collector.drain().workers[0];

    expect(record.chosenId).toBe(picked);
    expect(record.chosenId).toBe(9001);
    expect(record.stickyHeld).toBe(true);
  });

  it("emits a flee-retarget record with stickyHeld false", () => {
    const { state, miner } = twoNodeState();
    miner.x = 260;
    miner.y = 440;
    miner.target = 9001;
    miner.evadeDx = 1;
    miner.evadeDy = 0;

    const collector = createTraceCollector();
    const picked = chooseFleeDirectionTarget(state, miner, collector);
    const record = collector.drain().workers[0];

    expect(record).toBeDefined();
    expect(record.agentId).toBe(miner.id);
    expect(record.chosenId).toBe(picked);
    expect(record.stickyHeld).toBe(false);
  });
});
