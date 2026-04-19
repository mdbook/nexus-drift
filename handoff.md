# Nexus Drift Handoff

## Overview

Nexus Drift is a React + TypeScript + Vite app that runs a sci-fi "ambient autonomous RTS wallpaper" entirely in the browser. The original single-file artifact is preserved at `reference/idle_wallpaper_game.reference.jsx` for regression comparison; the working app lives under `src/`.

Core architecture:

- one centralized `advanceGame(prev)` step
- immutable-ish state cloning at the top of each tick
- helper step functions for each simulation subsystem
- React rendering layered on top of the simulation state

## Project Structure

- `src/App.tsx` — top-level layout and composition
- `src/components/Background.tsx` — animated starfield / atmospheric background
- `src/components/FieldSvg.tsx` — main battlefield SVG rendering
- `src/components/Sidebar.tsx` — economy / automation / threat panels
- `src/components/HudPrimitives.tsx` — shared HUD widgets
- `src/components/ui/` — minimal local card/progress primitives
- `src/hooks/useGameLoop.ts` — rAF-driven simulation loop
- `src/game/constants.ts` — tick/world/system constants
- `src/game/types.ts` — core entity/state types
- `src/game/data.ts` — visual defs + upgrade/resource data
- `src/game/utils.ts` — shared math/formatting helpers
- `src/game/factories.ts` — initial state + entity factories
- `src/game/selectors.ts` — derived economy and UI-facing computed state
- `src/game/advanceGame.ts` — main simulation step and subsystem helpers
- `src/game/__tests__/advanceGame.test.ts` — simulation invariant tests (Vitest)
- `docker/nginx.conf` — SPA fallback HTTP serving config
- `Dockerfile` — multi-stage build for static hosting

## Core Game Mechanics

### Economy

Resources: **Gold, Ore, Gems, Energy**. Gold is the upgrade currency. Derived economy lives in `computeDerived()` and includes prestige scaling, combat pressure penalty, corruption penalties for ore/gems/energy, and colony health / threat / defense readouts.

### Workers

Kinds: `miner`, `runner`, `drone`. Workers pick target nodes, move smoothly, enter sticky evade mode around combat enemies, recover when damaged, reboot from home positions if destroyed, and mark corrupted nodes as "purging residue" while working.

### Enemies

Combat enemies (`mite`, `raider`, `wisp`) chase workers, create pressure, damage them in melee, and are targeted by turrets.

### Corrupters

Corrupters do **not** attack workers, **never** target gold nodes, prefer lower-corruption ore/gems/energy nodes, stay attached while corrupting, and reduce economic performance.

### Turrets

Static base defense. Activate by upgrade count (one is always live as starter defense). Only target combat enemies — **never** corrupters.

### Scouts

Activate through the `scout` upgrade. Prioritize live corrupters, otherwise sweep high-corruption nodes, otherwise patrol home pads. Dedicated anti-corrupter layer — **not** mobile turrets.

### Mining / Harvesting

Workers near their assigned node mine it down. On break: resources granted by kind, crits possible, corrupted nodes yield less, node respawns as a new random node.

### Autobuy / Prestige

Autobuy uses threat- and corruption-sensitive weights with soft gating between upgrade tiers. Prestige auto-triggers when the colony is rich, low-threat, and clear of active corruption.

## Invariants (do not accidentally break)

- `advanceGame()` remains the single orchestrator.
- Presentation-only derivations belong in selectors, not simulation steps.
- Worker evasion uses small enter radius, larger exit radius, multi-tick persistence, and vector-sums from multiple threats.
- Corrupters never attack workers; corrupters never target gold nodes.
- Turrets never target corrupters; scouts always get first crack at them.
- Scouts stay visually distinct from turrets.
- Wallpaper feel beats simulation purity — readable > perfect.

## Remaining Work

### High priority

- Long-duration soak testing in a real browser.
- Verify Docker image build and container serving end-to-end.
- Extend the Vitest suite (seeded RNG + more subsystems).

### Medium priority

- Add deterministic seeded RNG for reproducible runs.
- Small dev overlay: tick count, enemy counts, corrupted node counts, autobuy choice.
- Soak-test utility to simulate many ticks headlessly.

### Nice-to-have

- More enemy variants, scout formations, weather/day-night layers, better log categories, sound hooks, replay/snapshot export, theme variants.

## Local Commands

- `npm ci`
- `npm run dev`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run preview`

## Docker

Production model: Vite build → Nginx serves `dist/` over HTTP → reverse proxy adds TLS.

Local verification:

1. `npm ci`
2. `npm run build`
3. `docker build -t nexus-drift .`
4. `docker run --rm -p 8080:80 nexus-drift`
5. open `http://localhost:8080`

## Known Gaps / Risks

- No deterministic RNG yet.
- No save/load system.
- No explicit performance instrumentation.
- Test suite covers invariants but not visual balance.

## Reading Order For New Contributors

1. `src/App.tsx`
2. `src/hooks/useGameLoop.ts`
3. `src/game/advanceGame.ts`
4. `src/game/selectors.ts`
5. `src/components/FieldSvg.tsx`
6. `src/components/Sidebar.tsx`

Compare against `reference/idle_wallpaper_game.reference.jsx` when in doubt about intended behavior.
