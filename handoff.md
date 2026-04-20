# Nexus Drift Handoff

## Overview

Nexus Drift is a React + TypeScript + Vite app that runs an ambient autonomous colony sim entirely in the browser. The original single-file artifact is preserved at `reference/idle_wallpaper_game.reference.jsx`; the maintainable app lives under `src/`.

Current version: **2.2.9**. The in-game changelog is at `src/changelog.ts` and opens via the version badge in the header. As of 2.0.0 the project dropped its leading `0.` prefix from all historical versions — the first release is now `0.1.0` (was `0.0.1`), and the "Living Field" milestone is `2.0.0` (was `0.2.0`).

## Core Architecture

- `advanceGame(prev)` is the single simulation orchestrator. It clones state, advances timers, runs each subsystem in a fixed order, and returns the new state.
- The subsystem execution order inside `advanceGame.ts` is load-bearing and is fully documented with per-step rationale in that file. Do not reshuffle without reading those comments.
- Simulation logic is split across focused modules in `src/game/subsystems/`.
- `GameState` carries a seeded `Rng` instance and `citySeed`, so simulation randomness is deterministic once a run starts. All gameplay randomness must flow through the seeded `Rng`, never `Math.random()`.
- Save files carry a `schemaVersion` field (currently `3`). `migrateGameState()` always stamps the current version on load and handles v1/v2 saves gracefully. The `SCHEMA_VERSION` constant lives in `factories.ts`.
- Presentation-only calculations live in `selectors.ts` and are exposed to React as derived state. Do not put derived calculations inside subsystems.
- React rendering sits on top of the sim via `useGameLoop()`: `requestAnimationFrame` + fixed-tick accumulator, pauses on hidden tabs, autosaves every 30 seconds, and publishes a live field snapshot plus a short-throttled UI snapshot (`125ms`) so sidebar/chrome rendering is not locked to the full sim cadence.

## Project Structure

- `src/App.tsx` — top-level layout, save bootstrap, speed presets, achievement UI, easter-egg listeners, admin panel, and release-history modal
- `src/changelog.ts` — structured in-game release notes (source of truth for version history). Every non-trivial shipped change should be represented there, either as a new release entry or by expanding the current version's entry before release.
- `index.html` — app metadata, favicon/touch-icon links, and Open Graph / Twitter embed tags. Current setup: favicon uses the branded `nexus-drift` mark, embeds still use `public/og-image.png`.
- `src/hooks/useLowFxMode.ts` — presentation-only media-query hook for coarse-pointer `lg` desktop layouts (notably iPadOS landscape Safari). Use it to keep the same visual direction while dropping the most expensive continuous FX; never branch gameplay or sim logic on it.
- `src/components/Background.tsx` — animated starfield and atmosphere layers. On `useLowFxMode`, this swaps to a static cheaper variant with fewer stars and no drifting glow animation.
- `src/components/EventBackdrop.tsx` — full-screen ambient effect overlay keyed off active event ids. Purely presentational, never touches sim state. Respects both `prefers-reduced-motion` and `useLowFxMode`; the coarse-pointer path keeps the event colour washes/glows but drops the heavier particle loops and long-lived blur motion. Effect per event id: `meteor_shower`, `solar_flare`, `cache_discovery`, `pirate_caravan`, `xeno_bloom`, `dust_storm`, `echo_signal`.
- `src/components/EventChip.tsx` — active-event HUD chip. Tone-coded by `EventDef.tone`. Hover or focus reveals a tooltip with flavor text and a per-effect list (each item colour-coded by its own tone). Tooltip uses `position: fixed` with a ref-measured viewport anchor so it escapes the flex-wrap row's potential clipping ancestors.
- `src/components/UpgradeIndicatorRail.tsx` — compact rail of one glowing dot per currently-visible upgrade. Category colour (yield / defense / support / elite) is centralized in a `UPGRADE_CATEGORY` map inside the component. Glow intensity scales with level (capped at 5 so late game does not wash out), and affordability drives a pulsing outer ring. Visibility rules mirror `Sidebar` exactly (tier gate + sentinel brute-kill gate). Tooltip uses `position: fixed` — required because the rail's inner row has `overflow-x-auto` which would clip any `absolute bottom-full` tooltip via the CSS overflow interaction rule. Placement is responsive: mobile keeps it in the field footer; `lg` desktop renders it in a dedicated top-right chrome card above the resource bar.
- `src/components/FieldStatsStrip.tsx` — horizontal stat pill row with per-pill tooltips. Each pill carries a tone (`calm` / `warn` / `danger` / `ready` / `toxic`) driven by derived state (integrity thresholds, `hostilePressure`, `corruptionPressure`, `progression.recoveryMode`, tier). Labels hide on mobile; icons + values + dots remain. Corruption pill shows a single combined count (corruptors + infected nodes) to stay compact. Tooltip uses `position: fixed` for the same reason as `UpgradeIndicatorRail` (inner scroll row clips upward tooltips).
- `src/components/FieldSvg.tsx` — battlefield SVG rendering (workers, enemies, nodes, sentinels, projectiles, day/night cycle). Home-district building geometry is memoized by `citySeed` + active turret layout so decorative skyline generation is not repeated every tick. In low-FX mode the extra SVG text blur pass is disabled, but the foreground labels still render normally.
- `src/components/ActivityLog.tsx` — structured activity log panel: category icons, relative-age timestamps, filter tabs (including Awards), scrollable 40-entry history
- `src/components/AchievementsModal.tsx` — full achievements modal: category tabs, rarity colouring, hidden masking, progress bar, rarity legend
- `src/components/Sidebar.tsx` — economy, automation, and threat panels
- `src/components/HudPrimitives.tsx` — shared HUD widgets (StatusBadge, ResourcePill, StatTile, UpgradeTile)
- `src/components/ui/` — local card and progress bar primitives
- `src/hooks/useGameLoop.ts` — rAF-driven simulation loop, pause-on-hidden, autosave, direct state mutation hook for admin controls, and a throttled `uiGame` / `uiDerived` snapshot for scroll-heavy chrome surfaces
- `src/game/advanceGame.ts` — thin orchestrator over subsystem steps; execution order documented inline
- `src/game/achievements.ts` — achievement definitions and unlock helper
- `src/game/persistence.ts` — localStorage save/load with `schemaVersion`-aware migration
- `src/game/factories.ts` — initial state, entity construction, `SCHEMA_VERSION`, `migrateGameState`
- `src/game/selectors.ts` — UI-facing derived state
- `src/game/balance.ts` — single source of truth for all tuning constants
- `src/game/rng.ts` — deterministic Mulberry32 PRNG
- `src/game/targeting.ts` — shared targeting helpers
- `src/game/events/eventDefs.ts` — seeded random-event definitions and activation helper
- `src/game/subsystems/` — economy, spawns, movement, workers (slot activation), corruption, turrets, scouts, sentinels, combat, mining, autobuy, projectiles, events, achievements
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
- On mobile, the field card footer contains, top to bottom: the active events bar (`EventChip`s), the `FieldStatsStrip` (live stats), and the `UpgradeIndicatorRail` (glowing dots). This is the primary small-screen HUD surface — keep any new live indicators here rather than in the sidebar.
- On `lg` desktop layouts, the upgrade rail leaves the footer and renders in the otherwise-unused top-right chrome band above the resource bar. The footer overlay then reserves space only for the stats strip, which keeps active events and the field itself visible on shorter landscape screens.
- Max content width is 1920px with wider gutters at xl.

## Game Systems

### Resources

**Gold, Ore, Gems, Energy, Cores, Flux.** Gold anchors the early economy. Cores come from elite combat kills (brutes, phantoms). Flux comes from anti-corruption play (purges, corruptor kills). Upgrade costs can consume multiple resource types.

### Workers

Kinds: `miner`, `runner`, `drone`. Each kind has **3 slots** (9 agents total). Slot 0 starts active; slot 1 unlocks at upgrade level 3; slot 2 unlocks at upgrade level 6. The `active: boolean` field on `Agent` controls this — inactive agents are skipped by all sim logic and hidden in the renderer.

`WORKER_SLOTS_BY_UPGRADE` in `balance.ts` maps upgrade level → active slot count. `stepWorkerSlots()` in `subsystems/workers.ts` reconciles active flags against current upgrade levels each tick (called after `stepEconomy`, before `stepSpawns`).

Workers pick targets autonomously via a scored target-selection function in `factories.ts`. They evade threats with sticky enter/exit hysteresis, recover from damage, reboot from home pads on destruction, and accumulate veteran ranks (kills nearby → speed bonus + visual chevron).

### Enemies

**Combat** (`mite`, `raider`, `wisp`, `rusher`, `brute`, `sapper`, `leech`, `phantom`, `zapper`): pursue workers, apply pressure, targeted by turrets. Phantoms cycle cloak and disappear from turret targeting while hidden. Sappers detonate near workers. Brutes and phantoms yield Core fragments on death. Zappers (tier 7+) hold at firing range and fire energy bolts (`tag: "zapper-bolt"`) that disable the struck target for 210 ticks (~7s); disabled workers freeze with task `"Disabled"` and disabled turrets skip firing.

**Corruptors** (`corruptor`, `blight`): never attack workers. Never target gold nodes. Prefer ore/gems/energy. Attach while corrupting and reduce economic output. Blight is the heavier variant with early scout resistance.

### Turrets

Static base defense. Target combat enemies only (never corruptors, never cloaked phantoms). Range and cooldown respond to event modifiers. Carry a `disabledTicks` counter; while > 0 the turret skips targeting and firing entirely.

### Disable System

Workers and turrets carry `disabledTicks: number`. While > 0, the entity is inert (worker task becomes `"Disabled"`, turret skips its fire path) and the counter decrements each tick. Source today: zapper-bolt impact (sets `ZAPPER.disableDurationTicks = 210`). Worker reboot clears `disabledTicks`. Renderer shows disabled entities greyscale with a pulsing orange ring.

### Scouts

Dedicated anti-corruption units. Priority: live corruptors → corrupted nodes (all the way down to the cleanse threshold) → patrol home. Not mobile turrets. Multi-scout synergy: a second scout on the same node purges faster than the sum of two solo rates. Four physical scout slots in state; activation gated by upgrade level.

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

### Activity Log

`state.log` holds up to 40 `LogEntry` objects (bumped from 6 plain strings). Each entry carries:

- `tick: number` — the simulation tick when the entry was pushed (used to display "Xs ago" relative ages in the UI)
- `category: LogCategory` — one of `system`, `combat`, `mining`, `corruption`, `event`, `upgrade`, `achievement`, `ambient`
- `message: string` — the human-readable log line

`pushLog(log, message, category, tick)` is the sole write path. Every subsystem passes its category and `state.timers.tick`. `migrateGameState()` handles old saves that stored plain `string[]` entries by mapping them to `{ tick: 0, category: "system", message: entry }`.

The `ActivityLog` component (see `src/components/ActivityLog.tsx`) renders the log with:
- Per-category icon (lucide-react) and colour coding
- Relative-age timestamp ("3s ago", "1m ago")
- Category filter tab bar: All / Combat / Corrupt / Upgrade / Event
- Scrollable list (max-h-72) showing up to 40 entries, newest first
- A live pulsing dot in the header
- A bottom legend that links directly to each represented category

### Random Events

Two event layers: ambient flavor log chatter (original), and seeded mechanical events (30–90 second timer). Mechanical events write into `state.activeEvents`, push multipliers into `state.eventModifiers`, and render countdown banners in the HUD. Night (day/night cycle) slightly biases toward harsher events. Active events are visible in the HUD above the field.

Each `EventDef` in `src/game/events/eventDefs.ts` carries presentational metadata alongside its mechanical `apply` / `revert`: `flavor` (short narrative line), `tone` (`boon` / `threat` / `mixed` / `neutral` — drives chip colour), and `effects: { text, tone }[]` (per-line breakdown shown in the tooltip). Keep these in sync when tuning an event's mechanics — the tooltip is the player's only source of truth for what the event actually does.

Two presentational layers consume that metadata:

- `EventBackdrop` renders a distinct ambient effect per active event id (color wash + particles + blurs). Effects compose additively when multiple events are active. The component now keys off event ids rather than per-tick countdown state so long-running events do not rerender the full overlay every sim tick.
- `EventChip` renders the HUD pill with hover/focus tooltip. Tone colours are centralized in a `TONE_STYLE` map inside the component.

`getEventDef(id)` is exported from `eventDefs.ts` for presentational lookups — never mutate the returned def.

### Autobuy

Weighted upgrade prioritization with emergency paths (e.g. buy sentinel if 2+ brutes alive). Reads final resource totals after income and combat rewards. Multi-resource cost shapes are supported.

### Prestige

Auto-triggers when the colony is rich, stable, and clear enough. Combo bonus stacks with Archive upgrades.

### City / Home District

The home district skyline evolves with progression and upgrade investment. Mature colonies attract a wandering tourist drone after 15+ real-time minutes at city stage 5.

### Persistence And Idle UX

Autosaves to localStorage every 30 seconds. Saves carry `schemaVersion: 3`; `migrateGameState()` handles v1/v2 saves (pre-multi-slot) and future versions by stamping current schema on load. Existing saves with 3 agents get `active: true` defaulted on migration. Hidden tabs pause the accumulator — no catch-up burst on refocus. `localStorage["nexusDriftSave"]` is the active save slot.

### Achievements

44 achievements across 4 rarity tiers (`common` / `uncommon` / `rare` / `legendary`) and 6 categories (`combat`, `corruption`, `mining`, `progression`, `survival`, `secret`). `AchievementDef` now carries `rarity`, `category`, and an optional `hidden` flag. Hidden locked achievements display as "???" placeholders in the modal until revealed.

Categories and examples:
- **Progression** — level milestones (10/20/30), prestige stacking (1/3/5), threat tiers (5/8/10), all-upgrades-at-1 and all-at-5, foundry/archive max, cores/flux accumulation
- **Combat** — kill counts (10/100/500/1000), brutes (10/25), phantoms (5), leeches (3), sappers (10), first sentinel kill, turret level 8
- **Mining** — first crit, 25/100 crits, mined 1k/10k resources, gold hoard (5k), gem collector (200)
- **Corruption** — first purge, 50/200 purges, pristine (corruptors present + zero corrupted nodes), triple rot (3+ simultaneously), full spectrum (all three types)
- **Survival** — 15m/30m/1h/2h runtime, colony health 95% under pressure, every active worker full HP while hostiles are present
- **Secret** — drift easter egg, tourist spotted, lost drone, synthwave Konami, all 7 events, 3+ simultaneous events (legendary)

New stats tracked on `GameState.stats`: `phantomsKilled`, `leechesKilled`, `sappersKilled`, `sentinelKills`. `sentinelKills` is credited only when a sentinel lands the lethal hit; do not infer it later from target selection or corpse cleanup. Migration adds `?? 0` fallbacks for all four.

`state.stats.purges` counts completed node cleanses only. It increments in `stepScouts()` when a node crosses back under the corruption threshold and must not be incremented for corruptor or blight deaths.

`AchievementsModal` (`src/components/AchievementsModal.tsx`) replaces the inline modal in `App.tsx`. Features: category tab bar with per-tab unlock counts, rarity-coloured rows and badges, hidden-achievement masking toggle (eye icon), completion progress bar, and a rarity legend footer.

The achievement ribbon in the field card now uses rarity-coded border/background colours instead of flat indigo. An unlock count badge (e.g. `3/44`) appears at the right end of the strip.

### Easter Eggs

- Konami code toggles synthwave palette, logs a message, and unlocks the hidden `synthwave` achievement.
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
- Top project chrome also carries a GitLab source link beside the version badge.
- Public speed presets (1×/2×/4×) are in the main UI. Admin panel (5× Space) adds extended controls and event triggers.
- Sector card, resource bar, and sidebar intentionally read the throttled `uiGame` / `uiDerived` snapshot. The field SVG and field-card live indicators still read the per-tick snapshot.
- Favicon / touch icon live in `public/nexus-drift.svg` and `public/nexus-drift.png`. Social embeds intentionally remain pointed at `public/og-image.png`; do not swap embed art when only the favicon changes.
- ESLint intentionally ignores `.claude/worktrees/` so auxiliary local agent worktrees do not create parser-root conflicts during `npm run lint`.
- Coarse-pointer `lg` desktop layouts (notably iPadOS landscape Safari) intentionally run a lower-cost presentation path in `Background`, `EventBackdrop`, and `FieldSvg`. Preserve the same art direction there, but gate new expensive particles, long blur animations, and SVG filters behind `useLowFxMode`.
- `package.json` version and `src/changelog.ts` must stay in sync for every release.
- Unless the user explicitly asks for a new release boundary, assume follow-up polish work belongs to the same current release line and expand that changelog entry instead of bumping again.
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
