# Nexus Drift

Nexus Drift is an autonomous sci-fi colony sim wallpaper built with React, TypeScript, and Vite. Workers mine on their own, raiders push the perimeter, turrets hold the line, and scout craft hunt corruption before it rots the economy.

## Highlights

- Fully browser-run simulation with no network gameplay dependency.
- Deterministic seeded RNG in the simulation layer for reproducible runs.
- In-game release history: click the version badge next to `Autonomous Colony Sim`.
- Hidden admin speed panel for tuning and quick checks: press `Space` five times.
- Mid-game enemy roster now includes rushers, brutes, sappers, blights, leeches, and phantoms.
- Seeded random events can temporarily bend yields, speed, corruption pressure, and surprise spawns.

## Development

Install dependencies and start the dev server:

```bash
npm ci
npm run dev
```

Useful commands:

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run preview
npm run format:check
```

## Architecture

- `src/App.tsx`: top-level shell, HUD framing, admin panel, event test triggers, and release-history modal
- `src/changelog.ts`: in-game release notes sourced from repo milestones
- `src/hooks/useGameLoop.ts`: `requestAnimationFrame` loop and derived-state snapshots
- `src/game/advanceGame.ts`: thin orchestrator that runs the simulation step order
- `src/game/subsystems/`: focused simulation modules for economy, spawns, movement, combat, scouts, turrets, corruption, mining, autobuy, projectiles, and events
- `src/game/balance.ts`: central tuning constants
- `src/game/events/eventDefs.ts`: seeded mechanical event definitions and event activation helpers
- `src/game/rng.ts`: seeded Mulberry32 PRNG used by simulation paths
- `src/game/targeting.ts`: shared targeting helpers
- `src/components/`: battlefield rendering, HUD widgets, and sidebar panels
- `reference/`: preserved single-file reference artifact

## Build And Delivery

Production build:

```bash
npm run build
```

Docker:

```bash
docker build -t nexus-drift .
docker run --rm -p 8080:80 nexus-drift
```

Or with compose:

```bash
docker compose up --build
```

The production image serves the static Vite build with Nginx on port `80`.

## CI

GitLab CI currently runs:

- a `verify` stage with `npm ci`, `npm run typecheck`, and `npm test`
- a Kaniko-based image build stage that publishes the container image
- success and failure notifications after the pipeline completes

## Notes For Contributors

- Keep `package.json` version and `src/changelog.ts` aligned when doing release work.
- If architecture, commands, or player-facing behavior changes, update `README.md` and `handoff.md` in the same pass.
- Compare against `reference/idle_wallpaper_game.reference.jsx` when you need the original intended feel.
