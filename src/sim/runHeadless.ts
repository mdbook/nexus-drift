import { advanceGame } from "@/game/advanceGame";
import { SCHEMA_VERSION, createInitialGameState } from "@/game/factories";
import { computeDerived } from "@/game/selectors";
import type { SimTraces } from "@/game/trace";
import type { DerivedState, GameState } from "@/game/types";
import { createTraceCollector } from "@/sim/trace";

/** Which channels a snapshot carries. `state` is heavy (GameState arrays), so it is opt-in. */
export type SnapshotChannel = "state" | "derived";

export interface SimRunOpts {
  /** Required — the harness never falls back to `Date.now()`, so runs are always deterministic. */
  seed: number;
  /** Number of `advanceGame` steps to apply. Tick 0 is the initial state. */
  ticks: number;
  /** Exact tick indices to capture (0..ticks). Defaults to `[ticks]` if no target is given. */
  snapshotAt?: number[];
  /** Periodic capture: also snapshot every N ticks. Combined (unioned) with `snapshotAt`. */
  snapshotEvery?: number;
  /** Channels to capture. Defaults to `["derived"]`; add `"state"` for the full GameState. */
  include?: SnapshotChannel[];
  /**
   * When true, attach a decision-trace collector (Phase 2) and include the captured
   * autobuy + worker-target records in `SimRunResult.traces`. When false/absent, no
   * sink is passed to `advanceGame`, so the run is byte-identical to an untraced run.
   */
  trace?: boolean;
}

export interface SimSnapshot {
  tick: number;
  derived: DerivedState;
  state?: GameState;
}

export interface SimRunResult {
  seed: number;
  ticks: number;
  schemaVersion: number;
  snapshots: SimSnapshot[];
  /** Decision traces, present only when `opts.trace` was set. */
  traces?: SimTraces;
}

/** Resolve the sorted, de-duped set of tick indices to capture, clamped to [0, ticks]. */
function resolveTargetTicks(opts: SimRunOpts): number[] {
  const set = new Set<number>();
  for (const t of opts.snapshotAt ?? []) {
    if (Number.isInteger(t) && t >= 0 && t <= opts.ticks) set.add(t);
  }
  const every = opts.snapshotEvery;
  if (every !== undefined && every > 0) {
    for (let t = every; t <= opts.ticks; t += every) set.add(t);
  }
  if (set.size === 0) set.add(opts.ticks);
  return [...set].sort((a, b) => a - b);
}

/**
 * Run the sim headlessly from a seeded initial state, capturing snapshots at the requested ticks.
 * Pure observation over the existing sim core — makes zero changes to `src/game/` behavior.
 */
export function runHeadless(opts: SimRunOpts): SimRunResult {
  if (!Number.isInteger(opts.ticks) || opts.ticks < 0) {
    throw new Error(`ticks must be a non-negative integer, got ${opts.ticks}`);
  }
  const include = opts.include ?? ["derived"];
  const captureState = include.includes("state");
  const targets = new Set(resolveTargetTicks(opts));

  // ponytail: only build a collector when tracing; otherwise ctx stays undefined and
  // advanceGame runs its byte-identical production path.
  const collector = opts.trace ? createTraceCollector() : undefined;

  const snapshots: SimSnapshot[] = [];
  // advanceGame clones-then-returns, so each tick is a fresh object; captured references never alias.
  let current = createInitialGameState(opts.seed);
  for (let tick = 0; tick <= opts.ticks; tick += 1) {
    if (targets.has(tick)) {
      const snap: SimSnapshot = { tick, derived: computeDerived(current) };
      if (captureState) snap.state = current;
      snapshots.push(snap);
    }
    if (tick < opts.ticks) current = advanceGame(current, collector);
  }

  const result: SimRunResult = {
    seed: opts.seed,
    ticks: opts.ticks,
    schemaVersion: SCHEMA_VERSION,
    snapshots,
  };
  if (collector) result.traces = collector.drain();
  return result;
}
