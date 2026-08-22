import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, migrateGameState } from "@/game/factories";
import { parseSimArgs } from "@/sim/cli";
import { runHeadless } from "@/sim/runHeadless";

describe("runHeadless", () => {
  it("is deterministic for the same seed and ticks", () => {
    const a = runHeadless({ seed: 42, ticks: 200, snapshotAt: [50, 100, 200] });
    const b = runHeadless({ seed: 42, ticks: 200, snapshotAt: [50, 100, 200] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces different output for a different seed", () => {
    const a = runHeadless({ seed: 1, ticks: 200, include: ["derived", "state"] });
    const b = runHeadless({ seed: 2, ticks: 200, include: ["derived", "state"] });
    expect(JSON.stringify(a.snapshots)).not.toBe(JSON.stringify(b.snapshots));
  });

  it("captures snapshots exactly at the requested ticks", () => {
    const result = runHeadless({ seed: 7, ticks: 100, snapshotAt: [0, 25, 100] });
    expect(result.snapshots.map((s) => s.tick)).toEqual([0, 25, 100]);
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("defaults to a single snapshot at the final tick", () => {
    const result = runHeadless({ seed: 7, ticks: 80 });
    expect(result.snapshots.map((s) => s.tick)).toEqual([80]);
  });

  it("supports periodic snapshots via snapshotEvery", () => {
    const result = runHeadless({ seed: 7, ticks: 100, snapshotEvery: 25 });
    expect(result.snapshots.map((s) => s.tick)).toEqual([25, 50, 75, 100]);
  });

  it("clamps and de-dupes requested ticks and unions snapshotAt with snapshotEvery", () => {
    const result = runHeadless({ seed: 7, ticks: 50, snapshotAt: [10, 10, 999, -1], snapshotEvery: 25 });
    expect(result.snapshots.map((s) => s.tick)).toEqual([10, 25, 50]);
  });

  it("omits full state by default and includes it on request", () => {
    const derivedOnly = runHeadless({ seed: 7, ticks: 20 });
    expect(derivedOnly.snapshots[0].state).toBeUndefined();
    expect(derivedOnly.snapshots[0].derived).toBeDefined();

    const withState = runHeadless({ seed: 7, ticks: 20, include: ["derived", "state"] });
    expect(withState.snapshots[0].state).toBeDefined();
  });

  it("round-trips a captured GameState through JSON + migrateGameState", () => {
    const result = runHeadless({ seed: 42, ticks: 300, include: ["derived", "state"] });
    const original = result.snapshots[0].state;
    expect(original).toBeDefined();

    const serialized = JSON.parse(JSON.stringify(original)) as Parameters<typeof migrateGameState>[0];
    const restored = migrateGameState(serialized);

    expect(restored.schemaVersion).toBe(SCHEMA_VERSION);
    // Rng serializes as { state } and rehydrates via Rng.fromState — the round-trip must preserve it.
    expect(restored.rng.getState()).toBe(original!.rng.getState());
    expect(restored.nodes).toHaveLength(original!.nodes.length);
    expect(restored.agents).toHaveLength(original!.agents.length);
    expect(restored.resources.gold).toBe(original!.resources.gold);
  });
});

describe("parseSimArgs", () => {
  it("parses seed and ticks", () => {
    const { opts } = parseSimArgs(["--seed", "42", "--ticks", "200"]);
    expect(opts.seed).toBe(42);
    expect(opts.ticks).toBe(200);
  });

  it("parses a snapshot CSV into tick indices", () => {
    const { opts } = parseSimArgs(["--seed", "1", "--ticks", "500", "--snapshot", "50, 100 ,200"]);
    expect(opts.snapshotAt).toEqual([50, 100, 200]);
  });

  it("parses --every and --state and --out", () => {
    const { opts, out } = parseSimArgs([
      "--seed",
      "1",
      "--ticks",
      "500",
      "--every",
      "100",
      "--state",
      "--out",
      "run.json",
    ]);
    expect(opts.snapshotEvery).toBe(100);
    expect(opts.include).toEqual(["derived", "state"]);
    expect(out).toBe("run.json");
  });

  it("throws when a required flag is missing", () => {
    expect(() => parseSimArgs(["--ticks", "200"])).toThrow(/seed/);
    expect(() => parseSimArgs(["--seed", "1"])).toThrow(/ticks/);
  });

  it("throws on a non-integer numeric flag", () => {
    expect(() => parseSimArgs(["--seed", "abc", "--ticks", "10"])).toThrow(/seed/);
  });
});
