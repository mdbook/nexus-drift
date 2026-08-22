# Sim-Analysis Harness — Plan

> **Status:** DRAFT for independent (opus) review, then build. Operator-priority feature (#13019/#13020).
> **Owner lanes:** dev (harness core + runner + CLI + export), balancing (metrics semantics + decision
> traces), ui-ux (optional viewer, phase 3 only). **Governor gates every PR** (four gates + 213-test
> no-regress). Target branch: `dev`. Version: current line 3.2.x; harness is additive tooling, not a
> gameplay release — see §Versioning.

## 1. Goal

Let **agents** run Nexus Drift as headless simulations and pull detailed state/telemetry at arbitrary
points in time, to analyze and balance gameplay — economy, enemies, defenses, upgrade auto-purchase
("autobuy"), and worker autonomous target-picking + movement ("pathfinding"). Deterministic, scriptable,
exportable. Ties into backlog items _headless soak util_ + _replay/export-save_ (docs/agent/roadmap.md).

## 2. What the code already gives us for free (grounding)

The sim core is a clean deterministic pure function — most of the "run" half of this feature already exists;
we are mostly adding **observation** around it, not new simulation.

- `advanceGame(prev: GameState): GameState` (`src/game/advanceGame.ts:22`) — pure, clones then mutates the
  clone; **one call = one tick**. No I/O, no globals, no `Date.now`/`Math.random` in the tick.
- `createInitialGameState(seed?: number): GameState` (`src/game/factories.ts:451`) — **seed is optional and
  defaults to `Date.now()`; the harness MUST always pass an explicit seed** for determinism. `SCHEMA_VERSION = 12`.
- `Rng` (`src/game/rng.ts`) — Mulberry32, single uint32 of state, **fully serializable** via
  `getState(): number` + static `Rng.fromState(state)`. Note: `state.rng` is a **class instance**, not a
  POJO — serialization must extract `getState()` and rehydration must call `Rng.fromState(...)`.
- `computeDerived(state): DerivedState` (`src/game/selectors.ts`; type `src/game/types.ts:549`) — ready-made
  metrics: rates, defenseScore, threatScore, enemyCounts, colonyHealth, progression director, etc. **This is
  our primary metrics-export surface** — do not reinvent it.
- Existing headless-loop template — `src/game/__tests__/advanceGame.test.ts:73`:
  ```ts
  function runTicks(state, ticks) {
    let s = state;
    for (let i = 0; i < ticks; i++) s = advanceGame(s);
    return s;
  }
  ```
  This IS the runner. The harness generalizes it with snapshotting; it does not rewrite the sim.
- **Node-safe:** the only browser dependency under `src/game/` is `persistence.ts` (localStorage), and it is
  **not in the sim path** (`advanceGame`/`factories` do not import it — the dependency runs the other way).
  **Rule: the harness must never import `persistence.ts`.** Core runs unmodified under Node.

## 3. The one hard part — decision traces (READ THIS)

The operator wants to inspect **autopick** and **pathfinding** decisions. There is **no `autopick` symbol in
the codebase** (confirmed: grep empty). The two real decision systems are:

1. **`autobuy`** — upgrade auto-purchase: `getAutobuyWeight` (`src/game/subsystems/autobuy.ts:16`),
   `getEmergencyUpgradeChoice` (`:67`), `stepAutobuy` (`:142`).
2. **Worker autonomous target-picking + movement** — the decision LOGIC is already cleanly extracted into
   `src/game/ai/workerTargeting.ts`: **`scoreWorkerNode` (`:45`)** computes the full per-candidate breakdown
   the operator wants (type-tier + `harvestBias` `:64`, contested/evading penalties `:82`, corruption
   `:86`, `pathThreat`×`fearMod`×`spookedTicks` multiplier `:99`, region bias `:119`), and
   **`chooseWorkerTarget` (`:138`)** produces the ranked list + sticky-vs-best decision (chosen target +
   reject margin). `movement.ts` only _invokes_ it (`stepWorkers` calls at `:226`, `:324`, and
   `chooseFleeDirectionTarget` at `:336`). **← Trace hook goes in `workerTargeting.ts`, NOT `movement.ts`.**
   These fns draw NO rng and are already unit-tested (`aiBehavior.test.ts:61,279,867,916`), so trace
   assertions drop straight into that harness.

**Both compute their decisions transiently each tick and store nothing.** You cannot snapshot a decision that
was never persisted. So the ONLY way to expose "why did it pick X" is to **instrument** these functions with
an **opt-in trace sink**. This is the invasive slice and the highest review-risk (it touches load-bearing sim
code). Constraints for that instrumentation (enforced at gate):

- **Zero behavior change when tracing is off.** Default path must be byte-identical to today — the existing
  test baseline must not drop, only grow with net-new tests. Prove it: existing determinism tests must still
  pass. **Re-derive the baseline count at build time (`npx vitest run`) — do not trust any number written in
  this doc; the count is a moving target across the swarm.**
- **Zero cost when off.** A single `if (trace)` guard / undefined-sink check; no allocation on the hot path
  when disabled. `// ponytail:` comment the guard.
- **No new randomness, no reordering of subsystem steps** (order is load-bearing — architecture.md).
- The trace sink is passed in, not a module global — keeps `advanceGame` pure and re-entrant.

**Sink threading — LOCKED to approach (A) by opus review:** `advanceGame(prev, ctx?: SimTraceCtx)` — one
optional param, explicit and pure. The **sole non-test caller is `src/hooks/useGameLoop.ts:80`**; it passes
nothing, so production behavior is unchanged. Approach (B) (trace on a transient state field) was rejected:
`cloneGameState` is an explicit field-by-field spread (`factories.ts:553`), so a `...prev` sink would silently
alias into every clone AND every `JSON.stringify`, forcing exclusion logic in two places to fight a leak (A)
never creates. **Gate detail:** `tsconfig` sets `noUnusedParameters:true` — every layer that receives the
sink must forward/use it (or prefix `_`), or typecheck fails.

## 4. Phasing (ship value early, isolate risk)

Three phases, each its own PR into `dev`. **Phase 1 delivers a usable harness with ZERO sim-code changes** —
we get analysis value before touching the risky part.

### Phase 1 — read-only harness core + CLI + export (dev lane) — LOW RISK, no sim changes

New module `src/sim/` (harness lives outside `src/game/` so it never gets confused for sim logic):

- `src/sim/runHeadless.ts` — `runHeadless(opts): SimRunResult`:
  ```ts
  interface SimRunOpts {
    seed: number; // required — determinism
    ticks: number; // run-to-tick-N
    snapshotAt?: number[]; // tick indices to capture (default: [ticks])
    snapshotEvery?: number; // OR periodic capture
    include?: SnapshotChannel[]; // "state" | "derived" (default both)
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
  Body is the `runTicks` loop + capture at requested ticks. Uses `createInitialGameState(seed)` +
  `advanceGame` + `computeDerived`. ~40 lines. No new sim logic.
- **Serialization: NO bespoke helper (opus review cut it — it was redundant AND buggy).** `Rng` is the only
  non-POJO in `GameState`, and TS `private` is compile-time only, so plain `JSON.stringify(state)` already
  emits `rng` as `{"state":<n>}` without throwing — which is exactly the shape `migrateGameState` reads back
  (`factories.ts:608` reads `raw.rng?.state` → `Rng.fromState`). The round-trip is already implemented and
  tested (`advanceGame.test.ts:801`). So: **export = `JSON.stringify(state)`; reload = `migrateGameState`.**
  Reuse the existing path; do not add a `serialize.ts`. (The earlier `rng: getState()` bare-number idea would
  NOT round-trip — `migrateGameState` expects an object, not a number.)
- **CLI**: `src/sim/cli.ts` + `npm run sim -- --seed 42 --ticks 5000 --snapshot 1000,3000 --out run.json`.
  Arg parsing via Node's built-in `util.parseArgs` (stdlib — no yargs/commander). Writes JSON to stdout or
  `--out`.
- **Execution route — LOCKED to (i) add `tsx` (opus-endorsed).** The `@/`→`src/` alias is unavoidable for any
  route: `src/game/*` files import each other via `@/`, so the whole transitive graph needs it resolved the
  moment the harness imports `advanceGame`. Two dead ends the builder must NOT chase: (a) Node-24 native TS
  stripping does **not** resolve tsconfig `paths` → `node src/sim/cli.ts` throws on `@/`; (b) relative imports
  inside `src/sim` don't help — everything downstream is still `@/`. **`tsx` v4 reads tsconfig `paths`
  automatically** (`baseUrl:"."` + `paths:{"@/*":["src/*"]}` already present) — so (i) is genuinely one
  devDep + one `"sim":` script line, no alias wiring. Fallback ONLY if a zero-new-deps edict lands: (ii)
  vitest-invoked entry reading env params (hostile CLI). The harness _module_ stays dep-free either way.
- **Deliverable:** an agent can run `npm run sim -- --seed S --ticks N --snapshot ...` and get a JSON of
  `DerivedState` (+ optional full `GameState`) at each requested tick. Deterministic across runs.
- **Tests:** determinism (same seed+ticks → identical snapshots), snapshot-at-tick correctness, serialize
  round-trips the Rng, CLI arg parsing. Update test-count refs (README + operations.md) per AGENTS.md.

### Phase 2 — decision traces (balancing lane leads, dev supports) — HIGHER RISK, sim instrumentation

- **Dependency rule (enforced at gate): one-way `src/sim → src/game` only.** Trace TYPES live in
  `src/sim/trace.ts` and are imported BY the two instrumented sim files; harness types must never be dragged
  into `src/game/`, and `src/game/` must not import from `src/sim/`. The sink is a structural interface the
  sim files accept, not a coupling back to the harness.
- `src/sim/trace.ts` — `SimTraceCtx` sink interface + a default collector.
- Instrument `stepAutobuy`/`getAutobuyWeight` to emit per-decision records (candidate weights, chosen key,
  emergency-path flag, affordability) into the sink **only when present**.
- Instrument **`chooseWorkerTarget` (`workerTargeting.ts:138`)** — have it accept the optional sink and emit
  `{agentId, tick, candidates:[{nodeId,score,...}], chosenId, stickyHeld}` once per retarget. The per-candidate
  "why" fields (incl. `harvestBias`/`fearMod`/`spookedTicks`/pathThreat/corruption) are already locals in
  `scoreWorkerNode (:45)`. `movement.ts` is untouched except forwarding the sink to its 3 call sites
  (`:226`,`:324`,`:336`). This is the "pathfinding trace."
- Thread the sink per §3 approach chosen by review. `runHeadless` gains `trace?: boolean` → attaches a
  collector → traces land in `SimRunResult.traces`.
- **Gate emphasis:** prove zero behavior change (determinism tests green, 213 baseline intact + only net-new
  tests added), zero hot-path cost when off.
- **Tests:** trace off → identical output + no perf regression; trace on → decisions captured for a known
  seed; a worker forced under threat shows the reject reason; autobuy trace shows the chosen candidate.

### Phase 3 — richer analysis + optional viewer (dev/balancing; ui-ux if viewer) — NICE-TO-HAVE

- Multi-run aggregation (run a seed sweep, summarize), tick-diff (`state@t2` − `state@t1`), CSV export for
  spreadsheeting, run-to-condition (stop when predicate true, e.g. city HP < X). All pure analysis over
  Phase-1/2 output — no sim changes.
- **Optional** ui-ux viewer: load a `run.json` and render timelines/field-at-tick. Only if operator wants a
  dashboard; do NOT build speculatively. `// ponytail:` — skip until asked.

## 5. Explicitly NOT in scope (YAGNI unless asked)

- No changes to gameplay balance itself (this is a _measurement_ tool).
- No new persistence format / save-slot changes; harness output is standalone JSON, not a game save.
- No web service / API server — CLI + importable module only.
- No live-attach to a running browser game.

## 6. Versioning & docs

- Harness is additive tooling → **patch bump** (e.g. 3.2.4 → 3.2.5) when Phase 1 lands, or fold into the
  current in-flight entry per AGENTS.md. Not a minor/major on its own.
- Every phase updates: `README.md` (new `## Simulation Harness` section + commands), a new
  `docs/agent/sim-harness.md` shard linked from `docs/agent/INDEX.md`, `src/changelog.ts`, and test-count
  refs. Docs land in the SAME PR as the code (AGENTS.md "always update docs").

## 7. Design decisions — RESOLVED by opus review (2026-08-22, verdict APPROVE-WITH-CHANGES)

1. **Sink-threading:** approach (A) `advanceGame(prev, ctx?)`. Sole prod caller `useGameLoop.ts:80`. See §3.
2. **Execution route:** (i) add `tsx` v4 (auto-reads tsconfig paths). See §4 Phase 1.
3. **Module home:** `src/sim/` — under `src/` for `@/` alias + `tsc` coverage, out of `src/game/` namespace.
4. **Snapshot default:** `derived`-only, full `state` opt-in (GameState arrays are heavy). ✓
5. **Phase-1-alone ships independently:** yes — pure observation over an already-pure core, zero sim changes.
6. **Worker trace hook** = `workerTargeting.ts` (`chooseWorkerTarget`/`scoreWorkerNode`), NOT `movement.ts`. §3.
7. **No `serialize.ts`** — plain `JSON.stringify` + `migrateGameState`. §4 Phase 1.
8. **One-way dep** `src/sim → src/game`; re-derive test baseline at build (don't trust doc numbers). §3/§Phase 2.

Full review archived by the governor; builders implement against this revised plan as-is.
