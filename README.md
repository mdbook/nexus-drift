# Nexus Drift

Nexus Drift is an autonomous sci-fi colony sim wallpaper built with React, TypeScript, and Vite. Workers mine on their own, raiders push the perimeter, turrets hold the line, and scout craft hunt corruption before it rots the economy.

**Current release:** `2.2.10` &nbsp;|&nbsp; **Stack:** React · TypeScript · Vite · Tailwind

![Nexus Drift — active field with perimeter defense and purge wing](public/og-image.png)

---

## Features

### Simulation & Economy
- Fully browser-run simulation with no network gameplay dependency
- Deterministic seeded RNG in the simulation layer for reproducible runs
- Each worker kind (miner / runner / drone) supports up to 3 simultaneous units — slots unlock at upgrade levels 3 and 6
- Flux and Cores feed multi-resource upgrades (Foundry, Data Archive, Sentinel Mechs)
- Seeded random events (12 event types) temporarily bend yields, speed, corruption pressure, and surprise spawns

### Combat & Enemies
- Mid-game enemy roster: rushers, brutes, sappers, blights, leeches, phantoms, and zappers
- Zappers are a late-game (tier 7+) ranged threat — holds at firing distance, fires slow energy bolts that disable a worker or turret for ~7 seconds
- Enemies apply soft repulsion when crowding the same target — they orbit at staggered angles rather than piling on top of each other
- Turrets fire homing missiles that travel visibly and steer toward their target; the Focused Beam upgrade (tier 4+) adds instant-hit fire for close-range targets
- 44 achievements across 4 rarity tiers (common / uncommon / rare / legendary) and 6 categories

### HUD & UI
- Glanceable upgrade rail and field stats strip — on mobile the rail stays in the field footer; on desktop it floats in the top-right chrome band so the footer can prioritize events and live field stats without shrinking the field
- Each active event drives a distinct ambient backdrop effect (meteor streaks, xeno spore fog, dust storm haze, solar flare pulses, and more) plus a tone-coded HUD chip; coarse-pointer desktop layouts such as iPadOS landscape fall back to a cheaper static variant so the visual identity stays intact without the Safari lag hit
- Activity log: up to 40 structured entries with per-category icons, relative-age timestamps, and a filter tab bar
- Entities fade in and out instead of popping: nodes, enemies, and agents all animate on spawn and death

### Controls & Persistence
- Speed presets: `1x`, `2x`, `4x` public; hidden admin speed panel behind `Space` × 5
- Long runs autosave every 30 seconds, restore on reload, and pause cleanly while the tab is hidden
- Save files carry a schema version for explicit forward-compatible migration
- In-game release history: click the version badge next to `Autonomous Colony Sim`
- GitLab source link sits in the top project chrome beside the version badge

### Layout
- Responsive: two-column desktop layout activates at 1024px (`lg`), so 11-inch iPads in landscape get the full side-by-side view
- Desktop iPad layouts keep the field footer as an overlay for performance, but the field now reserves an inset above it so the bottom HUD stays readable without covering the home district
- On coarse-pointer `lg` desktops, the heaviest ambient background / event animation paths and SVG text blur are intentionally reduced so scrolling stays smooth on iPadOS Safari without flattening the overall look
- On `lg` two-column screens, the upgrade rail is absolutely overlaid in the top-right chrome band above the resource bar instead of taking up vertical layout space

---

## Development

```bash
npm ci
npm run dev
```

```bash
npm run typecheck   # type checking
npm test            # unit tests (24 tests in src/game/__tests__/)
npm run lint
npm run build
npm run preview
npm run format:check
```

---

## Architecture

| Path | Role |
|------|------|
| `src/App.tsx` | Top-level shell: save bootstrap, speed presets, achievement UI, admin panel, event test triggers, release-history modal |
| `src/changelog.ts` | In-game release notes sourced from repo milestones |
| `index.html` | App metadata, favicon links, Open Graph / Twitter embed tags |
| `src/hooks/useLowFxMode.ts` | Detects coarse-pointer desktop layouts (notably iPadOS landscape) so presentation layers can use cheaper FX variants without touching sim logic |
| `src/hooks/useGameLoop.ts` | `requestAnimationFrame` loop, pause-on-hidden, autosave cadence, live field snapshots, throttled UI snapshot |
| `src/game/advanceGame.ts` | Thin orchestrator that runs the simulation step order |
| `src/game/achievements.ts` | Achievement definitions and unlock helper |
| `src/game/persistence.ts` | localStorage save/load bootstrap and migration entry point |
| `src/game/balance.ts` | Central tuning constants |
| `src/game/events/eventDefs.ts` | Seeded mechanical event definitions and activation helpers |
| `src/game/rng.ts` | Seeded Mulberry32 PRNG used by all simulation paths |
| `src/game/targeting.ts` | Shared targeting helpers |
| `src/game/subsystems/` | Focused simulation modules: economy, spawns, movement, combat, scouts, sentinels, turrets, corruption, mining, autobuy, projectiles, events |
| `src/components/FieldSvg.tsx` | Battlefield SVG rendering; static district geometry memoized by seed/turret layout, with the expensive label blur disabled in low-FX mode |
| `src/components/EventBackdrop.tsx` | Full-screen ambient effect layer keyed off active event ids (purely presentational, respects `prefers-reduced-motion` and coarse-pointer low-FX mode) |
| `src/components/EventChip.tsx` | Active-event HUD chip with hover/focus tooltip |
| `src/components/UpgradeIndicatorRail.tsx` | Horizontal rail of upgrade dots — glow on level, pulse when affordable, tooltip on hover/focus |
| `src/components/FieldStatsStrip.tsx` | Compact pill row of live field stats with tone colours and detail tooltips |
| `src/components/ActivityLog.tsx` | Structured log panel with category icons, relative timestamps, and filter tabs |
| `src/components/AchievementsModal.tsx` | Achievements modal with category tabs, rarity colouring, hidden masking, and progress bar |
| `src/components/Sidebar.tsx` | Economy, automation, and threat panels |
| `src/components/Background.tsx` | Animated starfield and atmosphere layers; swaps to a static cheaper variant on coarse-pointer desktop layouts |
| `src/components/HudPrimitives.tsx` | Shared HUD widgets (StatusBadge, ResourcePill, StatTile, UpgradeTile) |
| `src/components/Tooltip.tsx` | Shared `TooltipPanel` primitive; `useTooltip` hook in `src/hooks/useTooltip.ts` |
| `src/components/ui/` | Local card and progress bar primitives |
| `reference/` | Preserved single-file reference artifact |

---

## Build & Delivery

```bash
# Production build
npm run build

# Docker
docker build -t nexus-drift .
docker run --rm -p 8080:80 nexus-drift

# Compose
docker compose up --build
```

The production image serves the static Vite build with Nginx on port `80`.

---

## CI

GitLab CI runs:

- **verify** — `npm ci`, `npm run typecheck`, `npm test`
- **image build** — Kaniko-based build that publishes the container image
- **notifications** — success and failure alerts after the pipeline completes

---

## Notes For Contributors

- Keep `package.json` version and `src/changelog.ts` aligned when doing release work.
- If architecture, commands, or player-facing behavior changes, update `README.md` and `handoff.md` in the same pass.
- Follow-up UI/docs tweaks belong to the current in-flight release unless the user says otherwise.
- Local `.claude/worktrees/` copies are tooling noise; repo docs, git status summaries, and linting should treat them as ignored.
- Compare against `reference/idle_wallpaper_game.reference.jsx` when you need the original intended feel.
- Performance rule of thumb: keep the field live, but prefer throttled or memoized snapshots for non-field chrome (resource bars, sector card, sidebar, logs) so scrolling and hover do not compete with the 30 Hz simulation loop. On coarse-pointer desktop layouts, preserve the visual direction but route expensive ambient motion and SVG filters through `useLowFxMode`.
