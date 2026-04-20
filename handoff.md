# Nexus Drift Handoff

## Overview

Nexus Drift is a React + TypeScript + Vite app that runs an ambient autonomous colony sim entirely in the browser. The original single-file artifact is preserved at `reference/idle_wallpaper_game.reference.jsx`; the maintainable app lives under `src/`.

Current version: **2.0.1**. The in-game changelog is at `src/changelog.ts` and opens via the version badge in the header. As of 2.0.0 the project dropped its leading `0.` prefix from all historical versions — the first release is now `0.1.0` (was `0.0.1`), and the "Living Field" milestone is `2.0.0` (was `0.2.0`).

## Core Architecture

- `advanceGame(prev)` is the single simulation orchestrator. It clones state, advances timers, runs each subsystem in a fixed order, and returns the new state.
- The subsystem execution order inside `advanceGame.ts` is load-bearing and is fully documented with per-step rationale in that file. Do not reshuffle without reading those comments.
- Simulation logic is split across focused modules in `src/game/subsystems/`.
- `GameState` carries a seeded `Rng` instance and `citySeed`, so simulation randomness is deterministic once a run starts. All gameplay randomness must flow through the seeded `Rng`, never `Math.random()`.
- Save files carry a `schemaVersion` field (currently `2`). `migrateGameState()` always stamps the current version on load and handles v1 saves (no version field) gracefully. The `SCHEMA_VERSION` constant lives in `factories.ts`.
- Presentation-only calculations live in `selectors.ts` and are exposed to React as derived state. Do not put derived calculations inside subsystems.
- React rendering sits on top of the sim via `useGameLoop()`: `requestAnimationFrame` + fixed-tick accumulator, pauses on hidden tabs, autosaves every 30 seconds.

## Project Structure

- `src/App.tsx` — top-level layout, save bootstrap, speed presets, achievement UI, easter-egg listeners, admin panel, and release-history modal
- `src/changelog.ts` — structured in-game release notes (source of truth for version history)
- `src/components/Background.tsx` — animated starfield and atmosphere layers
- `src/components/EventBackdrop.tsx` — full-screen ambient effect overlay keyed off `derived.activeEvents`. Purely presentational, never touches sim state. Respects `prefers-reduced-motion` (static color washes still render, particle animations gate off). Effect per event id: `meteor_shower`, `solar_flare`, `cache_discovery`, `pirate_caravan`, `xeno_bloom`, `dust_storm`, `echo_signal`.
- `src/components/EventChip.tsx` — active-event HUD chip. Tone-coded by `EventDef.tone`. Hover or focus reveals a tooltip with flavor text and a per-effect list (each item colour-coded by its own tone). Uses local state only.
- `src/components/UpgradeIndicatorRail.tsx` — compact rail of one glowing dot per currently-visible upgrade. Category colour (yield / defense / support / elite) is centralized in a `UPGRADE_CATEGORY` map inside the component. Glow intensity scales with level (capped at 5 so late game does not wash out), and affordability drives a pulsing outer ring. Visibility rules mirror `Sidebar` exactly (tier gate + sentinel brute-kill gate). Tooltips pop upward from the bottom strip so they render inside the field card's `overflow-hidden` bounds.
- `src/components/FieldStatsStrip.tsx` — horizontal stat pill row with per-pill tooltips. Each pill carries a tone (`calm` / `warn` / `danger` / `ready` / `toxic`) driven by derived state (integrity thresholds, `hostilePressure`, `corruptionPressure`, `progression.recoveryMode`, tier). Labels hide on mobile; icons + values + dots remain. Corruption pill shows a single combined count (corruptors + infected nodes) to stay compact.
- `src/components/FieldSvg.tsx` — battlefield SVG rendering (workers, enemies, nodes, sentinels, projectiles, day/night cycle)
- `src/components/Sidebar.tsx` — economy, automation, and threat panels
- `src/components/HudPrimitives.tsx` — shared HUD widgets (StatusBadge, ResourcePill, StatTile, UpgradeTile)
- `src/components/ui/` — local card and progress bar primitives
- `src/hooks/useGameLoop.ts` — rAF-driven simulation loop, pause-on-hidden, autosave, direct state mutation hook for admin controls
- `src/game/advanceGame.ts` — thin orchestrator over subsystem steps; execution order documented inline
- `src/game/achievements.ts` — achievement definitions and unlock helper
- `src/game/persistence.ts` — localStorage save/load with `schemaVersion`-aware migration
- `src/game/factories.ts` — initial state, entity construction, `SCHEMA_VERSION`, `migrateGameState`
- `src/game/selectors.ts` — UI-facing derived state
- `src/game/balance.ts` — single source of truth for all tuning constants
- `src/game/rng.ts` — deterministic Mulberry32 PRNG
- `src/game/targeting.ts` — shared targeting helpers
- `src/game/events/eventDefs.ts` — seeded random-event definitions and activation helper
- `src/game/subsystems/` — economy, spawns, movement, corruption, turrets, scouts, sentinels, combat, mining, autobuy, projectiles, events, achievements
- `src/game/__tests__/advanceGame.test.ts` — 24 tests: simulation invariants, subsystem behavior, save/load round-trip
- `.gitlab-ci.yml` — verify and container-build pipeline
- `docker/nginx.conf` — SPA serving config with security headers
- `Dockerfile` — multi-stage production image build

## Layout

The UI uses Tailwind with a responsive flex layout:

- **Mobile / small tablet (< 1024px)**: title → field card (full width) → resource pills → speed controls → sidebar stacked below. The field gets immediate focus.
- **Desktop / large tablet (lg, ≥ 1024px)**: field + sidebar side by side; sector status card collapses to a compact single-row bar positioned absolute top-right; speed presets and New Game button integrate into the title row. This threshold was chosen so 11-inch iPads in landscape (1194px CSS) get the full desktop layout. The `xl` (1280px) breakpoint no longer drives layout — all structural classes use `lg:`.
- The field card and sidebar wrapper are direct children of a `lg:grid-cols-[1.45fr_0.85fr]` grid. **Both carry `min-w-0`**, without which grid items default to `min-width: auto` and the intrinsic content width of scrollable pill strips / long labels forces the grid wider than the viewport, pushing the sidebar off-screen. Do not remove `min-w-0` from either.
- Achievement badges live inside the field card, below the field toolbar, so they don't consume outer layout height.
- The field card footer contains, top to bottom: the active events bar (`EventChip`s), the `FieldStatsStrip` (live stats), and the `UpgradeIndicatorRail` (glowing dots). All three sit inside the field card so the sidebar is not required for glanceable colony monitoring. This is the primary mobile HUD surface — keep any new live indicators here rather than in the sidebar.
- Max content width is 1920px with wider gutters at xl.

## Game Systems

### Resources

**Gold, Ore, Gems, Energy, Cores, Flux.** Gold anchors the early economy. Cores come from elite combat kills (brutes, phantoms). Flux comes from anti-corruption play (purges, corruptor kills). Upgrade costs can consume multiple resource types.

### Workers

Kinds: `miner`, `runner`, `drone`. Workers pick targets autonomously via a scored target-selection function in `factories.ts`. They evade threats with sticky enter/exit hysteresis, recover from damage, reboot from home pads on destruction, and accumulate veteran ranks (kills nearby → speed bonus + visual chevron).

### Enemies

**Combat** (`mite`, `raider`, `wisp`, `rusher`, `brute`, `sapper`, `leech`, `phantom`): pursue workers, apply pressure, targeted by turrets. Phantoms cycle cloak and disappear from turret targeting while hidden. Sappers detonate near workers. Brutes and phantoms yield Core fragments on death.

**Corruptors** (`corruptor`, `blight`): never attack workers. Never target gold nodes. Prefer ore/gems/energy. Attach while corrupting and reduce economic output. Blight is the heavier variant with early scout resistance.

### Turrets

Static base defense. Target combat enemies only (never corruptors, never cloaked phantoms). Range and cooldown respond to event modifiers.

### Scouts

Dedicated anti-corruption units. Priority: live corruptors → high-corruption nodes → patrol home. Not mobile turrets. Multi-scout synergy: a second scout on the same node purges faster than the sum of two solo rates. Four physical scout slots in state; activation gated by upgrade level.

### Sentinels

Heavy late-game ground mechs. Patrol midfield when idle. Priority: leech > brute > sapper > general combat. Two physical sentinel slots; activation gated by upgrade level.

### Mining

Workers harvest assigned nodes with kind-specific behavior and crit chances. Corrupted nodes yield less. Foundry upgrades increase yield and respawn speed. Temporary cache nodes disappear on exhaustion instead of respawning.

### Entity Spawn / Death Animation

Nodes, enemies, and agents all fade in and out rather than popping. Three fields drive this entirely in the renderer (`FieldSvg.tsx`) — no presentation logic leaks into the sim:

- **`spawnTick: number`** on `ResourceNode`, `Enemy`, and `Agent` — the `timers.tick` value when the entity entered the field. Set in `makeNode`, `respawnNode`, `makeWorker`, `spawnEnemy`, and in `combat.ts` at agent reboot. Migration fallback `?? 0` disables fade for loaded saves (avoids a flash-of-invisible on load).
- **`dyingTicks: number`** on `Enemy` — counts from `DEATH_FADE_TICKS` (18) down to 0 after `hp` hits 0. While `dyingTicks > 0`, the enemy stays in `state.enemies` but is skipped by movement, targeting, and combat (all those paths already guarded on `hp > 0`). Removed from state once `dyingTicks` reaches 0.
- Temporary nodes use their existing `despawnAt` field for a fade-out warning: `despawnAlpha` begins fading 60 ticks before the deadline.

`resolveEnemyDeaths` (in `combat.ts`) owns the `dyingTicks` lifecycle: it sets the countdown on newly killed enemies, ticks it down for already-dying ones, and filters the array. Order matters — the countdown is set *before* the filter runs so newly killed enemies are not immediately removed.

Renderer helpers in `FieldSvg.tsx`: `spawnAlpha(tick, spawnTick)`, `deathAlpha(dyingTicks)`, `despawnAlpha(tick, despawnAt)`. Each entity wraps its render in a `<g opacity={...}>` combining whichever alphas apply.

### Random Events

Two event layers: ambient flavor log chatter (original), and seeded mechanical events (30–90 second timer). Mechanical events write into `state.activeEvents`, push multipliers into `state.eventModifiers`, and render countdown banners in the HUD. Night (day/night cycle) slightly biases toward harsher events. Active events are visible in the HUD above the field.

Each `EventDef` in `src/game/events/eventDefs.ts` carries presentational metadata alongside its mechanical `apply` / `revert`: `flavor` (short narrative line), `tone` (`boon` / `threat` / `mixed` / `neutral` — drives chip colour), and `effects: { text, tone }[]` (per-line breakdown shown in the tooltip). Keep these in sync when tuning an event's mechanics — the tooltip is the player's only source of truth for what the event actually does.

Two presentational layers consume that metadata:

- `EventBackdrop` renders a distinct ambient effect per active event id (color wash + particles + blurs). Effects compose additively when multiple events are active.
- `EventChip` renders the HUD pill with hover/focus tooltip. Tone colours are centralized in a `TONE_STYLE` map inside the component.

`getEventDef(id)` is exported from `eventDefs.ts` for presentational lookups — never mutate the returned def.

### Autobuy

Weighted upgrade prioritization with emergency paths (e.g. buy sentinel if 2+ brutes alive). Reads final resource totals after income and combat rewards. Multi-resource cost shapes are supported.

### Prestige

Auto-triggers when the colony is rich, stable, and clear enough. Combo bonus stacks with Archive upgrades.

### City / Home District

The home district skyline evolves with progression and upgrade investment. Mature colonies attract a wandering tourist drone after 15+ real-time minutes at city stage 5.

### Persistence And Idle UX

Autosaves to localStorage every 30 seconds. Saves carry `schemaVersion: 2`; `migrateGameState()` handles v1 (no version field) and future versions by stamping current schema on load. Hidden tabs pause the accumulator — no catch-up burst on refocus. `localStorage["nexusDriftSave"]` is the active save slot.

### Achievements

12 achievements: prestige, kill milestones, event coverage, progression tiers, long survival, hidden discoveries. Ribbon in the HUD; clicking opens a modal with all 12 listed (unearned greyed out).

### Easter Eggs

- Konami code toggles synthwave palette and logs a message.
- Typing `drift` anywhere logs "The drift remembers." and unlocks an achievement.
- Tourist drone wanders the field after 15 real-time minutes at city stage 5.
- At tier 9+, a 1% chance per big-event roll recruits a lost drone permanently.
- Admin panel: press `Space` five times with page focus. Exposes speed controls and event trigger buttons.

## Invariants

- `advanceGame()` is the single orchestrator — no simulation logic outside it.
- Subsystem execution order matters; rationale documented in `advanceGame.ts`.
- All gameplay randomness flows through the seeded `Rng`, not `Math.random()`.
- `cloneGameState()` uses shallow-spread. State must remain single-level (objects of primitives or arrays of flat objects). Deeper nesting will silently break cloning.
- Save migration must restore the serialized RNG state from `rng.state`, not just `citySeed`, or long-run determinism breaks after reload.
- Presentation-only derivations belong in `selectors.ts`, not simulation subsystems.
- Corruptors never attack workers and never target gold nodes.
- Turrets never target corruptors and ignore cloaked phantoms.
- Scouts stay visually distinct from turrets and have first crack at corruption cleanup.
- Wallpaper feel beats perfect simulation purity.

## Current Operational Notes

- Header version badge opens the in-game changelog.
- Public speed presets (1×/2×/4×) are in the main UI. Admin panel (5× Space) adds extended controls and event triggers.
- `package.json` version and `src/changelog.ts` must stay in sync for every release.
- When releasing, also update `README.md` and this file if architecture or player-facing behavior changed.
- ESLint `no-explicit-any` is set to `error` — any `any` will fail the build.
- 24 tests in `src/game/__tests__/advanceGame.test.ts` cover simulation invariants, subsystem behavior, and save/load round-trips.

## Remaining Work

### High Priority

- Long-duration soak testing (30+ minutes at 1×) to confirm no memory leaks or FPS degradation at late game.
- Verify Docker image serving and GitLab registry flow end-to-end.

### Medium Priority

- Dev overlay for live tick counts, enemy counts, corruption state, and autobuy choices.
- More late-game sinks for `cores` and `flux`.
- Headless soak-test utility for large deterministic runs.

### Nice To Have

- Replay support beyond the current save/load snapshot.
- Weather, sound hooks, and alternate visual themes beyond the synthwave easter egg.
- Export/import save flow (currently one local slot only).

## Local Commands

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run lint
npm run build
npm run preview
npm run format:check
```

## CI And Docker

- `verify` stage: `npm ci`, `npm run typecheck`, `npm test`
- `build` stage: Kaniko builds and publishes the production container image
- Notification stages report success or failure

Production model: Vite build → Nginx serves `dist/` → reverse proxy handles TLS.

Local Docker verification:

```bash
docker build -t nexus-drift .
docker run --rm -p 8080:80 nexus-drift
# open http://localhost:8080
```

## Reading Order For New Contributors

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
