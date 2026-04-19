# Nexus Drift Handoff

## Overview

Nexus Drift is a React + TypeScript + Vite app that runs an ambient autonomous colony sim entirely in the browser. The original single-file artifact is preserved at `reference/idle_wallpaper_game.reference.jsx`; the maintainable app lives under `src/`.

The current build exposes release history inside the game itself. Click the version badge beside `Autonomous Colony Sim` in the header to open the in-game changelog. The hidden admin panel now includes event trigger buttons in addition to the speed controls.

## Core Architecture

- `advanceGame(prev)` remains the single simulation orchestrator, and the step order still matters.
- Simulation logic is split across focused modules in `src/game/subsystems/`.
- `GameState` carries a seeded `Rng` instance and `citySeed`, so simulation randomness is deterministic once a run starts.
- `GameState` also carries timed `activeEvents`, event modifiers, live `cores` / `flux` resource slots, sentinel mech state, and the next big-event interval.
- Presentation-only calculations live in selectors and are exposed to React as derived state.
- React rendering is layered on top of the sim through `useGameLoop()`, which uses `requestAnimationFrame` plus a fixed-tick accumulator.

## Project Structure

- `src/App.tsx` - top-level layout, header, event banners, admin panel, and release-history modal
- `src/changelog.ts` - structured in-game release notes
- `src/components/Background.tsx` - animated starfield and atmosphere layers
- `src/components/FieldSvg.tsx` - battlefield SVG rendering
- `src/components/Sidebar.tsx` - economy, automation, and threat panels
- `src/components/HudPrimitives.tsx` - shared HUD widgets
- `src/components/ui/` - local card and progress primitives
- `src/hooks/useGameLoop.ts` - rAF-driven simulation loop plus direct state mutation hook for admin controls
- `src/game/advanceGame.ts` - thin orchestrator over subsystem steps
- `src/game/subsystems/` - economy, spawns, movement, corruption, turrets, scouts, sentinels, combat, mining, autobuy, projectiles, and events
- `src/game/events/eventDefs.ts` - seeded random-event definitions and activation helper
- `src/game/balance.ts` - single source of truth for tuning constants
- `src/game/rng.ts` - deterministic Mulberry32 PRNG
- `src/game/targeting.ts` - shared targeting helpers
- `src/game/factories.ts` - initial state and entity construction
- `src/game/selectors.ts` - UI-facing derived state
- `src/game/__tests__/advanceGame.test.ts` - simulation invariants
- `.gitlab-ci.yml` - verify and container-build pipeline
- `docker/nginx.conf` - SPA serving config with security headers
- `Dockerfile` - multi-stage production image build

## Core Game Mechanics

### Economy

Resources: **Gold, Ore, Gems, Energy, Cores, Flux**. Gold still anchors the early economy, Cores come from elite combat kills, and Flux comes from anti-corruption play. Upgrade costs can now consume multiple resource types instead of gold only.

### Workers

Kinds: `miner`, `runner`, `drone`. Workers pick targets autonomously, evade combat threats with sticky enter/exit behavior, recover when damaged, and reboot from home pads when destroyed.

### Enemies

Combat enemies (`mite`, `raider`, `wisp`, `rusher`, `brute`, `sapper`, `leech`, `phantom`) pursue workers, apply pressure, and are the only enemies turrets will engage. Phantoms cycle into cloak and disappear from turret targeting while hidden. Sappers detonate near workers. Brutes and phantoms can yield Core fragments.

### Corrupters

Corrupters do not attack workers. They never target gold nodes, prefer ore/gems/energy, attach while corrupting, and reduce effective economic output. `blight` is the heavier corruptor variant with stronger corruption pressure and early scout resistance.

### Turrets

Static base defense. One is live from the start, with more unlocked by upgrades. Turrets target combat enemies, obey event-based range and cooldown modifiers, and skip cloaked phantoms.

### Scouts

Dedicated anti-corruption units. They prioritize live corrupters, then sweep high-corruption nodes, then patrol home. They are not mobile turrets. There are four physical scout units in state, with activation still gated by upgrade level.

### Sentinels

Heavy late-game ground mechs. They patrol the midfield when idle, then prioritize leeches, brutes, and sappers before falling back to general combat targets. Two physical sentinel slots exist in state, with activation gated by upgrade level.

### Mining And Harvesting

Workers mine assigned nodes, apply kind-specific harvesting behavior, and benefit from crits. Corrupted nodes yield less, Foundry upgrades increase harvest yield, timed events can boost yield, and temporary cache nodes disappear instead of respawning when exhausted.

### Random Events

Ambient log chatter still fires on its original timer, but a second seeded event timer now rolls mechanical events between roughly 30 and 90 seconds. Timed events write into `state.activeEvents`, push multiplier changes into `state.eventModifiers`, and render countdown banners in the HUD. Instant events can add temporary nodes or inject off-schedule enemy spawns.

### Autobuy And Prestige

Autobuy reacts to threat, corruption, multi-resource affordability, and upgrade weighting. Prestige still auto-triggers when the colony is rich, stable, and clear enough to justify a reset.

### City / Home District

The home district skyline evolves as the colony grows. Its cadence and visual growth are tied to progression and upgrade investment rather than being purely decorative.

## Invariants

- `advanceGame()` remains the single orchestrator for the simulation tick.
- Step order inside `advanceGame()` is important; do not reshuffle casually.
- Presentation-only derivations belong in selectors, not simulation steps.
- All gameplay randomness should flow through the seeded `Rng`, not direct `Math.random()` calls.
- Worker evasion keeps the small enter radius, larger exit radius, multi-tick persistence, and vector-summed escape behavior.
- Corrupters never attack workers and never target gold nodes.
- Turrets never target corrupters and also ignore cloaked phantoms.
- Scouts stay visually distinct from turrets and keep first crack at corruption cleanup.
- Wallpaper feel still beats perfect simulation purity.

## Current Operational Notes

- The header version badge opens the in-game release history.
- The hidden admin speed panel toggles after pressing `Space` five times while focus is on the page body.
- The admin panel can manually fire any defined event, which is the fastest way to verify event banners and event-modifier effects in-browser.
- `package.json` version and `src/changelog.ts` should stay in sync whenever a release is being cut.

## Remaining Work

### High Priority

- Long-duration soak testing in a real browser session.
- Broaden the Vitest suite beyond invariants into more seeded subsystem edge cases.
- Verify Docker image serving and the GitLab registry flow end-to-end.

### Medium Priority

- Small dev overlay for tick counts, enemy counts, corruption state, and autobuy choice.
- Headless soak-test utility for large deterministic runs.
- More late-game sinks and interactions for `cores` and `flux` now that both resources are fully live.

### Nice To Have

- Replay or save/load support.
- Weather, day-night, sound hooks, and alternate visual themes.

## Local Commands

- `npm ci`
- `npm run dev`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run preview`
- `npm run format:check`

## CI And Docker

Pipeline model:

- `verify` stage runs `npm ci`, `npm run typecheck`, and `npm test`
- `build` stage uses Kaniko to build and publish the production image
- notification stages report pipeline success or failure

Production model: Vite build -> Nginx serves `dist/` over HTTP -> reverse proxy handles TLS.

Local verification:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `docker build -t nexus-drift .`
6. `docker run --rm -p 8080:80 nexus-drift`
7. open `http://localhost:8080`

## Known Gaps / Risks

- No save/load system yet.
- No explicit performance instrumentation.
- No automated release tagging flow beyond manual version and changelog updates.
- Tests cover invariants better than they cover balance regressions or visuals.

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
10. `src/components/Sidebar.tsx`

Compare against `reference/idle_wallpaper_game.reference.jsx` when you need to recover the original intended behavior or feel.
