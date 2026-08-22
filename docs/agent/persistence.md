# Persistence & Save Migration

**Source files:** `src/game/factories.ts`, `src/game/persistence.ts`, `src/game/types.ts`
**Tests:** `src/game/__tests__/persistence.test.ts`, save-migration assertions in `advanceGame.test.ts`
**Key invariants:** any GameState field change touches three places; migration always stamps `SCHEMA_VERSION`; RNG state restored from `rng.state`, not just `citySeed`; `spawnTick` / `dyingTicks` are renderer-only.

## Save Slot

Autosaves to `localStorage["nexusDriftSave"]` every 30 seconds. Saves carry a `schemaVersion` field (currently `13`).

`migrateGameState()` in `factories.ts` always stamps `SCHEMA_VERSION` on the returned state and handles older saves gracefully via defensive `?? defaultValue` fallbacks for every backfillable field.

Save migration must restore the serialized RNG state from `rng.state`, not just `citySeed`, or long-run determinism breaks after reload.

Hidden tabs pause the accumulator — no catch-up burst on refocus.

## Save State And Migration (Check On Every Feature)

Any change that adds, removes, or renames a field on `GameState` (or any nested type) requires updates in **three** places. Before finishing a feature, explicitly ask: _does this change the shape of what gets saved to localStorage?_ If yes:

1. **`src/game/types.ts`** — add the new field to `GameState` (or the relevant nested type).
2. **`src/game/factories.ts` → `createInitialGameState()`** — set a default value so fresh runs always have the field. Then add a defensive fallback in **`migrateGameState()`** so existing saves without the field load cleanly (e.g. `raw.newField ?? defaultValue`). If the schema change is significant, bump `SCHEMA_VERSION`.
3. **`src/game/factories.ts` → `cloneGameState()`** — if the new field is an object or array, add an explicit spread or map so it gets deep-copied. Primitive fields are handled by `...prev` automatically.

Do this even for fields that seem cosmetic or optional. A missing field on a loaded save produces `undefined` where the sim expects a number, which causes silent NaN propagation that is hard to diagnose.

## Schema History (Current = v13)

- **v5** — AI fields: `ResourceNode.workTicks`, `Agent.threatMemory`, `Enemy.archetype`, `Enemy.squadId`, optional `Enemy.dashTicks`. Backfilled with `?? default`.
- **v6** — existed only during 3.0.0 branch testing; uses the same field-presence fallback path as older saves.
- **v7** — Balancing & Behavior update: new `warden` enemy kind and `missileLauncher` upgrade in the unions; per-worker `speedMod` / `fearMod` / `harvestBias` variance plus class-ability ticks (`overclockTicks`, `sprintTicks`, `sprintCooldown`) and corruption fields (`corrupted`, `corruptionTicks`, `corruptingTicks`, `spottedTicks`, `rebootTicks`); turret HP fields (`hp`, `maxHp`, `damageTicks`, `brokenTicks`); scout/sentinel HP + retreat fields (`hp`, `maxHp`, `damageTicks`, `retreating`, `rebootTicks`); new top-level `missileSilos: MissileSilo[]`, `city: CityState`, `nextSiloId` fields; stats counters `wardensKilled`, `corruptedPurified`, `turretsBroken`.
- **v8** — `Enemy.permanentCloak?` (warden ghost rework — backfills `true` for wardens on load).
- **v9** — `Scout.disabledTicks` and `Sentinel.disabledTicks` so zapper bolts can disrupt mobile defenders the same way they already do workers and turrets.
- **v10** — `Enemy.latchedWorkerId?` (warden parasite latch — persists mid-latch saves; pre-v10 saves default to `null` so the warden resumes roaming).
- **v11** — adds four fields together: `state.archiveLog` (long-form 200-entry mirror for upgrade/event/achievement categories), `Agent.spookedTicks` (post-flee threat-aversion memory), and the (now-legacy) `state.achievementToastQueue` + `state.enemyDiscoveryQueue` parallel toast queues plus `state.discoveredEnemies`.
- **v12** — collapses the two parallel queues into a single `state.notifications: Notification[]` (discriminated union of `achievement` / `enemy-discovered`). The migration translates legacy v11 `achievementToastQueue` and `enemyDiscoveryQueue` entries via `buildAchievementNotification` / `buildEnemyDiscoveredNotification` and preserves stable ids for idempotent re-pushes. `state.discoveredEnemies` is unchanged.
- **v13** (4.0) — adds `state.upgradeAutoMaster: "all" | "none" | "custom"` and `state.upgradeAutoFlags: Partial<Record<UpgradeKey, boolean>>` for the manual/auto purchase split. **Asymmetric default (identity preservation):** fresh 4.0 saves default `upgradeAutoMaster: "none"` + `{}` (players buy manually — the 4.0 identity), but loaded pre-13 saves migrate to `upgradeAutoMaster ?? "all"` + `upgradeAutoFlags ?? {}` so returning players keep the autobuy-everything idle experience. `upgradeAutoFlags` is an object → deep-copied in `cloneGameState`; `upgradeAutoMaster` is a primitive (handled by `...prev`).
  - 4.0 Phase 2 also adds `state.priorityMarks: { enemyId; expiresAt }[]` and the optional `Agent.suggestedTarget?: { kind; id?; expiresAt }`. Both are short-lived interaction state (see [workers.md](workers.md) / [defenses.md](defenses.md)) and are **additive within v13 — no SCHEMA_VERSION bump.** `priorityMarks` backfills `?? []` (deep-copied array in `cloneGameState`); `suggestedTarget` is optional so it defaults to absent/`undefined` and rides the existing `...agent` shallow spread in both clone and migrate.
  - 4.0 Phase 3 adds two more **additive-within-v13** fields (no bump): `stats.autobuyOffTicks` (continuous master-autobuy-off tick counter for `autobuy_off_milestone`; backfills `?? 0`) and `state.meta: { v4OnboardingSeen: boolean }` (deep-copied `{ ...prev.meta }` in `cloneGameState`). `meta` uses the **same asymmetric default as `upgradeAutoMaster`**: fresh 4.0 runs default `v4OnboardingSeen: false` (show the onboarding overlay once), but a loaded save with NO `meta` is a pre-4.0 returning player and migrates to `true` (skip the overlay). A 4.0-era save carrying `meta` keeps its stored flag.

All new fields carry `?? []` / `?? {}` / `?? 0` migration fallbacks.

## Other Migration Backfills

`migrateGameState()` also backfills the newer interaction fields with defensive defaults:

- `stats.eventTagsInspected`, `stats.touristClicks`, `stats.touristPassesClicked`
- `touristWorker.passId`, `touristWorker.lastClickedPassId`, `touristWorker.squishTicks`
- `lostDrone`
- `activeEvents[].revertOnExpire`
- `Enemy.targetKind` defaults to `"agent"`
- Existing saves with 3 agents still get `agent.active: true` defaulted on migration
- Legacy `string[]` log entries → `{ tick: 0, category: "system", message: entry }`

## Entity Spawn / Death Animation Fields

`ResourceNode`, `Enemy`, and `Agent` each carry a `spawnTick: number` field (set to `timers.tick` at creation/respawn/reboot). `Enemy` also carries `dyingTicks: number` (counts down from `DEATH_FADE_TICKS` after hp hits 0). Both fields are used **only in the renderer** (`FieldSvg.tsx`).

Rules for these fields:

- Always pass `state.timers.tick` when calling `makeNode`, `respawnNode`, `makeWorker`, or `spawnEnemy` at runtime. The initial-state factory (`createInitialGameState`) passes `0`, which the renderer treats as "no fade".
- Set `spawnTick` in `movement.ts` when a worker's reboot countdown reaches 0 (not in `combat.ts`).
- Migration must add `?? 0` fallbacks for both `spawnTick` and `dyingTicks` on all three entity types so loaded saves do not flash-in.
- **Do not use `dyingTicks` for any sim logic.** Movement, targeting, and combat all guard on `enemy.hp > 0`. Dying enemies linger in `state.enemies` for visual purposes only — they must not participate in gameplay.
- If you add a new entity type that spawns/despawns at runtime, follow the same pattern: `spawnTick` on the entity, set at construction, used only in the renderer.

### dyingTicks lifecycle

`resolveEnemyDeaths` (in `combat.ts`) owns the `dyingTicks` lifecycle: it sets the countdown on newly killed enemies, ticks it down for already-dying ones, and filters the array. **Order matters** — the countdown is set _before_ the filter runs so newly killed enemies are not immediately removed.

`Enemy.dyingTicks` counts from `DEATH_FADE_TICKS` (18) down to 0 after `hp` hits 0. While `dyingTicks > 0`, the enemy stays in `state.enemies` but is skipped by movement, targeting, and combat (all those paths already guarded on `hp > 0`). Removed from state once `dyingTicks` reaches 0.

### Temporary node fade-out

Temporary nodes use their existing `despawnAt` field for a fade-out warning: `despawnAlpha` begins fading 60 ticks before the deadline.

### Renderer helpers

In `FieldSvg.tsx`: `spawnAlpha(tick, spawnTick)`, `deathAlpha(dyingTicks)`, `despawnAlpha(tick, despawnAt)`. Each entity wraps its render in a `<g opacity={...}>` combining whichever alphas apply.

## App-Shell Version Banner

The app shell separately polls `/version` about every 5 minutes (and when the tab regains focus), extracts a flat semver from the response body, and compares it to `CURRENT_VERSION`. When the live version is newer, `App.tsx` shows a banner with `Refresh`, `Close`, and session-only `Don't Show Again`. The ignore state is intentionally **ephemeral** and is not part of save data or localStorage migration. The hidden admin panel also has a `Show Update Banner` action that forces the same banner path open using a preview patch version, so QA can exercise the refresh/dismiss controls without waiting for a deploy.
