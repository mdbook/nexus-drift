# Architecture

**Source files:** `src/App.tsx`, `src/game/advanceGame.ts`, `src/game/factories.ts`, `src/game/selectors.ts`, `src/game/balance.ts`, `src/game/rng.ts`, `src/hooks/useGameLoop.ts`
**Tests:** `src/game/__tests__/advanceGame.test.ts`
**Key invariants:** single orchestrator; subsystem order is load-bearing; seeded RNG only; shallow `cloneGameState`; presentation goes in `selectors.ts`.

## Overview

Nexus Drift is a React + TypeScript + Vite app that runs an ambient autonomous colony sim entirely in the browser. The original single-file artifact is preserved at `reference/idle_wallpaper_game.reference.jsx`; the maintainable app lives under `src/`. The in-game changelog is at `src/changelog.ts` and opens via the version badge in the header.

## Simulation Spine

- `advanceGame(prev)` is the single simulation orchestrator. It clones state, advances timers, runs each subsystem in a fixed order, and returns the new state.
- The subsystem execution order inside `advanceGame.ts` is **load-bearing** and is fully documented with per-step rationale in that file. Do not reshuffle without reading those comments.
- Simulation logic is split across focused modules in `src/game/subsystems/`: economy, spawns (+ `stepWardenSpawn`), movement, workers (slot activation), corruption, workerCorruption (warden parasite latch + node drain + worker reporting), turrets, scouts, sentinels (+ cleanse path), combat, mining, autobuy, projectiles, events, achievements.
- `GameState` carries a seeded `Rng` instance and `citySeed`, so simulation randomness is deterministic once a run starts. **All gameplay randomness must flow through the seeded `Rng`, never `Math.random()`.** The utility helpers `rand`, `pick`, `chance`, and `pickWeighted` in `src/game/utils.ts` still use `Math.random` and are only safe for cosmetic layers (starfield); keep them out of every subsystem.
- `cloneGameState()` uses shallow-spread. State must remain single-level (objects of primitives or arrays of flat objects). Deeper nesting will silently break cloning. If a new field is an object or array, add an explicit spread or map in `cloneGameState()` so it gets deep-copied. Primitive fields are handled by `...prev` automatically.
- Presentation-only calculations live in `selectors.ts` and are exposed to React as derived state. Do not put derived calculations inside subsystems.
- React rendering sits on top of the sim via `useGameLoop()`: `requestAnimationFrame` + fixed-tick accumulator, pauses on hidden tabs, autosaves every 30 seconds, and publishes a live field snapshot plus a short-throttled UI snapshot (`125ms`) so sidebar/chrome rendering is not locked to the full sim cadence. `useGameLoop()` also caps catch-up work at 180 simulation ticks per animation frame so admin 100× mode cannot back up an unbounded queue.

## Tick Math

- Elapsed-tick comparisons against `state.timers.tick` must be `(tick - last + TICK_WRAP) % TICK_WRAP`. The tick counter wraps at `TICK_WRAP = 10_000_000`; naive subtraction goes negative after a wrap and silently breaks the gate it is driving.
- Worker identity in cadence math uses `agent.id`, not the array index. Array positions shift when peers die or reboot; `agent.id` is stable for the worker's lifetime.

## Type Discipline

- `TaskState` in `types.ts` enumerates every HUD task label. Any new `agent.task = "…"` / `scout.task = "…"` / `sentinel.task = "…"` assignment must add its label to that union.
- ESLint `no-explicit-any` is set to `error` — any `any` will fail the build and CI.

## Snapshot Channels

Sector card, resource bar, and sidebar intentionally read the throttled `uiGame` / `uiDerived` snapshot. The field SVG and field-card live indicators still read the per-tick snapshot.

## Project Structure

App shell and rendering:

- `src/App.tsx` — top-level layout, save bootstrap, speed presets, achievement UI, easter-egg listeners, admin console mount, release-history modal.
- `src/changelog.ts` — structured in-game release notes (source of truth for version history). Every non-trivial shipped change should land here, either as a new release entry or by expanding the current version's entry before release.
- `index.html` — app metadata, multi-format favicon/manifest links, and Open Graph / Twitter embed tags. Favicon uses the branded `nexus-drift` mark via SVG + PNG + ICO fallbacks; embeds use `public/og-image.png`.
- `src/components/FieldSvg.tsx` — battlefield SVG (workers, enemies, nodes, sentinels, projectiles, day/night cycle). Home-district building geometry is memoized by `citySeed` + active turret layout. Hosts the tourist drone as a keyboard/click target with an expanded transparent hit area.
- `src/components/Background.tsx` — animated starfield and atmosphere layers. Under `useLowFxMode`, swaps to a static cheaper variant with fewer stars and no drifting glow animation.
- `src/components/EventBackdrop.tsx` — full-screen ambient effect overlay keyed off active event ids. Purely presentational. Respects `prefers-reduced-motion` and `useLowFxMode`.
- `src/components/EventChip.tsx`, `src/components/UpgradeIndicatorRail.tsx`, `src/components/FieldStatsStrip.tsx` — field-card HUD widgets. See [layout.md](layout.md) for tooltip and placement conventions.
- `src/components/ActivityLog.tsx`, `src/components/NotificationStack.tsx`, `src/components/AchievementsModal.tsx`, `src/components/WikiOverlay.tsx` — log/feed/modal surfaces.
- `src/components/AdminPanel.tsx` — hidden admin console (Space ×5, or tap version badge ×5 within 2 s on mobile). Single Card with `grid-template-rows` height animation; frosted-pill chevron at the top edge; vertically resizeable body (200 px – 85 dvh, default 460 px). UI state only — not persisted.
- `src/components/Sidebar.tsx` — economy, automation, and threat panels.
- `src/components/HudPrimitives.tsx` — shared HUD widgets (`StatusBadge`, `ResourcePill`, `StatTile`, `UpgradeTile`).
- `src/components/ui/` — local card and progress bar primitives.

Hooks and libs:

- `src/hooks/useGameLoop.ts` — rAF-driven simulation loop, pause-on-hidden, autosave, direct state mutation hook for admin controls, throttled `uiGame` / `uiDerived` snapshot.
- `src/hooks/useLowFxMode.ts` — presentation-only media-query hook for coarse-pointer `lg` desktop layouts (notably iPadOS landscape Safari). Never branch gameplay or sim logic on it.
- `src/hooks/useVersionCheck.ts` — app-shell polling hook for `/version`. Fetches roughly every 5 minutes plus on tab refocus/visibility return, extracts a flat semver, surfaces a session-scoped update banner, and exposes an admin-only preview trigger.
- `src/lib/versionCheck.ts` — version parsing/comparison helper plus the `/version` fetch wrapper used by `useVersionCheck`.
- `src/lib/isBetaBuild.ts` — single beta-build gate. Returns true when `import.meta.env.DEV === true` or `window.location.hostname` starts with `nexus-drift-beta`. When true: renders an amber `BETA` pill next to the version button; swaps the `<link rel*="icon" type="image/svg+xml">` href in `main.tsx` from `nexus-drift.svg` → `nexus-drift-dev.svg` (raster icons stay pointed at production assets); prefixes the document title with `[BETA]`.

Game core:

- `src/game/advanceGame.ts` — thin orchestrator over subsystem steps; execution order documented inline.
- `src/game/factories.ts` — initial state, entity construction, `SCHEMA_VERSION`, `migrateGameState`. See [persistence.md](persistence.md).
- `src/game/persistence.ts` — localStorage save/load with `schemaVersion`-aware migration.
- `src/game/selectors.ts` — UI-facing derived state.
- `src/game/balance.ts` — single source of truth for all tuning constants.
- `src/game/rng.ts` — deterministic Mulberry32 PRNG.
- `src/game/targeting.ts` — shared targeting helpers (`pickEnemyTarget`, `pickEnemyTargetMulti`).
- `src/game/purchases.ts` — `purchaseUpgrade`, the single shared upgrade-buy path for both manual and auto (`stepAutobuy`) purchases. See [economy.md](economy.md).
- `src/game/events/eventDefs.ts` — seeded random-event definitions and activation helper. See [events-achievements.md](events-achievements.md).
- `src/game/achievements.ts` — achievement definitions, unlock helper, and the explicit interaction helpers (`spotTourist()`, etc.). See [events-achievements.md](events-achievements.md).
- `src/game/adminCommands.ts` — pure admin command executor used by `AdminPanel`. Commands mutate the cloned `GameState` supplied by `mutateGame()` and return shell effects for speed/banner actions instead of reaching into React state directly.

## Reading Order

When walking into the repo cold:

1. `src/App.tsx`
2. `src/changelog.ts`
3. `src/hooks/useGameLoop.ts`
4. `src/game/advanceGame.ts`
5. `src/game/balance.ts`
6. `src/game/subsystems/`
7. `src/game/events/eventDefs.ts`
8. `src/game/selectors.ts`
9. `src/components/FieldSvg.tsx`
10. `src/components/EventBackdrop.tsx` and `src/components/EventChip.tsx`
11. `src/components/FieldStatsStrip.tsx` and `src/components/UpgradeIndicatorRail.tsx`
12. `src/components/Sidebar.tsx`

Compare against `reference/idle_wallpaper_game.reference.jsx` to recover the original intended behavior or feel.
