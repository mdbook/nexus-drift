# Nexus Drift

Nexus Drift is a sci-fi colony sim built with React, TypeScript, and Vite. Workers mine on their own, missile silos open every engagement at long range, turrets backfill the perimeter once the heavies arrive, and scout craft hunt corruption before it rots the economy. **As of 4.0 you are the colony's operator** — buy upgrades yourself, nudge workers by clicking nodes, flag threats by clicking enemies, and inspect any unit — or flip Idle Mode on and let it run itself, exactly as it always has.

**Current release:** `4.1.0` &nbsp;|&nbsp; **Stack:** React · TypeScript · Vite · Tailwind

### [▶ Play Now](https://mdbook.github.io/nexus-drift/)

No install — runs in your browser.

![Nexus Drift — active field with perimeter defense and purge wing](public/og-image.png)

---

## Features

### Operator Model (4.0)

- **You run the colony.** Upgrade tiles are click-to-buy when affordable, with a tone-coded tooltip explaining any gate or shortfall; autobuy stays as an opt-in fallback with a per-tile Auto chip and a master **All / None / Custom** switch. Fresh 4.0 runs start in manual mode; loaded 3.x saves come up on autobuy-everything, unchanged.
- **Soft field guidance.** Click a resource node to nudge the nearest idle worker toward it; click an enemy to inspect it and mark it a defense priority. Both are soft — the AI stays authoritative under threat and every safety/flee rule still wins.
- **Inspect popovers.** Click a worker, enemy, or the city core for a fixed-position popover (task / HP / modifiers, or hp / regen / energy factor); the worker popover can Send-home and the enemy popover can Mark-priority.
- **One-tap Idle Mode** returns the classic hands-off sim, and a first-run overlay explains the model once (skipped for returning saves).

### Simulation & Economy

- Fully browser-run simulation with no network gameplay dependency
- Deterministic seeded RNG in the simulation layer for reproducible runs
- **3.0.0**: Economy stretched 5–8× for multi-session play — the second turret is a 25-35 min milestone, the third worker of any kind takes hours, and overnight runs are now first-class
- Each worker kind (miner / runner / drone) supports up to 3 simultaneous units, dual-gated by upgrade level and sector level (level 10 / 22), with Gold+Ore slot-unlock surcharges
- **3.0.0**: Workers now have per-individual variance (speed ±12%, fear ±20%, harvest bias ±15%) plus class abilities: miner overclock, runner sprint burst, drone corruption scan
- Workers commit hard to partially mined resources; one or two nearby enemies no longer dislodge an undamaged harvesting worker; live enemy bodies slow movement; fleeing workers can retarget ahead
- Flux and Cores feed multi-resource upgrades (Foundry, Data Archive, Sentinel Mechs)
- Seeded random events (12 event types) temporarily bend yields, speed, corruption pressure, and surprise spawns

### Combat & Enemies

- Mid-game enemy roster: rushers, brutes, sappers, blights, leeches, phantoms, zappers — each kind maps to an AI archetype (direct line, flanker, ambusher, ghost, skirmisher) with emergent squad-level flanking
- **3.0.0**: Enemies now target deployed turrets, scouts, sentinels, and the city — brutes siege structures, sappers aim for turrets, phantoms assassinate sentinels. Per-class armor values tune contact damage separately from enemy stats
- **3.0.1**: Enemy target selection now excludes undeployed slots, corrupted/rebooting workers, and stale rebooted structure targets; void warden cooldown and kill-credit blockers are fixed
- Zappers hold at firing distance and fire bolts that disable workers, turrets, scouts, or sentinels for ~7 seconds; late-game Void Wardens stalk isolated workers and, once within range, latch on as parasites — pinning to the host, uncloaking for the 3.5-second corruption window, and giving defenses a real shot to burn them off before the worker converts
- **3.0.0**: Turrets, scouts, sentinels, and the home district all have structural HP and can be broken, retreated, or destroyed. Turrets break for ~80 s; scouts reboot for ~20 s; sentinels reboot for ~40 s
- **3.1.5 defense flip**: Missile Silos are now the colony's first defense — one silo is armed from the very start, available on a gold-only `missileLauncher` track from Tier 0. Defense Turrets gate to Tier 3 "Raid" so the close-range perimeter line shows up alongside the brute (the first enemy that genuinely targets turrets) and the sapper. Long-range silo + short-range turret remain a deliberate split: turret range is hard-clamped to 270 px and silo range scales with the upgrade (400 px + 6 px per level), so silos always out-reach turrets
- Shielded enemies show a cyan shield layer; shield damage is consumed before HP without overflow in the same hit
- 74 achievements across 4 rarity tiers (common / uncommon / rare / legendary) and 6 categories, including the 4.0 operator-model set (first manual purchase, autobuy-off milestone, full manual run)

### HUD & UI

- Glanceable upgrade rail and field stats strip — on mobile the rail stays in the field footer; on desktop it floats in the top-right chrome band so the footer can prioritize events and live field stats without shrinking the field
- The desktop top-right upgrade rail now sits a touch closer to the sector card and uses a thinner horizontal scrollbar so it doesn't crowd the resource pills beneath it
- Active events live in a persistent footer strip that's always visible — timed events render as inspectable pills with countdowns, one-shot events now use the same compact chip size but fade away without counters, crowded rows stay a single horizontal scroller instead of wrapping labels into stacked chips, inspected cards simply dim their existing marker dot, and the canvas size never jumps as events come and go
- Each active event drives a distinct ambient backdrop effect (meteor streaks, xeno spore fog, dust storm haze, solar flare pulses, and more) plus a tone-coded HUD chip; coarse-pointer desktop layouts such as iPadOS landscape fall back to a cheaper static variant so the visual identity stays intact without the Safari lag hit
- Activity log: up to 40 structured entries with per-category icons, relative-age timestamps, and a filter tab bar
- Entities fade in and out instead of popping: nodes, enemies, and agents all animate on spawn and death
- Mature colonies can attract a tiny tourist drone; repeated clicks now just squish it, count per pass, and feed multiple hidden achievements without flashing an oversized white click outline
- Late-game interaction props live directly in the field: a broken recoverable lost drone, a 3-event anomaly artifact, clickable zapper bolts, in-flight missiles, and corpse clicks during enemy death-fade windows
- The in-field achievement ribbon now shows newly unlocked badges first on the left, pushing older ones rightward so fresh unlocks are immediately visible, and clicking a badge jumps the archive modal straight to that achievement with a scroll/focus pulse that fades out cleanly

### Controls & Persistence

- Speed presets: `1x`, `2x`, `4x` stay in the top chrome on every breakpoint; hidden admin mode behind `Space` × 5 extends that same selector with `10x`, `20x`, and `100x`
- The hidden admin console now includes live diagnostics, scenario/preset buttons, shell toggles, a dedicated event-trigger section, and a command terminal (`status`, `grant`, `upgrade`, `spawn`, `event`, `heal`, `clear`, `preset`, and more) for QA and balance setup; it can collapse into a tiny quick-send command panel when you need the field visible
- The shell now polls `/version` roughly every 5 minutes (and when the tab regains focus), extracts a flat semver from the response, and shows a live-update banner with `Refresh`, `Close`, and session-only `Don't Show Again` actions when a newer build is live; the admin console can also force that banner open for testing
- Long runs autosave every 30 seconds, restore on reload, and pause cleanly while the tab is hidden
- Save files carry a schema version for explicit forward-compatible migration
- In-game release history: click the version badge next to `Autonomous Colony Sim`; the version badge itself now also participates in a hidden secret achievement
- GitLab source link sits in the top project chrome beside the version badge
- Favicon stack now includes SVG, PNG, ICO, Apple touch icon, and web manifest fallbacks for broader browser coverage

### Layout

- Responsive: two-column desktop layout activates at 1024px (`lg`), so 11-inch iPads in landscape get the full side-by-side view
- Desktop iPad layouts use dynamic viewport sizing (`100dvh`) plus safe-area bottom padding so the field card and its overlay footer stay inside the visible viewport when Safari's URL bar is present, and the field reserves an inset above the overlay footer on every breakpoint so the bottom HUD stays readable without covering the home district
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
npm test            # unit tests (285 tests across src/game/__tests__/, src/sim/, and src/lib/)
npm run lint
npm run build
npm run preview
npm run format:check
```

Beta builds — `npm run dev` locally or any deploy at `nexus-drift-beta.mdbook.me` / `nexus-drift-beta.*.mdbook.one` — show an amber `BETA` pill next to the version button, a tinted favicon, and a `[BETA]` document-title prefix. Detection lives in `src/lib/isBetaBuild.ts`. Production hosts (`nexus-drift.mdbook.me` / `nexus-drift.*.mdbook.one`) are unaffected.

---

## Simulation Harness

A read-only, headless runner for the sim core, so the game can be run off-screen and its state/telemetry exported deterministically for balance analysis — no browser, no changes to gameplay logic. Lives in `src/sim/` and reuses the existing pure core (`createInitialGameState` + `advanceGame` + `computeDerived`).

```bash
# Snapshot the derived metrics at specific ticks (deterministic for a given seed)
npm run sim -- --seed 42 --ticks 200 --snapshot 50,100,200

# Periodic snapshots, include the full GameState, write to a file
npm run sim -- --seed 42 --ticks 5000 --every 500 --state --out run.json

# Capture autobuy + worker-target decision traces (why each choice was made)
npm run sim -- --seed 42 --ticks 5000 --trace --out run.json
```

`--seed` and `--ticks` are required; `--snapshot <csv>` and/or `--every <n>` pick which ticks to capture (default: just the final tick); `--state` adds the full `GameState` (heavy — default is the lightweight `DerivedState` only); `--trace` captures decision traces into `result.traces` (opt-in, behavior-neutral — the sim is byte-identical with tracing off); `--out <path>` writes JSON to a file instead of stdout. Export uses plain `JSON.stringify` and reloads through the existing `migrateGameState` path. See [`docs/agent/sim-harness.md`](docs/agent/sim-harness.md) for the full API and design.

---

## Architecture

| Path                                      | Role                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                             | Top-level shell: save bootstrap, speed presets, interaction-achievement triggers, admin-console mount, release-history modal                                                                                                                         |
| `src/changelog.ts`                        | In-game release notes sourced from repo milestones                                                                                                                                                                                                   |
| `index.html`                              | App metadata, multi-format favicon links, web manifest link, and Open Graph / Twitter embed tags                                                                                                                                                     |
| `src/hooks/useLowFxMode.ts`               | Detects coarse-pointer desktop layouts (notably iPadOS landscape) so presentation layers can use cheaper FX variants without touching sim logic                                                                                                      |
| `src/hooks/useVersionCheck.ts`            | Polls `/version`, compares the live semver against `CURRENT_VERSION`, and drives the update-available banner in the app shell                                                                                                                        |
| `src/hooks/useGameLoop.ts`                | `requestAnimationFrame` loop, pause-on-hidden, autosave cadence, live field snapshots, throttled UI snapshot                                                                                                                                         |
| `src/game/advanceGame.ts`                 | Thin orchestrator that runs the simulation step order                                                                                                                                                                                                |
| `src/game/achievements.ts`                | Achievement definitions plus the UI/field interaction helpers for tourist, event cards, projectiles, corpses, modal opens, and lost-drone recovery                                                                                                   |
| `src/game/adminCommands.ts`               | Pure admin command executor for console actions such as resource grants, event triggers, enemy spawns, healing, cleanup, presets, speed requests, and update-banner requests                                                                         |
| `src/game/persistence.ts`                 | localStorage save/load bootstrap and migration entry point                                                                                                                                                                                           |
| `src/game/balance.ts`                     | Central tuning constants                                                                                                                                                                                                                             |
| `src/game/events/eventDefs.ts`            | Seeded mechanical event definitions, HUD linger metadata, and activation helpers                                                                                                                                                                     |
| `src/game/rng.ts`                         | Seeded Mulberry32 PRNG used by all simulation paths                                                                                                                                                                                                  |
| `src/game/targeting.ts`                   | Shared targeting helpers                                                                                                                                                                                                                             |
| `src/game/subsystems/`                    | Focused simulation modules: economy, spawns, movement, combat, scouts, sentinels, turrets, corruption, mining, autobuy, projectiles, events                                                                                                          |
| `src/components/FieldSvg.tsx`             | Battlefield SVG rendering; static district geometry memoized by seed/turret layout, with the expensive label blur disabled in low-FX mode and interactive targets for the tourist, lost drone, anomaly artifact, projectiles, and death-fade corpses |
| `src/components/AdminPanel.tsx`           | Hidden admin console opened by Space × 5: diagnostics, quick actions, shell toggles, a dedicated event-trigger section, command-terminal UI, and a collapsed quick-send command panel                                                                |
| `src/components/EventBackdrop.tsx`        | Full-screen ambient effect layer keyed off active event ids (purely presentational, respects `prefers-reduced-motion` and coarse-pointer low-FX mode)                                                                                                |
| `src/components/EventChip.tsx`            | Active-event HUD pill/card with hover/focus tooltip and click-to-inspect behavior                                                                                                                                                                    |
| `src/components/UpgradeIndicatorRail.tsx` | Horizontal rail of upgrade dots — glow on level, pulse when affordable, tooltip on hover/focus                                                                                                                                                       |
| `src/components/FieldStatsStrip.tsx`      | Compact pill row of live field stats with tone colours and detail tooltips                                                                                                                                                                           |
| `src/components/ActivityLog.tsx`          | Structured log panel with category icons, relative timestamps, and filter tabs                                                                                                                                                                       |
| `src/components/AchievementsModal.tsx`    | Achievements modal with category tabs, rarity colouring, hidden masking, progress bar, and target-aware scroll/focus navigation from the ribbon                                                                                                      |
| `src/components/Sidebar.tsx`              | Economy, automation, and threat panels                                                                                                                                                                                                               |
| `src/components/Background.tsx`           | Animated starfield and atmosphere layers; swaps to a static cheaper variant on coarse-pointer desktop layouts                                                                                                                                        |
| `src/components/HudPrimitives.tsx`        | Shared HUD widgets (StatusBadge, ResourcePill, StatTile, UpgradeTile)                                                                                                                                                                                |
| `src/components/Tooltip.tsx`              | Shared `TooltipPanel` primitive; `useTooltip` hook in `src/hooks/useTooltip.ts`                                                                                                                                                                      |
| `src/lib/manualOverride.ts`               | Pure helper for the hidden `1x -> 4x -> 1x` speed-sequence achievement timing                                                                                                                                                                        |
| `src/lib/versionCheck.ts`                 | Flat-version parsing, semver comparison, and `/version` fetch helper for the live-update banner                                                                                                                                                      |
| `src/components/ui/`                      | Local card and progress bar primitives                                                                                                                                                                                                               |
| `reference/`                              | Preserved single-file reference artifact                                                                                                                                                                                                             |

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

The repository also mirrors to GitHub
(`github.com/mdbook/nexus-drift`), where pushes to `main` auto-deploy a
static preview build to GitHub Pages at
<https://mdbook.github.io/nexus-drift/>. The Pages build is wired through
`.github/workflows/pages.yml` and uses `GITHUB_PAGES=true` to set Vite
`base` to `/nexus-drift/`; the local and production builds keep
`base: "/"` unchanged.

---

## CI

GitLab CI runs:

- **verify** — `npm ci`, `npm run typecheck`, `npm run format:check`, `npm run lint`, `npm test`
- **image build** — Kaniko-based build that publishes the container image
- **notifications** — success and failure alerts after the pipeline completes

Container release images are built automatically only for `main` and `dev`. Each
release build publishes the commit SHA, `:latest`, and the exact
`package.json` version tag; `dev` builds also keep the `:dev` channel tag. Before
building, CI checks the GitLab container registry and fails if that version tag
already exists, so repeated pushes with the same release version cannot silently
retarget the published version image.

---

## Known Deferred Work

Follow-up work for `3.2.0+` that was deliberately scoped out of `3.1.0`
because the touch surface was too large for a release polish pass. Each
item has an in-source `TODO(3.2.0)` comment anchoring it.

- **`computeDerived` lift** — `computeDerived` runs ~15× per tick because
  every subsystem recomputes it independently. Naïve WeakMap memoization is
  unsafe (state identity is stable but contents mutate mid-tick). The
  correct fix threads `derived` through subsystem signatures and patches
  specific fields after mutating phases. See
  `src/game/selectors.ts:computeDerived`.
- **Spatial index for enemy / worker scans** — movement, targeting, and
  combat all walk the full live-enemy list every tick. At admin speeds
  (`20×`, `100×`) with 100+ enemies this is measurable. Add a coarse grid
  (~64 px buckets) built once per tick at the top of `advanceGame` and
  reuse it across all nearest-neighbor scans. See top of
  `src/game/subsystems/movement.ts`.
- **Split `movement.ts`** — ~800 LOC housing three concerns (worker
  movement, enemy movement, ghost reposition). Break into
  `workerMovement.ts`, `enemyMovement.ts`, and a `ghostReposition.ts`
  helper. See top of `src/game/subsystems/movement.ts`.
- **Retire unseeded `Math.random` helpers in `src/game/utils.ts`** — the
  sim is deterministic and seeded via `src/game/rng.ts`; `rand`, `pick`,
  `chance`, and `pickWeighted` all fall back to `Math.random` and are only
  safe for cosmetic paths (starfield). Split them into a clearly-labeled
  cosmetic module or lean on the seeded `Rng` everywhere.
- **React `18 → 19` upgrade** — the app pins to React `18.3.1` plus
  matching type packages. Upgrading unlocks the newer `useOptimistic` /
  `useFormStatus` ergonomics and the compiler, but `framer-motion` and
  `lucide-react` peer ranges need revalidation first.

### Audit-pass polish (3.1.4)

Smaller follow-ups surfaced by the 3.1.4 audit that were consciously
scoped out. Not structural — mostly a11y, tooling, and migration
tightening. Each of these can be its own tiny PR.

- **TODO: `AchievementsModal` target-scroll effect re-runs per sim
  render.** The sorted list re-creates each sim render at
  `src/components/AchievementsModal.tsx:207`. Memoize the sort or
  narrow the scroll effect to fire only on target-id change.
- **TODO: `WikiOverlay` focus trap / restore weaker than
  `AchievementsModal`.** A11y consistency pass, not a regression.
- **TODO: Tourist drone keyboard focus ring.** `src/components/FieldSvg.tsx:1537`
  removes the outline without a `:focus-visible` fallback — keyboard
  users lose the focus ring on that target.
- **TODO: Mobile `ResourceBar` order check.** `order-4` on the resource
  bar may push resources below the sidebar on mobile. Verify on a real
  mobile viewport before treating it as a bug — the current order may
  be intentional.
- **TODO: Pin CI notification script.** `.gitlab-ci.yml:53,63` `wget`s
  a mutable `master` URL from self-hosted GitLab. Pin to a commit SHA
  or vendor the script into the repo.
- **TODO: Run `npm audit` locally.** Not part of the 3.1.4 triage;
  worth one pass to baseline dependency advisories.
- **TODO: Add `npm run build` to the CI verify stage.** Currently only
  exercised by the Docker build on `main` and `dev`, so branch
  pipelines can miss Vite compile regressions until deploy.
- **TODO: Tighten `migrateGameState` unknown-key handling.**
  `src/game/factories.ts:523` spreads `raw.achievements` unfiltered;
  the stats migration accepts unknown event-stat keys the same way.
  Inert because the UI renders from `ACHIEVEMENT_DEFS`, but the
  tightening is cheap.
- **TODO: Seed pattern for `createInitialGameState()`-based tests.**
  Audit-caught a flaky test (see commit 12) rooted in
  `createInitialGameState()` without a fixed seed; fixed that specific
  case and added a header comment in `src/game/__tests__/advanceGame.test.ts`,
  but the broader pattern-level refactor (either default-seed the
  helper in test contexts or audit every call site) is deferred.

### Balance / progression follow-ups

- **TODO: Speed up early-game progression so variety arrives sooner.**
  New players currently sit on the tier 0 roster (mite + wisp) until
  the director `score` crosses 75, and the full roster doesn't open
  until tier 6 (score 450) — see the score coeffs and `combatWeights`
  `minTier` gates in `src/game/balance.ts:686`. The goal is for players
  to see rushers / brutes / sappers noticeably faster without
  collapsing the long-haul curve that 3.0.0 established. Candidate
  levers: raise `PROGRESSION.scoreCoeffs.level` / `totalUpgrades`,
  lower `tiersPerScore`, or pull the `minTier` gates for the early
  variety enemies (rusher/brute/sapper) down a tier. Needs a balance
  pass, not a one-line tweak — pick after deciding whether tier pacing
  or unlock gates is the right knob.
- **TODO: Scale enemy HP to keep pace with turret upgrade investment.**
  Turret damage grows with both `upgrades.turret` and `upgrades.reactor`
  (see `TURRET` in `src/game/balance.ts:356`) but enemy `hpBase` and
  `hpWave` (`ENEMY_STATS`, `src/game/balance.ts:139`) are flat values
  with no upgrade-linked scaling — late-game turrets can one- or
  two-shot mid-tier enemies regardless of how far into the run you are.
  Two candidate approaches: (a) apply a multiplicative scaling factor
  to `hpBase` driven by `director.score` or `director.tier` on enemy
  spawn (keeps balance.ts values as baselines), or (b) directly buff
  `hpBase` / `hpWave` per problem enemy and nudge turret
  `damagePerTurret` / `damagePerReactor` down proportionally. Approach
  (a) is more self-correcting; (b) gives finer per-archetype control.
  Either way, cross-check against sapper explosion, missile silo
  `damageBase`, and sentinel `damageBase` so one-shot outliers don't
  just shift to a different weapon.

---

## Notes For Contributors

- Keep `package.json` version and `src/changelog.ts` aligned when doing release work.
- If architecture, commands, or player-facing behavior changes, update `README.md` and the relevant `docs/agent/<shard>.md` in the same pass (see [`docs/agent/INDEX.md`](docs/agent/INDEX.md)).
- Follow-up UI/docs tweaks belong to the current in-flight release unless the user says otherwise.
- Local `.claude/` files are tooling noise; repo docs, git status summaries, and linting should treat the whole directory as ignored.
- Compare against `reference/idle_wallpaper_game.reference.jsx` when you need the original intended feel.
- Performance rule of thumb: keep the field live, but prefer throttled or memoized snapshots for non-field chrome (resource bars, sector card, sidebar, logs) so scrolling and hover do not compete with the 30 Hz simulation loop. On coarse-pointer desktop layouts, preserve the visual direction but route expensive ambient motion and SVG filters through `useLowFxMode`.
