# Nexus Drift Handoff

## Overview

Nexus Drift is a React + TypeScript + Vite app that runs an ambient autonomous colony sim entirely in the browser. The original single-file artifact is preserved at `reference/idle_wallpaper_game.reference.jsx`; the maintainable app lives under `src/`.

The current build also exposes release history inside the game itself. Click the version badge beside `Autonomous Colony Sim` in the header to open the in-game changelog.

## Core Architecture

- `advanceGame(prev)` is still the single simulation orchestrator, but it is now intentionally thin.
- Simulation logic is split across focused modules in `src/game/subsystems/`.
- `GameState` carries a seeded `Rng` instance and `citySeed`, so simulation randomness is deterministic once a run starts.
- Presentation-only calculations live in selectors and are exposed to React as derived state.
- React rendering is layered on top of the sim through `useGameLoop()`, which uses `requestAnimationFrame` plus a fixed-tick accumulator.

## Project Structure

- `src/App.tsx` — top-level layout, header, release-history modal, and hidden admin speed panel
- `src/changelog.ts` — structured in-game release notes
- `src/components/Background.tsx` — animated starfield and atmosphere layers
- `src/components/FieldSvg.tsx` — battlefield SVG rendering
- `src/components/Sidebar.tsx` — economy, automation, and threat panels
- `src/components/HudPrimitives.tsx` — shared HUD widgets
- `src/components/ui/` — local card and progress primitives
- `src/hooks/useGameLoop.ts` — rAF-driven simulation loop
- `src/game/advanceGame.ts` — thin orchestrator over subsystem steps
- `src/game/subsystems/` — economy, spawns, movement, corruption, turrets, scouts, combat, mining, autobuy, projectiles, and events
- `src/game/balance.ts` — single source of truth for tuning constants
- `src/game/rng.ts` — deterministic Mulberry32 PRNG
- `src/game/targeting.ts` — shared targeting helpers
- `src/game/factories.ts` — initial state and entity construction
- `src/game/selectors.ts` — UI-facing derived state
- `src/game/__tests__/advanceGame.test.ts` — simulation invariants
- `.gitlab-ci.yml` — verify and container-build pipeline
- `docker/nginx.conf` — SPA serving config with security headers
- `Dockerfile` — multi-stage production image build

## Core Game Mechanics

### Economy

Resources: **Gold, Ore, Gems, Energy**. Gold funds upgrades. Derived economy includes prestige scaling, combat pressure penalties, corruption penalties, income rates, and colony health / threat / defense readouts.

### Workers

Kinds: `miner`, `runner`, `drone`. Workers pick targets autonomously, evade combat threats with sticky enter/exit behavior, recover when damaged, and reboot from home pads when destroyed.

### Enemies

Combat enemies (`mite`, `raider`, `wisp`) pursue workers, apply pressure, and are the only targets turrets will engage.

### Corrupters

Corrupters do not attack workers. They never target gold nodes, prefer ore/gems/energy, attach while corrupting, and reduce effective economic output.

### Turrets

Static base defense. One is live from the start, with more unlocked by upgrades. Turrets only target combat enemies.

### Scouts

Dedicated anti-corruption units. They prioritize live corrupters, then sweep high-corruption nodes, then patrol home. They are not mobile turrets. There are four physical scout units in state, with activation still gated by upgrade level.

### Mining And Harvesting

Workers mine assigned nodes, apply kind-specific harvesting behavior, and benefit from crits. Corrupted nodes yield less and respawn through the seeded RNG path when depleted.

### Autobuy And Prestige

Autobuy reacts to threat, corruption, and upgrade weighting. Prestige still auto-triggers when the colony is rich, stable, and clear enough to justify a reset.

### City / Home District

The home district skyline evolves as the colony grows. Its cadence and visual growth are tied to progression and upgrade investment rather than being purely decorative.

## Invariants

- `advanceGame()` remains the single orchestrator for the simulation tick.
- Step order inside `advanceGame()` is important; do not reshuffle casually.
- Presentation-only derivations belong in selectors, not simulation steps.
- All gameplay randomness should flow through the seeded `Rng`, not direct `Math.random()` calls.
- Worker evasion keeps the small enter radius, larger exit radius, multi-tick persistence, and vector-summed escape behavior.
- Corrupters never attack workers and never target gold nodes.
- Turrets never target corrupters.
- Scouts stay visually distinct from turrets and keep first crack at corruption cleanup.
- Wallpaper feel still beats perfect simulation purity.

## Current Operational Notes

- The header version badge opens the in-game release history.
- The hidden admin speed panel toggles after pressing `Space` five times while focus is on the page body.
- `package.json` version and `src/changelog.ts` should stay in sync whenever a release is being cut.

## Remaining Work

### High Priority

- Long-duration soak testing in a real browser session.
- Broaden the Vitest suite beyond invariants into more seeded subsystem edge cases.
- Verify Docker image serving and the GitLab registry flow end-to-end.

### Medium Priority

- Small dev overlay for tick counts, enemy counts, corruption state, and autobuy choice.
- Headless soak-test utility for large deterministic runs.
- Release workflow cleanup so package versioning and changelog maintenance are less manual.

### Nice To Have

- More enemy variants and scout behaviors.
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
7. `src/game/selectors.ts`
8. `src/components/FieldSvg.tsx`
9. `src/components/Sidebar.tsx`

Compare against `reference/idle_wallpaper_game.reference.jsx` when you need to recover the original intended behavior or feel.
