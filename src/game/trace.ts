import type { UpgradeKey } from "@/game/types";

/**
 * Decision-trace sink interface + record shapes (Phase 2 of the sim harness).
 *
 * This module lives in `src/game/` — NOT `src/sim/` — on purpose: the instrumented
 * sim files (`advanceGame.ts`, `subsystems/autobuy.ts`, `ai/workerTargeting.ts`,
 * `subsystems/movement.ts`) must reference the sink type, and `src/game` must never
 * import from `src/sim`. So the interface lives here (an intra-`src/game` edge) and
 * the concrete collector lives in `src/sim/trace.ts`, keeping the dependency arrow
 * one-way: `src/sim → src/game`. This file holds ONLY types — no logic.
 */

/** One autobuy candidate as considered on an autobuy tick. */
export type AutobuyTraceCandidate = {
  key: UpgradeKey;
  weight: number;
};

/** One autobuy decision (emitted once per autobuy tick when a sink is attached). */
export type AutobuyTraceRecord = {
  tick: number;
  /** Ranked affordable candidates. Empty on an emergency tick (the ranking is bypassed). */
  candidates: AutobuyTraceCandidate[];
  /** True when the purchase came from the emergency-choice path rather than the ranking. */
  emergency: boolean;
  /** The upgrade purchased this tick, or null when nothing was bought. */
  chosenKey: UpgradeKey | null;
};

/** One worker-target candidate with the "why" fields surfaced from `scoreWorkerNode`. */
export type WorkerTargetTraceCandidate = {
  nodeId: number;
  score: number;
  harvestBias: number;
  fearMod: number;
  spookedTicks: number;
  pathThreat: number;
  corruption: number;
};

/** One worker retarget decision (emitted per retarget when a sink is attached). */
export type WorkerTargetTraceRecord = {
  tick: number;
  agentId: number;
  candidates: WorkerTargetTraceCandidate[];
  chosenId: number | null;
  /** True when sticky retargeting held the worker on its current node over a better candidate. */
  stickyHeld: boolean;
};

/**
 * The opt-in trace sink threaded through `advanceGame(prev, ctx?)`. Sim code only
 * ever calls these record methods; it never reads back. Passing no `ctx` (the
 * production path) means zero instrumentation and byte-identical behavior.
 */
export type SimTraceCtx = {
  recordAutobuy(record: AutobuyTraceRecord): void;
  recordWorkerTarget(record: WorkerTargetTraceRecord): void;
};

/** The drained aggregate of everything a collector captured over a run. */
export type SimTraces = {
  autobuy: AutobuyTraceRecord[];
  workers: WorkerTargetTraceRecord[];
};
