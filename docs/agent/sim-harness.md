# Sim Harness — Headless Runner, CLI, Export

**Source files:** `src/sim/runHeadless.ts`, `src/sim/cli.ts`, `src/sim/trace.ts`, `src/game/trace.ts`
**Tests:** `src/sim/__tests__/runHeadless.test.ts`, `src/sim/__tests__/trace.test.ts`
**Key invariants:** the harness is **observation, not simulation** — with tracing off it makes ZERO behavioral changes to `src/game/` sim logic; it never imports `persistence.ts` (localStorage, not Node-safe); the seed is **required** (never falls back to `Date.now()`) so runs are deterministic; export is plain `JSON.stringify(state)` + reload via the existing `migrateGameState` (no bespoke serializer); one-way dependency `src/sim → src/game` only (the trace **interface** lives in `src/game/trace.ts` so sim code can reference it without a back-edge).

The full design + phasing lives in [`docs/sim-harness-plan.md`](../sim-harness-plan.md). This shard documents **Phase 1** (the read-only core) and **Phase 2** (decision traces). Phase 3 (aggregation/viewer) is not yet built.

## What it is

A thin wrapper that runs the already-pure sim core off-screen and captures snapshots at chosen ticks. It reuses `createInitialGameState(seed)` + `advanceGame` (one call = one tick) + `computeDerived` — it adds observation, not simulation.

## Running it

```bash
npm run sim -- --seed 42 --ticks 200 --snapshot 50,100,200
npm run sim -- --seed 42 --ticks 5000 --every 500 --state --out run.json
```

Flags (parsed with Node's stdlib `util.parseArgs` — no CLI dependency):

| Flag               | Required | Meaning                                                               |
| ------------------ | -------- | --------------------------------------------------------------------- |
| `--seed <n>`       | yes      | RNG seed (integer). Determinism — always pass one.                    |
| `--ticks <n>`      | yes      | Number of ticks to advance. Tick 0 is the initial state.              |
| `--snapshot <csv>` | no       | Exact tick indices to capture, e.g. `50,100,200`.                     |
| `--every <n>`      | no       | Also capture every N ticks. Unioned with `--snapshot`.                |
| `--state`          | no       | Include the full `GameState` per snapshot (heavy; default is off).    |
| `--trace`          | no       | Capture autobuy + worker-target decision traces into `result.traces`. |
| `--out <path>`     | no       | Write JSON to a file. Omit to write to stdout.                        |

If neither `--snapshot` nor `--every` is given, a single snapshot at the final tick is captured.

> **Note:** `npm run sim` prints npm's own lifecycle banner to stdout ahead of the JSON. For a clean machine-readable file use `--out <path>` — it writes only the JSON via `fs.writeFileSync`.

## Programmatic API — `runHeadless(opts)`

```ts
interface SimRunOpts {
  seed: number; // required — determinism
  ticks: number; // run-to-tick-N
  snapshotAt?: number[]; // exact tick indices (default: [ticks])
  snapshotEvery?: number; // OR/AND periodic capture
  include?: SnapshotChannel[]; // "state" | "derived" (default ["derived"])
}
interface SimSnapshot {
  tick: number;
  derived: DerivedState;
  state?: GameState;
}
interface SimRunResult {
  seed: number;
  ticks: number;
  schemaVersion: number;
  snapshots: SimSnapshot[];
}
```

`derived` (the `computeDerived` metrics surface — rates, defenseScore, threatScore, enemyCounts, colonyHealth, progression director, etc.) is always captured. `state` is opt-in via `include: ["derived", "state"]` because GameState arrays are heavy. Requested ticks are clamped to `[0, ticks]`, de-duped, and sorted.

## Export / reload

Export is plain `JSON.stringify(result)`. The only non-POJO in `GameState` is the `Rng` instance, which serializes as `{ "state": <n> }` — exactly the shape `migrateGameState` reads back (`raw.rng.state` → `Rng.fromState`). To reload a captured `state`, feed the parsed JSON to `migrateGameState`. This is the existing save/load path; the harness adds no serializer of its own.

## Decision traces (Phase 2)

The two decision systems the operator cares about — **autobuy** (upgrade auto-purchase) and **worker target-picking** ("pathfinding") — compute their choices transiently each tick and store nothing, so there is no snapshot to read. Phase 2 adds an **opt-in trace sink** that records _why_ each decision was made, with **zero behavior change when off**.

**How it threads.** `advanceGame(prev, ctx?: SimTraceCtx)` takes one optional sink and forwards it ONLY to the two steps that reach an instrumented fn — `stepWorkers` (→ `chooseWorkerTarget` / `chooseFleeDirectionTarget`) and `stepAutobuy`. Every other subsystem call is byte-identical. The sole production caller (`useGameLoop.ts`) passes nothing, so the game is unaffected. The trace only READS already-computed locals and pushes to the sink; it draws no `rng`, allocates nothing when `ctx` is undefined, and never reorders a step.

**Dependency direction.** The sink **interface** + record types live in `src/game/trace.ts` (so instrumented sim files can reference the type via an intra-`src/game` edge); the concrete **collector** lives in `src/sim/trace.ts`. The arrow stays one-way `src/sim → src/game` — `src/game` never imports from `src/sim`.

**Using it programmatically:**

```ts
const result = runHeadless({ seed: 42, ticks: 5000, trace: true });
result.traces?.autobuy; // AutobuyTraceRecord[]
result.traces?.workers; // WorkerTargetTraceRecord[]
```

Or attach a collector directly to `advanceGame`:

```ts
import { createTraceCollector } from "@/sim/trace";
const collector = createTraceCollector();
let s = createInitialGameState(42);
for (let i = 0; i < 5000; i++) s = advanceGame(s, collector);
const traces = collector.drain(); // { autobuy, workers }
```

**Record shapes** (from `src/game/trace.ts`):

```ts
type AutobuyTraceRecord = {
  tick: number;
  candidates: { key: UpgradeKey; weight: number; affordable: boolean }[];
  emergency: boolean; // true = came from the emergency-choice path (candidates is empty)
  chosenKey: UpgradeKey | null; // null on a no-purchase tick
};

type WorkerTargetTraceRecord = {
  tick: number;
  agentId: number;
  candidates: {
    nodeId: number;
    score: number;
    // "why" fields surfaced (not recomputed) from scoreWorkerNode:
    harvestBias: number;
    fearMod: number;
    spookedTicks: number;
    pathThreat: number;
    corruption: number;
  }[];
  chosenId: number | null;
  stickyHeld: boolean; // true = sticky retargeting held the current node over a better candidate
};
```

One `AutobuyTraceRecord` is emitted per autobuy tick (i.e. when the `AUTO_TICK` gate opens). One `WorkerTargetTraceRecord` is emitted per worker retarget — including flee-direction retargets, where `stickyHeld` is always `false`.

**Behavior-neutrality is proven, not assumed.** `src/sim/__tests__/trace.test.ts` runs a fixed seed with and without a collector and asserts the final `GameState`s (including the `Rng`) are deep-equal, alongside content tests for the autobuy and worker records.

## Execution route

`src/sim/*` and `src/game/*` import each other via the `@/` → `src/` tsconfig path alias. `tsx` (devDependency) resolves that alias automatically from `tsconfig.json`, so `npm run sim` needs no extra wiring. `@types/node` is a devDependency so the CLI (`process`, `node:fs`, `node:util`) typechecks under `tsc --noEmit`. Node's native TS stripping is **not** enough — it does not resolve tsconfig `paths`.
