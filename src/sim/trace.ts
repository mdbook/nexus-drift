import type { AutobuyTraceRecord, SimTraceCtx, SimTraces, WorkerTargetTraceRecord } from "@/game/trace";

/**
 * Concrete decision-trace collector. This is the ONLY place the harness and the
 * trace interface concretely meet — it imports the sink interface from
 * `@/game/trace` (one-way `src/sim → src/game`) and buffers every emitted record.
 *
 * Attach the returned object as the `ctx` to `advanceGame`; call `drain()` once the
 * run is done to pull the aggregated records out.
 */
export function createTraceCollector(): SimTraceCtx & { drain(): SimTraces } {
  const autobuy: AutobuyTraceRecord[] = [];
  const workers: WorkerTargetTraceRecord[] = [];

  return {
    recordAutobuy(record) {
      autobuy.push(record);
    },
    recordWorkerTarget(record) {
      workers.push(record);
    },
    drain() {
      return { autobuy, workers };
    },
  };
}
