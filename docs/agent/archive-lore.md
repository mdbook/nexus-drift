# Field Archive & Lore Unlocks

**Source files:** `src/components/WikiOverlay.tsx` (content + presentation), `src/game/lore.ts` (unlock logic), `src/App.tsx` (wiring)
**Tests:** `src/game/__tests__/lore.test.ts`
**Key invariants:** unlock state is DERIVED from existing GameState — no new persisted field, no `SCHEMA_VERSION` bump; `hidden: true` entry ids match `LORE_UNLOCKS` keys 1:1; every `EnemyKind` has a codex entry; unlock predicates are pure and monotonic.

## What This Is

The **Field Archive** (opened from the sidebar `archive` button, or deep-linked from a "New enemy spotted" notification) is the in-game codex/lore overlay. It is a modal (`WikiOverlay`) organized into categories:

- **Field Entities** — the three worker crews + all twelve hostile `EnemyKind`s.
- **Resources** — gold, ore, gems, energy, cores, flux.
- **Defenses** — turret, scout, sentinel, missile silo.
- **Sector Operations** — corruption, prestige, progression, worker slots, city.
- **Field Events** — all twelve random events.
- **World Lore** — the sector backstory (baseline + gated deep-lore entries).
- **Classified** — secret / easter-egg entries, redacted until earned.

The World Lore + Classified categories carry the deep story layer. Some of their entries are **gated**: they render as `▓▓ CLASSIFIED ▓▓` in the index and a `[DATA CORRUPTED]` / redacted dossier in the content pane, showing only a one-line **Recovery Condition** hint, until the player earns them.

## The Backstory Throughline

The **Nexus** is a pre-charter resonance structure buried under the home district; the gem seams are tuned to it. Mining woke it, and the **Drift** is its field bleeding outward — a tide that rewrites matter (corruption in the seams) and prints hostiles patterned on the colony's own scanned schematics (which is why the twelve enemies mirror our worker/defense silhouettes — the `sec-pattern` reveal). The original **first shift** was assimilated, not killed; the autonomous crews now run on their cached directives with no live operators. **Flux** is reclaimed Drift; **cores** are crystallized Nexus torn from elite kills (hence prestige-proof). **Prestige** is not a fresh start — it re-runs the same sector in a loop the Nexus optimizes for continuation, and "the drift remembers" every iteration. Whether the player is the operator running the loop or the thing the loop is running is left open.

## How Unlocks Work (no new save field)

`src/game/lore.ts` owns the gating **logic**. `LORE_UNLOCKS: Record<entryId, { hint; test }>` maps each gated entry id to an in-tone hint and a pure predicate `test(g: GameState): boolean`. `computeUnlockedLore(g)` runs every predicate and returns the set of unlocked ids.

**Every predicate reads only existing, already-persisted, monotonic GameState signals** — `achievements` (append-only), monotonic `stats` counters, `prestige`, `discoveredEnemies`, `stats.eventsExperienced`, `lostWorkerFound`. Because those signals only ever accumulate, a derived unlock is effectively permanent and rides the existing save for free:

- **No new `GameState` field.** Nothing added to `types.ts` / `createInitialGameState` / `cloneGameState` / migration. A loaded save (any schema version) simply recomputes its unlock set from whatever signals it already carries; a missing signal reads "locked", which is correct and never crashes.
- **No `SCHEMA_VERSION` bump.** This deliberately sidesteps the three-place migration checklist in [persistence.md](persistence.md) — there is no shape change to save.

`App.tsx` computes the set **lazily**, only while the overlay is open (`unlockedLore={wikiOpen ? computeUnlockedLore(game) : undefined}`), so the scan never runs on the per-tick render path.

## Adding / Changing Gated Entries

Content and logic are kept in parity by `lore.test.ts` (it asserts the set of `hidden: true` entry ids equals the `LORE_UNLOCKS` key set). To add a gated entry:

1. In `WikiOverlay.tsx`, add the `WikiEntry` to the `World Lore` or `Classified` category with `hidden: true` and `lockedHint: LORE_UNLOCKS["<id>"].hint`.
2. In `lore.ts`, add `"<id>": { hint, test }` to `LORE_UNLOCKS`. Keep `test` **pure and monotonic** — read only append-only GameState signals; never mutate, never add RNG.
3. Run tests. The parity + uniqueness + codex-completeness assertions will catch a mismatch.

Baseline (always-visible) lore entries just omit `hidden` and need no `LORE_UNLOCKS` key.

## Current Gated Entries (triggers)

World Lore: `lore-first-shift` (survive 30m) · `lore-crews` (prestige ≥ 1) · `lore-flux` (first purge) · `lore-cores` (first core / brute kill) · `lore-recursion` (prestige 3×).

Classified / easter eggs: `sec-residual` (drift secret achievement) · `sec-synthwave` (synthwave protocol) · `sec-passenger` (spot the tourist) · `sec-wrk00` (recover the lost drone) · `sec-pattern` (discover all twelve enemies) · `sec-devnote` (read the changelog → `release_reader`) · `sec-outbreak` (survive a corrupted-worker outbreak) · `sec-deepwatch` (survive 4h) · `sec-null` (witness a Null Surge) · `sec-starcall` (witness a Starcall).

These reuse the **existing** achievement / discovery / event systems (see [events-achievements.md](events-achievements.md)) rather than adding a parallel one — the triggers are the same signals those systems already set.
