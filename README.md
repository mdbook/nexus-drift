# Nexus Drift

Nexus Drift is an autonomous sci-fi colony sim wallpaper built with React, TypeScript, and Vite. Workers mine on their own, raiders push the perimeter, turrets hold the line, and scout craft hunt corruption before it rots the economy.

## Highlights

- Fully browser-run simulation with no network gameplay dependency.
- Deterministic seeded RNG in the simulation layer for reproducible runs.
- In-game release history: click the version badge next to `Autonomous Colony Sim`.
- Public speed presets for `1x`, `2x`, and `4x`, plus a hidden admin speed panel for deeper tuning: press `Space` five times.
- Mid-game enemy roster now includes rushers, brutes, sappers, blights, leeches, phantoms, and zappers. Zappers are a late-game (tier 7+) ranged threat that holds at firing distance and fires slow energy bolts — a hit disables a worker or turret for ~7 seconds.
- Seeded random events can temporarily bend yields, speed, corruption pressure, and surprise spawns. Each active event now drives a distinct ambient backdrop effect (meteor streaks, xeno spore fog, dust storm haze, solar flare pulses, and more) and surfaces a tone-coded HUD chip with a hover/focus tooltip listing flavor text and every buff and debuff.
- Flux and Cores now feed multi-resource upgrades, including Foundry, Data Archive, and Sentinel Mechs.
- Long runs now autosave every 30 seconds, restore on reload, and pause cleanly while the tab is hidden. Save files carry a schema version so future migrations are explicit.
- 44 achievements across 4 rarity tiers (common / uncommon / rare / legendary) and 6 categories (combat, corruption, mining, progression, survival, secret). The achievement modal groups by category, colour-codes by rarity, masks hidden achievements as "???" until unlocked, and shows a completion progress bar. Corruption purge milestones now track actual node cleanses, sentinel kill credit only lands on lethal sentinel hits, and the synthwave Konami easter egg unlocks its own hidden badge.
- Glanceable upgrade rail and field stats strip live inside the field card — colour-coded upgrade dots (yield / defense / support / elite) and compact stat pills each expose hover/focus tooltips with full detail. Designed mobile-first so the sidebar no longer needs to be open to monitor the colony.
- Activity log shows up to 40 structured entries with per-category icons (combat, corruption, mining, upgrade, event, system, achievement, ambient), relative-age timestamps, and a filter tab bar so you can focus on the stream that matters.
- Responsive layout activates the two-column desktop view at 1024px (lg) instead of 1280px, so 11-inch iPads in landscape get the full side-by-side field and sidebar without scrolling.
- Entities fade in and out instead of popping: nodes fade in on spawn and respawn, temporary nodes fade out as they near their despawn deadline, enemies fade in on entry and play a short death fade-out before removal, and agents fade in on reboot.

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

- `src/App.tsx`: top-level shell, save bootstrap, speed presets, achievement UI, admin panel, event test triggers, and release-history modal
- `src/changelog.ts`: in-game release notes sourced from repo milestones
- `src/hooks/useGameLoop.ts`: `requestAnimationFrame` loop, pause-on-hidden handling, autosave cadence, and derived-state snapshots
- `src/game/advanceGame.ts`: thin orchestrator that runs the simulation step order
- `src/game/achievements.ts`: achievement definitions and unlock helper
- `src/game/persistence.ts`: localStorage save/load bootstrap and migration entry point; saves carry a `schemaVersion` field for forward-compatible migration
- `src/game/subsystems/`: focused simulation modules for economy, spawns, movement, combat, scouts, sentinels, turrets, corruption, mining, autobuy, projectiles, and events
- `src/game/balance.ts`: central tuning constants
- `src/game/events/eventDefs.ts`: seeded mechanical event definitions and event activation helpers
- `src/game/rng.ts`: seeded Mulberry32 PRNG used by simulation paths
- `src/game/targeting.ts`: shared targeting helpers
- `src/components/ActivityLog.tsx`: structured log panel with category icons, relative timestamps, and filter tabs (including Awards)
- `src/components/AchievementsModal.tsx`: achievements modal with category tabs, rarity colouring, hidden masking, and progress bar
- `src/components/`: battlefield rendering, HUD widgets, sidebar panels, and presentational overlays
- `src/components/EventBackdrop.tsx`: full-screen ambient effect layer keyed off active events (purely presentational, respects `prefers-reduced-motion`)
- `src/components/EventChip.tsx`: active-event HUD chip with hover/focus tooltip showing flavor and per-effect tone breakdown
- `src/components/UpgradeIndicatorRail.tsx`: horizontal rail of one dot per visible upgrade. Dots glow harder with level, pulse when the next level is affordable, and open a tooltip (name, level, effect, cost) on hover/focus. Hidden upgrades match the sidebar's visibility rules.
- `src/components/FieldStatsStrip.tsx`: compact pill row of live field stats (crews, integrity, turrets, scouts, sentinels, combat, corruption, threat tier, combo) with tone colours and detail tooltips. Replaces the old verbose crew/task text footer.
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
