# Nexus Drift Handoff

## Overview

Nexus Drift is now a modular React + TypeScript + Vite app that preserves the original "ambient autonomous RTS wallpaper" concept from the single-file artifact.

The original monolith has been preserved as a reference snapshot at:

- `reference/idle_wallpaper_game.reference.jsx`

The working app now lives under:

- `src/`

The simulation still uses the same core architecture:

- a single centralized `advanceGame(prev)` step
- immutable-ish state cloning at the top of the tick
- helper step functions for each simulation subsystem
- React rendering layered on top of the simulation state

## Current Status

### What is done

- The single-file artifact was preserved for reference.
- A Vite + React + TypeScript project structure was created.
- The game loop was migrated into typed game-engine modules.
- The main wallpaper UI was split into reusable components.
- The app successfully builds for production with `npm run build`.
- Docker and Nginx configuration were added for static HTTP serving.

### What is believed working

- Autonomous worker mining behavior
- Sticky worker evasion behavior
- Combat enemy harassment
- Turret-only targeting of combat enemies
- Corrupter-only targeting of non-gold nodes
- Scout-only mobile anti-corrupter response layer
- Corruption affecting global economy
- Autobuy and prestige behavior
- Activity log and HUD panels
- Production build output via Vite

### What was not fully verified in this environment

- `docker build` / `docker compose up`
- Long-duration soak testing in a real browser over hours
- Visual balance tuning beyond current functional behavior
- Formal automated tests

## Project Structure

- `src/App.tsx`
  - Top-level layout and composition
- `src/components/Background.tsx`
  - Animated starfield / atmospheric background
- `src/components/FieldSvg.tsx`
  - Main battlefield SVG rendering
- `src/components/Sidebar.tsx`
  - Economy / automation / threat panels
- `src/components/HudPrimitives.tsx`
  - Shared HUD widgets
- `src/components/ui/`
  - Minimal local card/progress primitives
- `src/hooks/useGameLoop.ts`
  - Interval-driven simulation loop
- `src/game/constants.ts`
  - Tick/world/system constants
- `src/game/types.ts`
  - Core TypeScript entity/state types
- `src/game/data.ts`
  - Visual defs + upgrade/resource data
- `src/game/utils.ts`
  - Shared math/formatting helpers
- `src/game/factories.ts`
  - Initial state + entity factories
- `src/game/selectors.ts`
  - Derived economy and UI-facing computed state
- `src/game/advanceGame.ts`
  - Main simulation step and subsystem helpers
- `docker/nginx.conf`
  - SPA fallback HTTP serving config
- `Dockerfile`
  - Multi-stage build for static hosting

## Core Game Mechanics

### Economy

Resources:

- Gold
- Ore
- Gems
- Energy

Gold is the main upgrade currency.

Derived economy is computed in `computeDerived()` and includes:

- prestige scaling
- combat pressure penalty
- corruption penalties for ore/gems/energy
- aggregate colony health / threat / defense readouts

### Workers

Worker kinds:

- miner
- runner
- drone

Workers:

- pick target nodes
- move with smoother, less jittery motion
- enter sticky evade mode around combat enemies
- recover when damaged
- reboot from home positions if destroyed
- work corrupted nodes with a "purging residue" flavor state

### Enemies

Combat enemies:

- mite
- raider
- wisp

Combat enemies:

- chase workers
- create economic pressure
- damage workers in melee range
- are targeted by turrets
- trigger worker evasion

### Corrupters

Corrupters:

- do not attack workers
- ignore gold nodes
- prefer ore/gems/energy nodes
- prefer lower-corruption targets first
- remain attached to a node while corrupting it
- visually rot nodes and reduce economic performance

### Turrets

Turrets:

- are static base defense
- activate by upgrade count
- only target combat enemies
- never target corrupters
- fire white projectile beams

### Scouts

Scouts:

- activate through the `scout` upgrade
- prioritize live corrupters
- otherwise sweep high-corruption nodes
- otherwise patrol around home pads
- fire purple projectiles
- are the dedicated anti-corrupter response layer

### Mining / Harvesting

Workers near their assigned node mine it down.

When a node breaks:

- it grants resources based on type
- crits can occur
- corrupted nodes yield less
- the node respawns as a new random node

### Autobuy / Prestige

The colony auto-buys upgrades using:

- threat-sensitive weighting
- corruption-sensitive weighting
- soft gating between upgrade tiers

Prestige can trigger automatically when the colony is:

- rich enough
- under low threat
- clear of active corruption

## Important Architectural Decisions

### Good decisions already in place

- The simulation is centralized instead of spread across multiple React effects.
- Derived state is kept in `computeDerived()` rather than duplicated in render code.
- Rendering is separated from game engine logic.
- The old artifact is preserved, which makes regression comparison possible.

### Constraints to preserve

- Keep `advanceGame()` as the orchestrator.
- Keep render-only derivations out of the simulation steps.
- Preserve the wallpaper feel over strict balance purity.
- Preserve scouts as a distinct corruption-response layer, not "mobile turrets".

## Remaining Work

### High priority

- Run a manual browser pass and tune any visual regressions.
- Verify `npm run dev` and HMR in a normal local shell.
- Verify Docker image build and container serving path.
- Add basic automated regression tests around the simulation engine.

### Medium priority

- Add deterministic seeded RNG support for reproducible simulation runs.
- Add a small debug panel or dev overlay for:
  - tick count
  - live enemy counts
  - corrupted node counts
  - current upgrade weights / autobuy choice
- Add soak-test utilities to simulate large numbers of ticks without rendering.

### Nice-to-have expansions

- More enemy variants
- More scout behaviors / formations
- Weather / day-night / biome atmosphere layers
- Better event log categories
- Sound hooks
- Replay or snapshot export
- Theme variants / alternative colonies

## Recommended Next Steps

1. Run the app locally in a normal terminal and manually inspect behavior for 10-20 minutes.
2. Build the Docker image and confirm it serves correctly behind a reverse proxy.
3. Add simulation-focused tests for the highest-risk behaviors:
   - turrets never hit corrupters
   - scouts prioritize corrupters
   - corruption only affects non-gold nodes
   - resources never become `NaN`
   - long-run tick stepping remains stable
4. Add seeded RNG so hard-to-reproduce bugs become debuggable.
5. Consider adding a compact debug HUD behind a flag.

## Quick Start For The Next Developer

If you are newly picking this project up, the fastest useful reading order is:

1. `src/App.tsx`
2. `src/hooks/useGameLoop.ts`
3. `src/game/advanceGame.ts`
4. `src/game/selectors.ts`
5. `src/components/FieldSvg.tsx`
6. `src/components/Sidebar.tsx`

This gives you:

- the page layout
- the React-to-simulation bridge
- the full simulation flow
- the derived economy logic
- the battlefield rendering
- the HUD / side panel rendering

If behavior feels wrong after future edits, compare against:

- `reference/idle_wallpaper_game.reference.jsx`

That preserved monolith is the best regression reference.

## Mechanics That Should Not Be Accidentally Changed

### Simulation structure

- Keep one top-level `advanceGame()` orchestration flow.
- Do not spread simulation mutations across multiple React effects.
- Keep presentation-only derivations in selectors instead of mutating state for UI convenience.

### Worker behavior

- Workers should feel smooth and purposeful, not jittery.
- Sticky evasion is intentional and should remain.
- Evasion should continue to use:
  - smaller enter radius
  - larger exit radius
  - persistence across multiple ticks
  - flee vectors from multiple threats, not just the nearest
- Automatic rebooting is part of the wallpaper loop and should remain hands-off.

### Corrupter and scout behavior

- Corrupters should not directly attack workers.
- Corrupters should never target gold nodes.
- Turrets should never target corrupters.
- Scouts should remain the main anti-corrupter response layer.
- Scouts should stay visually distinct from turrets.

### Wallpaper feel

- Readability matters more than perfect simulation purity.
- The wallpaper should feel active but not stressful.
- Causality should remain obvious:
  - combat creates defensive response
  - corruption creates scout response
  - corruption visibly hurts economy

## Good Places To Expand

### Simulation

- Seeded RNG and replayable simulation seeds
- Soak-test runner for large tick counts
- More combat enemy archetypes
- Additional corrupter behaviors
- Scout wing coordination or formations

### Visuals

- More terrain layers and subtle parallax
- Stronger corruption spread visuals
- Better impact flashes / projectile trails
- More distinct worker silhouettes
- Additional ambient atmosphere effects

### UX and observability

- Optional debug overlay
- More structured activity log categories
- Dev toggles for spawn/corruption testing
- Lightweight perf counters or timing overlays

### Deployment

- Verify Docker end to end locally
- Add CI for `npm run build`
- Add release workflow if this becomes regularly deployed
- Add optional health-check routing through Nginx if useful

## Common Editing Guidance

### When changing behavior

- Prefer editing engine code under `src/game/`.
- Keep tuning values centralized when possible.
- Compare against the reference artifact before rewriting systems from scratch.

### When changing visuals

- Use `FieldSvg.tsx` for field rendering.
- Use `Sidebar.tsx` and `HudPrimitives.tsx` for HUD/panel work.
- Avoid adding noise that hurts distance readability.

### When debugging

- First determine whether the issue is simulation state or rendering.
- Check `computeDerived()` before duplicating economy logic in the UI.
- For pathing, combat, or strange interactions, start with `advanceGame.ts`.

## Suggested Test Plan

Manual checks after meaningful changes:

1. Let the sim run for several minutes and confirm it stays active.
2. Confirm workers are not jittering while evading.
3. Confirm turrets only fire on combat enemies.
4. Confirm scouts visibly chase corrupters.
5. Confirm corrupted ore/gem/energy nodes reduce economic output.
6. Confirm autobuy shifts toward turrets/shields during combat stress.
7. Confirm autobuy shifts toward scouts/arsenal during corruption stress.
8. Confirm prestige only occurs when the colony is relatively safe.

Suggested automated tests later:

- `advanceGame()` does not produce `NaN` resources over long runs
- corrupted nodes are never gold
- turret targeting excludes `role === "corruptor"`
- scout targeting prefers corrupters over sweep nodes
- worker evade state persists beyond a single tick
- node corruption clamps to `0..100`

## Local Commands

Use a shell that sees Node on PATH.

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

If PowerShell does not yet see `npm`, either reopen the shell or run:

- `$env:Path = "C:\Program Files\nodejs;" + $env:Path`

## Docker Notes

Current intended deployment model:

- build static assets with Vite
- serve `dist/` with Nginx over HTTP
- place reverse proxy / TLS in front externally

Expected local verification flow:

1. `npm install`
2. `npm run build`
3. `docker build -t nexus-drift .`
4. `docker run --rm -p 8080:80 nexus-drift`
5. open `http://localhost:8080`

Files:

- `Dockerfile`
- `docker/nginx.conf`
- `docker-compose.yml`

## Known Gaps / Risks

- No automated tests yet
- No deterministic RNG yet
- No save/load system
- No explicit performance instrumentation yet
- No verified Docker run in this environment
- `npm` availability may require reopening shell after Node installation on Windows

## Summary

The project is in a good "real app, ready for iteration" state now.

It is no longer a fragile single-file artifact, but it still preserves the same simulation feel and system design. The next phase should focus on verification, small balancing passes, and developer-quality improvements like tests, seeded simulation, and debug tooling.
