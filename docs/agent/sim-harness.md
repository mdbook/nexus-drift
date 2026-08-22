# Sim Harness — Headless Runner, CLI, Export

**Source files:** `src/sim/runHeadless.ts`, `src/sim/cli.ts`
**Tests:** `src/sim/__tests__/runHeadless.test.ts`
**Key invariants:** the harness is **read-only observation** — it makes ZERO changes to `src/game/` sim logic; it never imports `persistence.ts` (localStorage, not Node-safe); the seed is **required** (never falls back to `Date.now()`) so runs are deterministic; export is plain `JSON.stringify(state)` + reload via the existing `migrateGameState` (no bespoke serializer); one-way dependency `src/sim → src/game` only.

The full design + phasing lives in [`docs/sim-harness-plan.md`](../sim-harness-plan.md). This shard documents **Phase 1** (the shipped read-only core). Phases 2 (decision traces) and 3 (aggregation/viewer) are not yet built.

## What it is

A thin wrapper that runs the already-pure sim core off-screen and captures snapshots at chosen ticks. It reuses `createInitialGameState(seed)` + `advanceGame` (one call = one tick) + `computeDerived` — it adds observation, not simulation.

## Running it

```bash
npm run sim -- --seed 42 --ticks 200 --snapshot 50,100,200
npm run sim -- --seed 42 --ticks 5000 --every 500 --state --out run.json
```

Flags (parsed with Node's stdlib `util.parseArgs` — no CLI dependency):

| Flag               | Required | Meaning                                                            |
| ------------------ | -------- | ------------------------------------------------------------------ |
| `--seed <n>`       | yes      | RNG seed (integer). Determinism — always pass one.                 |
| `--ticks <n>`      | yes      | Number of ticks to advance. Tick 0 is the initial state.           |
| `--snapshot <csv>` | no       | Exact tick indices to capture, e.g. `50,100,200`.                  |
| `--every <n>`      | no       | Also capture every N ticks. Unioned with `--snapshot`.             |
| `--state`          | no       | Include the full `GameState` per snapshot (heavy; default is off). |
| `--out <path>`     | no       | Write JSON to a file. Omit to write to stdout.                     |

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

## Execution route

`src/sim/*` and `src/game/*` import each other via the `@/` → `src/` tsconfig path alias. `tsx` (devDependency) resolves that alias automatically from `tsconfig.json`, so `npm run sim` needs no extra wiring. `@types/node` is a devDependency so the CLI (`process`, `node:fs`, `node:util`) typechecks under `tsc --noEmit`. Node's native TS stripping is **not** enough — it does not resolve tsconfig `paths`.
