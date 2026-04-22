# Nexus Drift Handoff

## Overview

Nexus Drift is a React + TypeScript + Vite app that runs an ambient autonomous colony sim entirely in the browser. The original single-file artifact is preserved at `reference/idle_wallpaper_game.reference.jsx`; the maintainable app lives under `src/`.

Current version: **3.1.3**. The in-game changelog is at `src/changelog.ts` and opens via the version badge in the header. As of 2.0.0 the project dropped its leading `0.` prefix from all historical versions — the first release is now `0.1.0` (was `0.0.1`), and the "Living Field" milestone is `2.0.0` (was `0.2.0`).

## Core Architecture

- `advanceGame(prev)` is the single simulation orchestrator. It clones state, advances timers, runs each subsystem in a fixed order, and returns the new state.
- The subsystem execution order inside `advanceGame.ts` is load-bearing and is fully documented with per-step rationale in that file. Do not reshuffle without reading those comments.
- Simulation logic is split across focused modules in `src/game/subsystems/`.
- `GameState` carries a seeded `Rng` instance and `citySeed`, so simulation randomness is deterministic once a run starts. All gameplay randomness must flow through the seeded `Rng`, never `Math.random()`.
- Save files carry a `schemaVersion` field (currently `9`). `migrateGameState()` always stamps the current version on load and handles older saves gracefully. The `SCHEMA_VERSION` constant lives in `factories.ts`; schema 6 existed only during 3.0.0 branch testing and uses the same field-presence fallback path. v5 added AI fields: `ResourceNode.workTicks`, `Agent.threatMemory`, `Enemy.archetype`, `Enemy.squadId`, optional `Enemy.dashTicks` — all populated with `?? default` fallbacks during migration. v7 scaffolds the Balancing & Behavior update: new `warden` enemy kind and `missileLauncher` upgrade in the unions; per-worker `speedMod` / `fearMod` / `harvestBias` variance plus class-ability ticks (`overclockTicks`, `sprintTicks`, `sprintCooldown`) and corruption fields (`corrupted`, `corruptionTicks`, `corruptingTicks`, `spottedTicks`, `rebootTicks`); turret HP fields (`hp`, `maxHp`, `damageTicks`, `brokenTicks`); scout/sentinel HP + retreat fields (`hp`, `maxHp`, `damageTicks`, `retreating`, `rebootTicks`); new top-level `missileSilos: MissileSilo[]`, `city: CityState`, `nextSiloId` fields; and stats counters `wardensKilled`, `corruptedPurified`, `turretsBroken`. v8 adds `Enemy.permanentCloak?` (warden ghost rework — backfills `true` for wardens on load). v9 adds `Scout.disabledTicks` and `Sentinel.disabledTicks` so zapper bolts can disrupt mobile defenders the same way they already do workers and turrets. All new fields carry `?? default` migration fallbacks.
- Presentation-only calculations live in `selectors.ts` and are exposed to React as derived state. Do not put derived calculations inside subsystems.
- React rendering sits on top of the sim via `useGameLoop()`: `requestAnimationFrame` + fixed-tick accumulator, pauses on hidden tabs, autosaves every 30 seconds, and publishes a live field snapshot plus a short-throttled UI snapshot (`125ms`) so sidebar/chrome rendering is not locked to the full sim cadence.

## Project Structure

- `src/App.tsx` — top-level layout, save bootstrap, speed presets, achievement UI, easter-egg listeners, admin console mount, and release-history modal
- `src/components/AdminPanel.tsx` — hidden admin console opened with Space × 5 (keyboard) or by tapping the version badge 5 times within 2 s (mobile). Single Card that animates height via CSS `grid-template-rows` when collapsing/expanding; chevron rotates 180°. Provides live diagnostics, quick scenario/setup actions, shell toggles, a vertically-wrapping event-trigger section, and a command terminal. The console is app-shell/UI state only; command history and collapsed state are not persisted.
- `src/changelog.ts` — structured in-game release notes (source of truth for version history). Every non-trivial shipped change should be represented there, either as a new release entry or by expanding the current version's entry before release.
- `index.html` — app metadata, multi-format favicon/manifest links, and Open Graph / Twitter embed tags. Current setup: favicon uses the branded `nexus-drift` mark via SVG + PNG + ICO fallbacks; embeds still use `public/og-image.png`.
- `src/hooks/useLowFxMode.ts` — presentation-only media-query hook for coarse-pointer `lg` desktop layouts (notably iPadOS landscape Safari). Use it to keep the same visual direction while dropping the most expensive continuous FX; never branch gameplay or sim logic on it.
- `src/hooks/useVersionCheck.ts` — app-shell polling hook for `/version`. Fetches roughly every 5 minutes plus on tab refocus/visibility return, extracts a flat semver from plain text or JSON-ish responses, surfaces a session-scoped update banner when a newer release is live, and exposes an admin-only preview trigger so the same banner path can be tested on demand.
- `src/components/Background.tsx` — animated starfield and atmosphere layers. On `useLowFxMode`, this swaps to a static cheaper variant with fewer stars and no drifting glow animation.
- `src/components/EventBackdrop.tsx` — full-screen ambient effect overlay keyed off active event ids. Purely presentational, never touches sim state. Respects both `prefers-reduced-motion` and `useLowFxMode`; the coarse-pointer path keeps the event colour washes/glows but drops the heavier particle loops and long-lived blur motion. Effect per event id: `meteor_shower`, `solar_flare`, `cache_discovery`, `pirate_caravan`, `xeno_bloom`, `dust_storm`, `echo_signal`.
- `src/components/EventChip.tsx` — active-event HUD chip. Tone-coded by `EventDef.tone`. Hover or focus reveals a tooltip with the event name, a rarity label (`common` / `uncommon` / `rare` / `legendary`) derived from `EventDef.weight` (≥0.7 common, ≥0.4 uncommon, ≥0.15 rare, <0.15 legendary), flavor text, and a per-effect list (each item colour-coded by its own tone). Timed events keep visible countdowns; one-shot cards deliberately omit the timer, keep the same compact chip footprint, and fade by remaining HUD linger instead. Chips are `shrink-0` + `whitespace-nowrap` so crowded event lanes scroll horizontally instead of collapsing labels into multi-line pills. Inspected cards now keep things subtle by dimming the existing leading marker dot, and clicks produce a small local ripple at that dot rather than a louder full-card state change. Tooltip uses `position: fixed` with a ref-measured viewport anchor so it escapes the flex-wrap row's potential clipping ancestors.
- `src/components/UpgradeIndicatorRail.tsx` — compact rail of one glowing dot per currently-visible upgrade. Category colour (yield / defense / support / elite) is centralized in a `UPGRADE_CATEGORY` map inside the component. Glow intensity scales with level (capped at 5 so late game does not wash out), and affordability drives a pulsing outer ring. Visibility rules mirror `Sidebar` exactly (tier gate + sentinel brute-kill gate). Tooltip uses `position: fixed` — required because the rail's inner row has `overflow-x-auto` which would clip any `absolute bottom-full` tooltip via the CSS overflow interaction rule. Placement is responsive: mobile keeps it in the field footer with upward-opening tooltips; `lg` desktop renders it as an absolutely-positioned overlay in the top-right chrome band above the resource bar with downward-opening tooltips. The desktop chrome position is intentionally kept tight to the sector card so the rail does not drift down into the top row of resource pills, and its horizontal scrollbar is explicitly styled thin.
- `src/components/FieldStatsStrip.tsx` — horizontal stat pill row with per-pill tooltips. Each pill carries a tone (`calm` / `warn` / `danger` / `ready` / `toxic`) driven by derived state (integrity thresholds, `hostilePressure`, `corruptionPressure`, `progression.recoveryMode`, tier). Labels hide on mobile; icons + values + dots remain. Corruption pill shows a single combined count (corruptors + infected nodes) to stay compact. Tooltip uses `position: fixed` for the same reason as `UpgradeIndicatorRail` (inner scroll row clips upward tooltips).
- `src/components/FieldSvg.tsx` — battlefield SVG rendering (workers, enemies, nodes, sentinels, projectiles, day/night cycle). Home-district building geometry is memoized by `citySeed` + active turret layout so decorative skyline generation is not repeated every tick. In low-FX mode the extra SVG text blur pass is disabled, but the foreground labels still render normally. The late-game tourist drone is also rendered here as a keyboard/click target with an expanded transparent hit area so the hidden achievement is intentional rather than accidental.
- `src/components/ActivityLog.tsx` — structured activity log panel: category icons, relative-age timestamps, filter tabs (including Awards), scrollable 40-entry history
- `src/components/AchievementsModal.tsx` — full achievements modal: category tabs, rarity colouring, hidden masking, progress bar, rarity legend, and target-aware scroll/focus support when the field ribbon opens a specific achievement
- `src/components/WikiOverlay.tsx` — Subnautica-PDA-style "Field Archive" overlay (42 entries across Field Entities, Resources, Defenses, Sector Operations, Field Events). Opened via a small "ARCHIVE" button above the "purge wing online" text in the App.tsx header. Purely presentational — no game state contact. Left sidebar index + right content pane; mobile collapses to index-first with entry navigation. Lore-first writing style: atmospheric field dossiers, Field Notes bullets for key behaviors, no stat tables.
- `src/components/Sidebar.tsx` — economy, automation, and threat panels
- `src/components/HudPrimitives.tsx` — shared HUD widgets (StatusBadge, ResourcePill, StatTile, UpgradeTile)
- `src/components/ui/` — local card and progress bar primitives
- `src/lib/versionCheck.ts` — version parsing/comparison helper plus the `/version` fetch wrapper used by `useVersionCheck`
- `src/hooks/useGameLoop.ts` — rAF-driven simulation loop, pause-on-hidden, autosave, direct state mutation hook for admin controls, and a throttled `uiGame` / `uiDerived` snapshot for scroll-heavy chrome surfaces
- `src/game/advanceGame.ts` — thin orchestrator over subsystem steps; execution order documented inline
- `src/game/achievements.ts` — achievement definitions, unlock helper, and the explicit `spotTourist()` secret trigger used by the UI click path
- `src/game/adminCommands.ts` — pure admin command executor used by `AdminPanel`. Commands mutate the cloned `GameState` supplied by `mutateGame()` and return shell effects for speed/banner actions instead of reaching into React state directly.
- `src/game/persistence.ts` — localStorage save/load with `schemaVersion`-aware migration
- `src/game/factories.ts` — initial state, entity construction, `SCHEMA_VERSION`, `migrateGameState`
- `src/game/selectors.ts` — UI-facing derived state
- `src/game/balance.ts` — single source of truth for all tuning constants
- `src/game/rng.ts` — deterministic Mulberry32 PRNG
- `src/game/targeting.ts` — shared targeting helpers
- `src/game/events/eventDefs.ts` — seeded random-event definitions and activation helper
- `src/game/subsystems/` — economy, spawns (+ stepWardenSpawn), movement, workers (slot activation), corruption, workerCorruption (warden attach + node drain + worker reporting), turrets, scouts, sentinels (+ cleanse path), combat, mining, autobuy, projectiles, events, achievements
- `src/game/__tests__/advanceGame.test.ts` — 104 tests: simulation invariants, subsystem behavior, achievement edge cases, projectile behavior, corruption linger, worker-slot gating/costs, surround-pressure combat, save/load round-trip, turret/scout/sentinel/city HP, multi-class enemy targeting, missile silo subsystem, worker class abilities (Step 6), and worker corruption system including warden attach cycle/decay, warden kill credit, node drain, worker reporting, sentinel cleanse, worker reboot, and stepWardenSpawn gates/cooldown semantics (Step 7)
- `src/game/__tests__/adminCommands.test.ts` — 6 tests: admin resource grants, upgrade mutation, timed event trigger/revert, seeded enemy spawning, corruption cleanup, and shell-effect commands for speed/banner requests.
- `src/game/__tests__/interactionAchievements.test.ts` — 10 tests: explicit interaction-driven achievement paths, event HUD linger, anomaly gating, migration of newer interaction fields, and manual-override timing
- `src/game/__tests__/aiBehavior.test.ts` — 25 tests: worker path safety, commitment, flee-direction retargeting, and crowded-node avoidance, archetype targeting, brute target stability, squad bucketing, sentinel intercept priority, scout finish-bias, sticky retarget threshold, ambusher dash trigger/duration, ghost reposition window, group dispersal, save migration, and threat-field path weighting
- `src/lib/versionCheck.test.ts` — 7 tests: flat-version parsing, preview-version generation, semver comparison, and `/version` fetch handling for plain text and JSON payloads
- `.gitlab-ci.yml` — verify and container-build pipeline. Automatic release image builds only run on `main` and `dev`: `main` publishes the commit SHA plus `:latest`, while `dev` publishes the commit SHA plus `:dev`.
- `docker/nginx.conf` — SPA serving config with security headers
- `Dockerfile` — multi-stage production image build

## Layout

The UI uses Tailwind with a responsive flex layout:

- **Mobile / small tablet (< 1024px)**: title + top chrome controls → field card (full width) → resource pills → sidebar stacked below. The field gets immediate focus without hiding the public speed controls below the fold.
- **Desktop / large tablet (lg, ≥ 1024px)**: field + sidebar side by side; sector status card collapses to a compact single-row bar positioned absolute top-right; speed presets and New Game button integrate into the title row. This threshold was chosen so 11-inch iPads in landscape (1194px CSS) get the full desktop layout. The `xl` (1280px) breakpoint no longer drives layout — all structural classes use `lg:`.
- The field card and sidebar wrapper are direct children of a `lg:grid-cols-[1.45fr_0.85fr]` grid. **Both carry `min-w-0`**, without which grid items default to `min-width: auto` and the intrinsic content width of scrollable pill strips / long labels forces the grid wider than the viewport, pushing the sidebar off-screen. Do not remove `min-w-0` from either.
- Achievement badges live inside the field card, below the field toolbar, so they don't consume outer layout height.
- On mobile, the field card footer contains, top to bottom: the active events bar (`EventChip`s), the `FieldStatsStrip` (live stats), and the `UpgradeIndicatorRail` (glowing dots). This is the primary small-screen HUD surface — keep any new live indicators here rather than in the sidebar.
- On `lg` desktop layouts, the upgrade rail leaves the footer and renders as an absolutely-positioned overlay in the otherwise-unused top-right chrome band above the resource bar. The footer overlay contains the active-events row plus the stats strip. The events row is always rendered — "No ongoing events" placeholder when idle — so footer height is stable and the canvas never resizes when events start or end. The SVG wrapper uses a fixed `lg:mb-[83px]` / `mb-[124px]` inset (one constant since the footer height is now stable) to keep the city strip visible above the overlay footer.
- Max content width is 1920px with wider gutters at xl.

## Game Systems

### Resources

**Gold, Ore, Gems, Energy, Cores, Flux.** Gold anchors the early economy. Cores come from elite combat kills (brutes, phantoms). Flux comes from anti-corruption play (purges, corruptor kills). Upgrade costs can consume multiple resource types.

### Workers

Kinds: `miner`, `runner`, `drone`. Each kind has **3 slots** (9 agents total). Slot 0 starts active. Extra slots are intentionally late-game: the relevant upgrade track still has to reach its slot thresholds (level 3 for slot 1, level 6 for slot 2), but 3.0.0 stretched the sector-level gates so the second unit now deploys at **sector level 22** and the third unit at **sector level 42** (up from 12 / 24). Those two slot-unlock purchases also add `flux` + `cores` costs on top of the normal gold price, and the surcharges were scaled up ~4× in 3.0.0 (`flux: 18 / cores: 4` at level 3; `flux: 55 / cores: 14` at level 6) so the unlock feels like a deliberate spend. The `active: boolean` field on `Agent` controls this — inactive agents are skipped by all sim logic and hidden in the renderer.

`WORKER_SLOTS_BY_UPGRADE` in `balance.ts` maps upgrade level → slot eligibility, `WORKER_SLOTS_BY_LEVEL` maps sector level → late-game slot eligibility, and `WORKER_SLOT_UNLOCK_RESOURCE_COSTS` adds the flux/core surcharge for the level-3 and level-6 worker-track purchases. `stepWorkerSlots()` in `subsystems/workers.ts` reconciles active flags against the minimum of the upgrade gate and the level gate each tick (called after `stepEconomy`, before `stepSpawns`).

Workers pick targets autonomously via a scored target-selection function in `src/game/ai/workerTargeting.ts` (`chooseWorkerTarget` / `scoreWorkerNode`). Scoring factors in distance, kind preference, path threat (sampled at start/midpoint/destination via `threatAlongPath`), explicit close-enemy count around the node (`nodeThreatRadius` / `nodeThreatCrowdPenalty`), corruption tolerance (non-miners hard-avoid heavily corrupted nodes), node progress (`workTicks` bonus for nodes actively being mined), a current-target finish bonus for partially mined nodes, a contested-by-evading-workers penalty (quadratic — third worker on a node is a strong deterrent), and a **region-distance penalty** that biases each kind toward its preferred field sector. Worker targeting filters to live enemies before scoring, so death-fade enemies stay visual-only and cannot affect path threat, node crowding, or flee-direction retargeting.

**3.0.0 Step 6 — Per-individual variance, class abilities, and self-defense.** Each `Agent` now carries three per-agent float fields seeded at spawn by a deterministic hash of `agent.id`:

- `speedMod` (±12% from 1.0) — multiplies traversal and evade speed alongside the existing veteran bonus.
- `fearMod` (±20% from 1.0) — multiplies `pathFearScale * WORKER_AI.pathSafetyPenalty` in `scoreWorkerNode` so cautious individuals genuinely pick safer routes.
- `harvestBias` (±0.15 additive) — nudges the tier-preference score multipliers: positive values tilt the agent toward its tier-1 nodes; negative values toward off-tier variety.

Class-specific abilities (constants in `WORKER_ABILITIES`, `balance.ts`):

- **Miner overclock** (`overclockTicks`): increments each tick the miner is at a node with `damageTicks === 0`; resets on leaving the node or taking a hit. Once `overclockTicks >= WORKER_ABILITIES.overclockThresholdTicks` (120), `stepMining` adds `overclockCritBonus` (0.10) to the mining crit-chance roll. The miner's bonus is active for each node exhaustion; the tick counter clears when the node is mined out and the miner re-approaches.
- **Runner sprint** (`sprintTicks`, `sprintCooldown`): when a runner is evading with `panic > sprintPanicThreshold` (40) and `sprintCooldown === 0`, sprint fires: `sprintTicks = 90`, `sprintCooldown = 600`. While `sprintTicks > 0`, evade and traversal speed are multiplied by `sprintSpeedMult` (1.5). Both timers decrement each active tick.
- **Drone scan** (passive): `chooseWorkerTarget` pre-computes which resource nodes have an active drone within `droneScanRadius` (100 px). For those nodes, the `corruptionSoftMultiplier` (1.9) is reduced by `droneScanCorruptionDiscount` (0.15), making corrupted-but-covered nodes slightly less aversive for non-miner workers.

**Worker self-defense retaliation**: at the end of each `stepCombat` worker-damage loop, if the worker is not recovering (`hp >= maxHp * 0.6`), not disabled, and not corrupted, it deals `WORKER_ABILITIES.retaliateBase (0.35) + upgrades.bot * retaliatePerBot (0.05)` damage to each attacker via `damageEnemy`. This routed through the existing `damageEnemy` funnel so shield absorption applies. Retaliation is suppressed for corrupted workers (Step 7) since they cannot self-defend.

**3.0.0 Step 7 — Void warden infection and worker corruption.** Late-game (tier ≥ 4) a new subsystem `stepWorkerCorruption` (in `subsystems/workerCorruption.ts`) runs three phases each tick after `stepCorruption`:

1. **Warden attach** (`stepWardenAttach`): Each live warden enemy seeks the closest non-corrupted, non-rebooting active worker within `WARDEN.attachRadius` (18 px) and increments `agent.corruptingTicks`. When `corruptingTicks >= WARDEN.attachTicks` (210), the worker converts: `corrupted = true`, `corruptionTicks = 0`, `maxHp = round(WARDEN.workerBaseHp * WARDEN.corruptToughnessMult)` (150), and the warden is spliced directly from `state.enemies` without going through `resolveEnemyDeaths` (so no gold reward is given and `wardensKilled` is not incremented). The toughness buff means sentinels need more cleanse shots to down a corrupted worker. Any worker with stale partial attach progress that is not actively touched by a warden decays by 0.5/tick, even if a different worker has become the nearest warden candidate.

2. **Corrupted worker tick** (`stepCorruptedWorkers`): Each corrupted worker sets `task = "Corrupted"`, increments `corruptionTicks`, ticks down `spottedTicks`, and drains nearby resource nodes at rate `WARDEN.drainRatePerTick * (1 + corruptionTicks / WARDEN.drainRampDivisor)`. Nodes at 0 hp are respawned immediately (non-gold) or removed (temporary) without awarding resources. Corrupted workers skip all normal pathfinding (movement.ts returns early on `agent.corrupted`) and are immune to enemy contact damage (`stepCombat` guards on `agent.corrupted`).

3. **Worker reporting** (`stepWorkerReporting`): "healthy" reporters — active workers that are not corrupted and not in the reboot window — within `WARDEN.workerReportRadius` (120 px, ×1.4 for drones) of a corrupted worker set that agent's `spottedTicks = WARDEN.workerReportDuration` (600). Rebooting cleanse survivors do not report. Any sentinel treats a corrupted worker as visible while `spottedTicks > 0`, regardless of distance. The scan no longer short-circuits on `spottedTicks > 0`, so a reporter standing next to a corrupted agent pins the timer at max instead of letting it decay out.

**Warden spawning** (`stepWardenSpawn` in `spawns.ts`, wired in `advanceGame` after `stepSpawns`): gates on `tier >= WARDEN.wardenSpawnTierThreshold` (4). The `state.timers.warden` counter increments only while the field is eligible for a new infestation; if a live warden is already on the field or the fleet has ≤ 1 healthy worker remaining (`active && !corrupted && rebootTicks === 0`), the timer resets to 0. This "always keep one healthy worker" invariant scales with the player's fleet — early-game (3 workers) blocks the second warden once two are corrupted, late-game (9 workers) allows up to 8 simultaneous corruptions. Two simultaneous corruptions are reachable; the `void_outbreak` (3+) achievement stays hard but legitimate. When the eligible timer reaches `WARDEN.wardenSpawnIntervalTicks` (3600 ≈ 2 min), a warden spawns and the timer resets.

**Sentinel cleanse**: sentinels check for visible corrupted workers (`dist <= WARDEN.corruptionVisionRadius (140)` OR `spottedTicks > 0`) before regular enemy targeting. On finding one, the sentinel moves toward it and fires a purple cleanse beam (projectile color `rgba(192,132,252,0.9)`) using its normal cooldown and damage. On the shot that drops the worker's HP to ≤ 0: corruption is cleared (`corrupted = false`, resets corruptionTicks/corruptingTicks), `maxHp` is reset to `WARDEN.workerBaseHp` (100 — undoing the attach-time toughness buff), HP is restored to the new maxHp, `rebootTicks = WARDEN.corruptionRebootTicks` (1800 ≈ 60 s) is set, `WARDEN.cleanseFluxReward` (6) flux and `WARDEN.cleanseCoreReward` (2) cores are awarded, and `state.stats.corruptedPurified` increments. Worker reboot parks the agent at homeX/homeY, skips all sim logic, and restores HP to maxHp when the counter hits 0. The admin `clearCorruptedWorkers` command uses the same maxHp restoration path.

**Corruption visual**: in `FieldSvg.tsx`, corrupted workers render with a purple body fill (`rgba(120,40,180,0.55)`) and a pulsing void-purple outer ring. Shake amplitude scales with `corruptionTicks` (up to 3 px). While a warden is mid-attach (`corruptingTicks > 0`), a dashed amber warning ring scales with attach progress. Rebooting workers are rendered at 45% opacity.

New balance constants: `WARDEN` block in `balance.ts` (attachRadius, attachTicks, drain params, cleanse rewards, reboot duration, vision radius, report radius, spawn interval/tier). New stat field: `corruptedWorkerOutbreakTicks` (running ticks with 3+ simultaneous corrupted workers — used by the `void_outbreak` achievement; resets to 0 when count drops below 3).

**Worker personalities and territories** (`WORKER_PERSONALITY`, `WORKER_REGIONS` in `balance.ts`):

- **Miner** — left sector (cx 200, cy 250), brave (`pathFearScale 0.60`), pushes through moderate threats.
- **Runner** — mid-field (cx 500, cy 280), moderate courage, loose territory.
- **Drone** — right sector (cx 780, cy 240), cautious (`pathFearScale 1.30`), takes safer routes.

Each kind has a `groupRepelRadius` and `groupRepelMinCount`; when that many same-kind peers are nearby, a centroid-repulsion force (scaled with crowd size) disperses the cluster. Applied after the per-frame separation pass in `movement.ts`.

When `hp < maxHp * 0.5` (hurt but not yet in full recovery), workers nudge toward their region center each tick (`lowHpPull`) instead of all converging on the home pad.

Evasion direction blends 70% old heading / 30% new signal (smooth curves). As of 2.4.2, workers are intentionally less proactive about distant threats: enter radius is 62 px, exit radius is 104 px, evasion persistence is 52 ticks, and `WORKER_AI.pathSafetyPenalty` is 34. Workers at their node use a tighter `harvestingEvasionRadius` (42 px) so they finish a harvest under mild pressure. As of 2.4.3, harvesting workers ignore one or two nearby enemies until `damageTicks` shows actual damage; three or more nearby enemies still force early evasion. As of 2.4.4, close-combat pressure also scales up when multiple attackers are already in contact, so a real surround hurts harder instead of letting a worker slip out. Sticky retarget threshold is 0.64, meaning a candidate must be much better before it unseats the current assignment; partially mined current nodes also get `currentTargetProgressBonus`. Workers in persistent evasion with no immediate threat periodically call `chooseFleeDirectionTarget()` to look for a safe node ahead along `evadeDx/evadeDy`; candidates behind the worker, outside the flee lane, too far ahead, or behind a high-threat path are rejected. Each worker carries `threatMemory` (EMA of local enemy threat) to drive the regroup trigger. Workers recover from damage, reboot from home pads on destruction, and accumulate veteran ranks (kills nearby → speed bonus + visual chevron). **3.1.2 — combat-death reboot**: when a worker's HP reaches 0 in `stepCombat`, `rebootTicks` is set to `WORKER.respawn.rebootDuration` (180 ticks ≈ 6 s) instead of the old instant-teleport-with-55%-HP path. A `workerDeathFlash` singleton is emitted at the death position (25-tick expanding blue ring). Movement.ts parks the worker at home and linearly regenerates HP over the reboot window; a charging SVG ring in `FieldSvg.tsx` shows progress. Corruption-cleanse reboot (`corruptionRebootTicks` = 1800 ticks) uses the same path and also benefits from per-tick HP regen (quickly hits maxHp, then stays clamped). `workerDeathFlash` is a transient `GameState` field — always `null` in saves, ticked down inside `stepCombat` before the cadence guard.

**3.1.3 — Worker speed smoothing.** Tightened the spread between baseline movement states so flee/work/damaged/traversing don't read as gear shifts. Maxed-panic evade multiplier now caps at 1.06× (was 1.28×) — within ~12% of base work speed. `WORKER.recoverySpeed` 0.66 → 0.78, `damagedSpeed` 0.66 → 0.82, `traversingSpeed` 0.74 → 0.88. Sprint cooldown (`WORKER_ABILITIES.sprintSpeedMult = 1.5`) and per-worker `speedMod` variance are intentional bursts / spawn-time flavour and remain untouched.

**3.0.0 Step 8 — Director polish.** Three targeted AI tweaks:

- **Panic cascade**: evade persistence now scales super-linearly with attacker count — `Math.pow(n, 1.5) - 1) * EVADE_BONUS_PER_THREAT` replaces the old linear `(n-1) * 10`. A single pursuer barely extends evasion; a real three-enemy surround compounds hard.
- **Scout pair-up at 2**: `SCOUT_AI.pairUpScoutCount` lowered from 3 → 2 so multi-scout synergy fires in standard mid-game play, not only if a full three-scout squad is active.
- **Turret coordination bonus**: `getTurretTargetScore` in `turrets.ts` reduces the score (raises priority) by `TURRET_COORD_BONUS` (60) when the target enemy is actively chasing a worker within 200 px of the home district, preventing turrets from tunnel-visioning on distant strays while a brute marches on the home pad.

Worker movement now treats live enemy bodies as physical obstacles. `stepWorkers()` samples `WORKER_BLOCKING` radii from `balance.ts` and slows workers that are moving through crowded hostile lanes. The layer is intentionally slowdown-only: it must not apply a hidden knockback force that shoves workers away from nearby enemies. Dying enemies (`hp <= 0`) do not block movement; only live hostile bodies participate. `Agent.tx` / `Agent.ty` are destination/render anchors, not authoritative velocity. If resources or a future moving-node type ever move during the sim tick, update node positions before worker movement/blocking and derive velocity-sensitive behavior from actual `x/y` deltas.

### Enemies

**Combat** (`mite`, `raider`, `wisp`, `rusher`, `brute`, `sapper`, `leech`, `phantom`, `zapper`): pursue workers, apply pressure, targeted by turrets. Phantoms cycle cloak and disappear from turret targeting while hidden. Sappers detonate near workers. Brutes and phantoms yield Core fragments on death. Zappers (tier 7+) hold at firing range and fire energy bolts (`tag: "zapper-bolt"`) that disable the struck target for 210 ticks (~7s); disabled workers freeze with task `"Disabled"`, disabled turrets skip firing, and disabled scouts/sentinels skip their entire step (no movement, targeting, cleanse, or combat). **Leeches (tier 6+) bypass worker targeting entirely and drive directly for the home district** to activate their gold/energy drain — their movement goal is a hardcoded home anchor (`HOME_DISTRICT_X = 500`, `HOME_DISTRICT_Y = 490`) in `movement.ts`.

Enemy variety by tier (from `PROGRESSION.combatWeights` in `balance.ts`): wisps appear from tier 0 (no `minTier` gate), raiders from tier 1. **3.1.3** lowered the late-game gates so unlocked variety lines up with the slowed-down score curve: rushers tier 2 (was 3), brutes tier 3 (was 4), sappers tier 4 (was 5), leech tier 5 (was 6), phantom & zapper tier 6 (was 7). **Corruptors gate at tier 1** (3.1.2 — was tier 2); blights are a corruptor variant that replaces the corruptor slot 35% of the time at tier 5+. **The scout upgrade unlocks at tier 1** (`minTier: 1` in `data.ts`, 3.1.2 — was tier 2) so players can buy intercept capability before the first corruptors arrive.

**3.1.3 — Spawn director pacing.** Two structural changes to `computeProgressionDirector` in `progression.ts`:

- **Defensive interval drag eased.** `intervalPerTurret` 4 → 1.5 and `intervalPerScout` 3 → 1.0 — a healthy turret line no longer starves the field. Pressure now lifts as defences come online instead of cratering.
- **Field-fill feedback on the interval.** A new `fillRatio = liveEnemyCount / enemyCap` drives a 1×–1.85× `fillFactor` that multiplies the *clamped* spawn interval (so a truly full field can stretch cadence past `intervalMax` without erasing the recovery vs nominal delta). Decays smoothly back as kills clear the field.
- **Recovery is now a 0..1 strength, not a binary.** `ProgressionDirector.recoveryStrength` lerps the wave-budget ceiling from 1.3 → 1.05 in `spawns.ts`. Boolean `recoveryMode` is preserved (threshold 0.4) for log prefixes and the early-break gate at `spawns.ts:102`.

**Archetypes** (2.4.0+). Every enemy carries an `archetype` field derived from `ENEMY_ARCHETYPE` in `balance.ts`, plus a `squadId` bucketed by `spawnTick / ENEMY_AI.squadBucketTicks` used for emergent group flanking. Target selection in `targeting.ts` (`pickEnemyTarget`) is archetype-aware:

- **direct** (mite, rusher, brute) — straight-line pursuit; prefer wounded or stationary workers; brute ignores crowding so it anchors through groups. Brutes also reuse a valid target for short `ENEMY_AI.tankTargetRefreshTicks` windows to prevent slow tank movement from jittering.
- **flanker** (raider, wisp) — aim at the worker's predicted position (`target + workerVelocity * ENEMY_AI.flankerLeadTicks`) with a tangent blend so the arrival arcs in; prefer isolated, unalert workers.
- **ambusher** (sapper) — approach at `ambusherApproachScale`; once inside `ambusherDashTrigger`, flip on `dashTicks` for a `ambusherDashDuration`-tick burst at `ambusherDashSpeedScale` (1.8×).
- **ghost** (phantom) — while cloaked, reposition behind the worker's movement vector by `ghostRepositionOffset` px so it uncloaks behind the victim.
- **skirmisher** (zapper) — keeps the existing hold-distance logic; picks targets with fewest nearby allies AND fewest nearby hostiles (avoid dogpiling).
- **driver** (leech) — existing home-district rush, unchanged.
- **infester** (corruptor, blight) — existing node-attach behaviour, unchanged.

Squadmates sharing a target spread across `ENEMY_AI.squadBearingBuckets` (6) bearing slices; each enemy prefers the bucket with fewest same-squad competitors, producing emergent flanking without an explicit coordinator.

**Multi-class targeting** (3.0.0 Step 4). Combat enemies can now pivot between workers, turrets, scouts, sentinels, and the city via `ENEMY_TARGET_PRIORITY[kind]` in `balance.ts` (shape `{ worker, turret, sentinel, scout, city }`). `pickEnemyTargetMulti` in `targeting.ts` scores each deployed/live class as `priority / (distance + 40)` and returns `{ kind, id, x, y }` — id is `null` for the city. Undeployed turret/scout/sentinel slots, rebooting scouts/sentinels, and corrupted/rebooting workers are not valid picks; broken-but-deployed turrets remain targetable. `stepEnemies` in `movement.ts` writes both `Enemy.targetKind` and `Enemy.targetId` so the rest of the sim can look up whatever the enemy is chasing. Archetype-specific refinements (flanker lead, ghost reposition, squad bearing spread) only run when `targetKind === "agent"`; non-worker targets use plain direct pursuit because structures don't have movement vectors. Corruptor / blight / leech keep zeroed priorities and their existing flows (corruption nodes / home-drain rush). Most kinds still strongly prefer workers, but a few specialize:

- **brute**: turret 0.85 / city 0.4 — pivots to the line when close.
- **sapper**: turret 1.2 (higher than workers) so it arcs toward defences to detonate.
- **rusher**: scout 0.9 — chases the softer mobile unit.
- **raider / wisp**: scout 0.7, city 0 (3.1.2 — was 0.3; city camping removed so early enemies idle when no workers are nearby).
- **phantom**: sentinel 0.6 — assassinates tanks.
- **zapper**: scout 0.8 — bolts scouts at range.

Contact damage against non-worker targets runs at the end of `stepCombat`: enemies with `targetKind ∈ {turret, scout, sentinel, city}` inside `ENEMY_CONTACT_RADIUS.<kind>` apply `ENEMY_CONTACT_DAMAGE[enemy.kind] * TARGET_ARMOR.<kindArmor>` through the existing `damageTurret / damageScout / damageSentinel / damageCity` funnels. Target-class armor (`turretArmor 0.55, scoutArmor 0.80, sentinelArmor 0.25, cityArmor 0.35`) means you tune per target type once instead of re-tuning every enemy's damage row.

**Warden** (`warden`): late-game infiltrator that spawns separately from the normal wave budget (see `stepWardenSpawn` above). Does not fight workers directly — instead it attaches to the nearest accessible worker and slowly corrupts them. Wardens that successfully corrupt a worker are removed from the enemy array without death rewards; wardens killed by combat units before attach completes do count toward `wardensKilled` and trigger the `warden_killed` achievement. Wardens have their own spawn timer (`state.timers.warden`) and are gated to `tier >= 4`. At most one warden is on the field at a time, and no new warden spawns while the fleet has ≤ 1 healthy worker remaining (active, not corrupted, not rebooting). **3.1.0**: wardens now carry `permanentCloak: true` and are treated as fully cloaked by every system that calls `isCloaked()` (sentinels, scouts, cloak-aware rendering). Kill credit still reaches `warden_killed` because worker retaliation during the attach attempt is not filtered by cloak — only unit target selection is.

**Corruptors** (`corruptor`, `blight`): never attack workers. Never target gold nodes. Prefer ore/gems/energy. Attach while corrupting and reduce economic output. Blight is the heavier variant with early scout resistance. Passive residue cleanup is deliberately slow as of 2.4.2 (`CORRUPTION.purgeBase = 0.12`, `purgePerArsenal = 0.025`) so corruption effects stay visible after corruptors detach; scout cleansing rates are the active cleanup path and should not be conflated with passive fade.

### Turrets

Static base defense. Target combat enemies only (never corruptors, never cloaked phantoms). Range and cooldown respond to event modifiers, but range is hard-clamped to `TURRET.rangeMax` (3.1.3) so event boosts cannot push turrets past missile silos. Carry a `disabledTicks` counter; while > 0 the turret skips targeting and firing entirely.

3.0.0 added a parallel sector-level gate: active turret count is now `max(1, min(turrets.length, 1 + min(upgrades.turret, TURRET_SLOTS_BY_LEVEL[level])))`, mirroring the worker-slot pattern. The first turret is always on, the 2nd unlocks at level 2, and the 3rd unlocks at level 8 even if the upgrade track is bought earlier. `derived.activeTurrets` folds both gates together; subsystems should read it from `computeDerived` rather than recomputing locally.

3.0.0 also gave turrets a structural HP pool so enemies can actually attrit them. `Turret.hp`/`maxHp` scale from `TURRET_HP` in `balance.ts` (`hpBase 120 + 20·turret + 10·shield`), and `stepTurrets` recomputes `maxHp` every tick and scales the current `hp` proportionally so mid-combat upgrades do not reset damage progress. Any code that deals damage to a turret must go through `damageTurret(state, turret, amount)` in `combat.ts` — mirroring the `damageEnemy` single-funnel pattern — which sets `damageTicks` for the hit flash and, on hp reaching 0, kicks `brokenTicks` to `TURRET_HP.brokenDurationTicks` (2400 ticks ≈ 80s) and bumps `state.stats.turretsBroken`. Broken turrets take no further damage, skip all targeting and firing, and restore to `maxHp * brokenRecoverRatio` (0.5) when the break timer expires. The renderer shows a cracked-chassis variant + HP bar when hp is below maxHp (and the bar is hidden while broken because the state is already communicated by the darker sprite).

**3.0.0 Step 5 — turrets always beam; missiles are silo-only.** Turrets no longer have a missile fallback. Every shot is an instant-hit beam within the turret's acquisition range. The `focusedBeam` upgrade extends that range by `FOCUSED_BEAM.rangePerLevel` (3.1.3 — 6 px/level, was 16) instead of switching fire modes. The old `FOCUSED_BEAM.baseRange` constant has been removed.

**3.1.3 — turret range invariant.** Turret range is hard-clamped to `TURRET.rangeMax` (270 px on a 1000 px field) regardless of upgrade stacking or `eventModifiers.turretRangeScale`. Combined with the new `MISSILE_SILO.rangePerLevel` scaling (silo range = 400 + 6 × `missileLauncher`), turrets are guaranteed to always sit well below missile silos in reach. Damage and cooldown were nudged up (`damagePerTurret` 4 → 5, `cooldownPerTurret` 1.4 → 1.7) to compensate for the smaller footprint. Turrets are a tight perimeter weapon; silos are the long-range answer.

### Missile Silos

`MissileSilo` entities (deployed via the `missileLauncher` upgrade track) are separate from turrets. Silo count scales with upgrade level via `MISSILE_SILO.silosByLevel` (1 at L1, 2 at L3, 3 at L5, 4 at L10). Each active silo fires once per `fireIntervalTicks` (480 ≈ 16s) at the highest-priority combat enemy within `rangeBase + level * rangePerLevel` (3.1.3 — 400 + 6 × level, scaling so silos pull further ahead of the clamped turret range as the player invests) — brutes first, then leeches, then everything else, wounded within tier. Target selection is a single-pass best scan, not a sort. Damage is `damageBase (48) + damagePerLevel (12) * level`.

Silo missiles differ from the old turret missiles: they use `MISSILE_SILO.missileSpeed` (4.0 vs 3.5), `missileSteering` (0.12 vs 0.18), and `missileMaxLife` (180 vs 90). These are stored on the `Projectile` as `speed` (already existed) and `steering` (new field added in Step 5); `stepProjectiles` reads `p.steering ?? TURRET.missileSteering` so turret beams (no steering field) are unaffected.

`stepMissileSilos` runs in `advanceGame` after `stepSentinels` and before `stepZapperFire`. Autobuy adds `missileLauncher` to the candidate pool after `turret >= 2`, with an emergency gate that fast-tracks L1 when brutes or leeches are active. Renderer: chunky orange pylons in `FieldSvg.tsx` with a cooldown charge bar; the range ring is shown at low opacity when the silo is active; a brief launch flash fires when a shot exits.

### Enemy Shield System

Three enemy kinds carry a regenerating shield layer that sits on top of their normal HP pool: `leech` (50 HP shield), `phantom` (10 HP shield), `zapper` (20 HP shield). Shield amounts are declared once in `ENEMY_SHIELD.shieldMax` in `balance.ts`.

Fields on `Enemy` (all optional — `undefined` means "no shield mechanic"): `shield`, `shieldMax`, `shieldRegenCooldown`. `spawnEnemy()` in `factories.ts` sets all three for enemies whose kind is in `ENEMY_SHIELD.shieldMax`; migration populates them with full-shield defaults for existing saves.

**Damage routing**: all hostile damage paths (turret missile/beam, sentinel shot, scout shot) now go through `damageEnemy(enemy, amount)` in `enemyUtils.ts` rather than subtracting from `enemy.hp` directly. `damageEnemy` deducts from the shield first, does not spill overflow into HP in the same hit, and resets `shieldRegenCooldown` to `ENEMY_SHIELD.regenDelayTicks` (90). Any new damage source must use this helper, not raw `enemy.hp -=`.

**Turret missile behavior**: homing missiles steer only toward their original live target. Launched missiles have a small terminal grace radius (`missileGraceRadius`) so a shot that arrives just behind a moving target can still connect. If the original target dies right before impact, a missile close to that enemy's death-fade position can resolve there and disappear without dealing splash. Missiles still never retarget; if the original target cloaks, disappears, or dies outside corpse grace, the missile fizzles.

**Regeneration**: `stepEnemyShields()` runs after `stepZapperFire()` and before `resolveEnemyDeaths()`. While `shieldRegenCooldown > 0` it decrements by 1; otherwise, if `shield < shieldMax`, shield recovers by `ENEMY_SHIELD.regenRatePerTick` (0.25). Dying enemies (`hp <= 0`) skip regen.

**Render**: `FieldSvg.tsx` computes `hasShield`, `shieldPct`, and pulsing state once per enemy and injects a dashed cyan ring + soft glow + thin shield bar stacked above the HP bar into the render blocks for shielded kinds. Because leech and phantom share the fallback render block, the shield overlay is embedded there too.

**Sentinel kill credit**: `sentinels.ts` credits only HP-lethal sentinel hits after shield routing. Because shield overflow does not spill into HP, any target with positive shield remaining before the shot is treated as non-lethal for sentinel-kill achievements; once shield is gone, the normal `target.hp - damage <= 0` check applies.

### Disable System

Workers, turrets, scouts, and sentinels all carry `disabledTicks: number`. While > 0, the entity is inert (worker task becomes `"Disabled"`, turret skips its fire path, scouts/sentinels early-return from their step) and the counter decrements each tick. Source today: zapper-bolt impact (sets `ZAPPER.disableDurationTicks = 210`). Worker reboot clears `disabledTicks`. `stepZapperFire` picks the nearest eligible target across all four classes within `ZAPPER.firingRange` — scout/sentinel picks respect `rebootTicks > 0` (already-downed units are skipped). Renderer shows disabled entities greyscale with a pulsing orange ring.

### Scouts

Dedicated anti-corruption units. Priority: live corruptors → corrupted nodes → patrol home. Not mobile turrets. Corruptor targeting (2.4.0+) is rate-weighted — a corruptor's per-tick corruption rate (blights score higher than regular corruptors) is multiplied by the attached node's current corruption level, so a blight on a 95%-corrupt node outranks a fresh corruptor. Node cleansing alternates between a **finish-job bias** (nodes within `SCOUT_AI.finishNodeThreshold` of cleanse) and a **stop-bleed bias** (nodes with `corruptedBy != null`) based on which pile is larger. **Pair-up** routes the second live scout onto any node over `SCOUT_AI.pairUpCorruptionThreshold` once at least `SCOUT_AI.pairUpScoutCount` scouts are live, so multi-scout synergy fires on the worst nodes automatically. Four physical scout slots in state; activation gated by upgrade level.

3.0.0 gave scouts structural HP, a retreat state, and a reboot lifecycle. `Scout.hp`/`maxHp` scale from `SCOUT_HP` in `balance.ts` (`hpBase 45 + 5·scout + 5·arsenal`). All incoming damage routes through `damageScout(state, scout, amount)` in `combat.ts`; damage while rebooting is a no-op. When `hp < maxHp * retreatHpRatio` (0.5) the scout enters `retreating = true`, drops its current target, and sprints home at `retreatSpeedScale` (1.3×). While within `homeHealRadius` (40px) of the home pad the scout heals `healRatePerTick` (0.25 HP/tick); retreat exits at `exitRetreatHpRatio` (0.9). Non-retreating scouts near the pad also heal at half that rate so light chip damage tops up between sweeps. When `hp` hits 0 the scout is destroyed, `rebootTicks` kicks to `rebootDurationTicks` (600), and the scout is parked at home; on the tick the counter hits 0 the scout respawns at full HP. The renderer hides scouts while rebooting, shows a warm-tinted hull + damage flash while retreating, and draws an HP bar once HP drops below max.

### Sentinels

Heavy late-game ground mechs. Target priority weights the threat's distance to its nearest worker (not just distance to the sentinel) plus a priority bonus for `leech > brute > sapper > general combat`. A brute near a worker outranks a closer brute drifting alone. Active sentinels move to an **intercept point** between the threat and the worker the threat is targeting (lerp factor `SENTINEL_AI.interceptLerp`, predicting worker position forward by `interceptLeadTicks`) so they feel like bodyguards rather than chasers. Patrol position blends `homeX` with the active-worker centroid so off-center late-game deployments still get cover. Two physical sentinel slots; activation gated by upgrade level.

3.0.0 gave sentinels the same HP/retreat/reboot shape as scouts (Step 3b) but tuned for the tankier role. `Sentinel.hp`/`maxHp` scale from `SENTINEL_HP` in `balance.ts` (`hpBase 220 + 40·sentinel + 10·shield`). All incoming damage routes through `damageSentinel(state, sentinel, amount)` in `combat.ts`; damage while rebooting is a no-op. Retreat engages below 35% HP (tankier than scouts) and exits at 90%. Healing on the home pad ticks at `healRatePerTick` (0.6/tick — faster recovery than scouts since sentinels take worse hits). On death the sentinel reboots for `rebootDurationTicks` (1200) — about 40s — and respawns at full HP. The renderer hides sentinels while rebooting, tints the chassis warmer while retreating, and draws an HP bar when HP is below max.

3.0.0 Step 7 extended sentinels with **corrupted-worker cleanse** duty. Before checking for enemy targets, each sentinel calls `pickCleanseTarget()` to find the nearest visible corrupted worker (`dist <= WARDEN.corruptionVisionRadius` or `spottedTicks > 0`). While a cleanse target exists, the sentinel repositions toward it, sets `task = "Cleansing"`, and fires a purple projectile beam on its normal cooldown. Cleanse damage is the standard sentinel `damageBase + sentinel * damagePerSentinel`. On the killing shot: corruption is purged, the worker enters reboot, and flux + cores are awarded. Cleanse targeting takes full priority over combat targeting so sentinels always address infested workers first.

### Mining

Workers harvest assigned nodes with kind-specific behavior and crit chances. Corrupted nodes yield less. Foundry upgrades increase yield and respawn speed. Temporary cache nodes disappear on exhaustion instead of respawning. Recently worked, partially mined nodes use `workTicks` to render a fading mined-progress ghost segment and deterministic particles over the missing health-bar span; this is presentation only and must never restore `ResourceNode.hp` or regenerate resources.

### Entity Spawn / Death Animation

Nodes, enemies, and agents all fade in and out rather than popping. Three fields drive this entirely in the renderer (`FieldSvg.tsx`) — no presentation logic leaks into the sim:

- **`spawnTick: number`** on `ResourceNode`, `Enemy`, and `Agent` — the `timers.tick` value when the entity entered the field. Set in `makeNode`, `respawnNode`, `makeWorker`, `spawnEnemy`, and in `movement.ts` when a worker's reboot countdown reaches 0 (3.1.2 — was in `combat.ts` at the old instant-respawn path). Migration fallback `?? 0` disables fade for loaded saves (avoids a flash-of-invisible on load).
- **`dyingTicks: number`** on `Enemy` — counts from `DEATH_FADE_TICKS` (18) down to 0 after `hp` hits 0. While `dyingTicks > 0`, the enemy stays in `state.enemies` but is skipped by movement, targeting, and combat (all those paths already guarded on `hp > 0`). Removed from state once `dyingTicks` reaches 0.
- Temporary nodes use their existing `despawnAt` field for a fade-out warning: `despawnAlpha` begins fading 60 ticks before the deadline.

`resolveEnemyDeaths` (in `combat.ts`) owns the `dyingTicks` lifecycle: it sets the countdown on newly killed enemies, ticks it down for already-dying ones, and filters the array. Order matters — the countdown is set _before_ the filter runs so newly killed enemies are not immediately removed.

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

Two event layers: ambient flavor log chatter (original), and seeded mechanical events (30–90 second timer). Mechanical events write into `state.activeEvents`, push multipliers into `state.eventModifiers`, and render inspectable HUD surfaces in the footer. Timed cards show countdowns; one-shot cards intentionally do not, and instead fade during their linger window. Night (day/night cycle) slightly biases toward harsher events.

Each `EventDef` in `src/game/events/eventDefs.ts` carries presentational metadata alongside its mechanical `apply` / `revert`: `flavor` (short narrative line), `tone` (`boon` / `threat` / `mixed` / `neutral` — drives chip colour), `effects: { text, tone }[]` (per-line breakdown shown in the tooltip), and `hudDurationTicks` (HUD linger duration, separate from mechanical `durationTicks`). Keep these in sync when tuning an event's mechanics — the tooltip/card is the player's only source of truth for what the event actually does.

`durationTicks` and `hudDurationTicks` are deliberately separate:

- Timed modifier events set both and expire with `revertOnExpire: true`.
- The 3 one-shot events (`cache_discovery`, `pirate_caravan`, `echo_signal`) keep `durationTicks = 0` but now set `hudDurationTicks ≈ 10s`, so they still surface as inspectable cards and short-lived backdrop effects.
- `EventChip` click counts as inspection via `inspectEventTag()`; hover/focus tooltip alone must never mark an event as inspected.

Two presentational layers consume that metadata:

- `EventBackdrop` renders a distinct ambient effect per active event id (color wash + particles + blurs). Effects compose additively when multiple events are active. The component now keys off event ids rather than per-tick countdown state so long-running events do not rerender the full overlay every sim tick.
- `EventChip` renders the HUD pill/card with hover/focus tooltip. Timed events keep the compact pill treatment and visible countdowns; one-shot events now use that same compact footprint, but with no counter and a fade-out over their linger window. Chips never shrink-wrap into multi-line pills under heavy load; the footer lane is expected to scroll instead. Once clicked, a card only dims its existing leading marker dot to show inspection state, while the active click feedback is a brief ripple centered on that dot. Tone colours are centralized in a `TONE_STYLE` map inside the component.

`getEventDef(id)` is exported from `eventDefs.ts` for presentational lookups — never mutate the returned def.

### Autobuy

Weighted upgrade prioritization with emergency paths (e.g. buy sentinel if 2+ brutes alive). Reads final resource totals after income and combat rewards. Multi-resource cost shapes are supported.

### Prestige

Auto-triggers when the colony is rich, stable, and clear enough. Combo bonus stacks with Archive upgrades.

### City / Home District

The home district skyline evolves with progression and upgrade investment. Mature colonies attract a wandering tourist drone after 15+ real-time minutes at city stage 5. The tourist now tracks `passId`, `lastClickedPassId`, and `squishTicks` so repeated clicks can count toward separate-pass and total-click secrets without letting one pass spam the pass counter. Its click feedback is intentionally just the squish animation now; the old oversized white click/focus outline is suppressed in `FieldSvg.tsx`.

3.0.0 gave the home district a real HP pool on `state.city` (`hp`, `maxHp`, `damageTicks`, `lastHostileTick`). `CityState` starts at `CITY_HP.hpBase` (1000) and takes damage through the `damageCity(state, amount)` funnel in `combat.ts`; each damage call also stamps `lastHostileTick`. `stepCity` (in `economy.ts`, wired into `advanceGame` right after `stepEconomy`) ticks the damage flash down, refreshes `lastHostileTick` whenever any combat enemy sits within `CITY_HP.hostileRadius` of the home center (500, 540), and heals `regenPerTick` per tick once it has been quiet for at least `regenIdleTicks` (180 ticks ≈ 6s) — so ongoing sieges cannot heal through themselves. Selectors expose `cityIntegrity = hp / maxHp` and use it to modulate energy production: `rates.energy *= energyMinRatio + (1 - energyMinRatio) * cityIntegrity`. At full HP energy runs at 100%; at 0 HP it floors at `energyMinRatio` (0.25). The renderer draws a red flash wash over the home band while `damageTicks > 0` and a slim HP bar above the district whenever HP is below max. Enemy→city contact damage funnels through `damageCity` as part of Step 4's non-worker contact loop in `stepCombat`, gated on `enemy.targetKind === "city"` and `ENEMY_CONTACT_RADIUS.city` proximity, scaled by `TARGET_ARMOR.cityArmor` (0.35).

### Persistence And Idle UX

Autosaves to localStorage every 30 seconds. Saves carry `schemaVersion: 9` (current); schema 6 existed only during 3.0.0 branch testing and uses the same defensive field-presence fallback path as older saves. `migrateGameState()` handles older saves by stamping current schema on load and backfilling the newer interaction fields: `stats.eventTagsInspected`, `stats.touristClicks`, `stats.touristPassesClicked`, `touristWorker.passId`, `touristWorker.lastClickedPassId`, `touristWorker.squishTicks`, `lostDrone`, `activeEvents[].revertOnExpire`, plus 3.0.0 Step 4's `Enemy.targetKind` (defaults to `"agent"`). Existing saves with 3 agents still get `active: true` defaulted on migration. Hidden tabs pause the accumulator — no catch-up burst on refocus. `localStorage["nexusDriftSave"]` is the active save slot.

The app shell separately polls `/version` about every 5 minutes (and when the tab regains focus), extracts a flat semver from the response body, and compares it to `CURRENT_VERSION`. When the live version is newer, `App.tsx` shows a banner with `Refresh`, `Close`, and session-only `Don't Show Again`. The ignore state is intentionally ephemeral and is not part of save data or localStorage migration. The hidden admin panel also has a `Show Update Banner` action that forces the same banner path open using a preview patch version, so QA can exercise the refresh/dismiss controls without waiting for a deploy.

### Achievements

58 achievements across 4 rarity tiers (`common` / `uncommon` / `rare` / `legendary`) and 6 categories (`combat`, `corruption`, `mining`, `progression`, `survival`, `secret`). `AchievementDef` now carries `rarity`, `category`, and an optional `hidden` flag. Hidden locked achievements display as "???" placeholders in the modal until revealed.

Categories and examples:

- **Progression** — level milestones (10/20/30/50/75), prestige stacking (1/3/5), threat tiers (5/8/10), all-upgrades-at-1 and all-at-5, foundry/archive max, cores/flux accumulation
- **Combat** — kill counts (10/100/500/1000), brutes (10/25), phantoms (5), leeches (3), sappers (10), first sentinel kill, turret level 8
- **Mining** — first crit, 25/100 crits, mined 1k/10k resources, gold hoard (5k), gem collector (200)
- **Corruption** — first purge, 50/200 purges, pristine (corruptors present + zero corrupted nodes), triple rot (3+ simultaneously), full spectrum (all three types), first sentinel cleanse (`purify_first`), warden killed before attach completes (`warden_killed`), 5 cleanses in one run (`quarantine`), 3+ workers corrupted for 30 continuous seconds (`void_outbreak` — legendary)
- **Survival** — 15m/30m/1h/2h/4h/8h/24h runtime, colony health 95% under pressure, every active worker full HP while hostiles are present
- **Secret** — drift easter egg, click-spotted tourist drone, multi-pass tourist secrets, broken lost-drone recovery, synthwave Konami, all 12 events experienced, all 12 event cards inspected, anomaly witness, projectile/corpse clicks, changelog/modal opens, manual override

New stats tracked on `GameState.stats`: `phantomsKilled`, `leechesKilled`, `sappersKilled`, `wardensKilled`, `sentinelKills`, `corruptedPurified`, `corruptedWorkerOutbreakTicks`, and `turretsBroken`. `wardensKilled` increments in `resolveEnemyDeaths()` only when a warden is killed before attaching; successful attachment removes the warden without kill credit. `sentinelKills` is credited only when a sentinel lands the lethal hit; do not infer it later from target selection or corpse cleanup. Migration adds `?? 0` fallbacks for all of these counters.

`state.stats.purges` counts completed node cleanses only. It increments in `stepScouts()` when a node crosses back under the corruption threshold and must not be incremented for corruptor or blight deaths.

Interaction-driven achievement helpers now live in `src/game/achievements.ts` and own the shell/renderer mutation points: `inspectEventTag`, `spotTourist`, `recoverLostDrone`, `witnessAnomaly`, `clickProjectile`, `clickDyingEnemy`, `recordAchievementsOpen`, `recordChangelogOpen`, and `completeManualOverride`. Keep those helpers authoritative — `App.tsx` and `FieldSvg.tsx` should forward interaction intent into them, not inline achievement state mutations.

`AchievementsModal` (`src/components/AchievementsModal.tsx`) replaces the inline modal in `App.tsx`. Features: category tab bar with per-tab unlock counts, rarity-coloured rows and badges, hidden-achievement masking toggle (eye icon), completion progress bar, and a rarity legend footer.

The achievement ribbon in the field card now uses rarity-coded border/background colours instead of flat indigo. An unlock count badge (e.g. `3/54`) appears at the right end of the strip. Opening the ribbon can itself unlock `archivist` once any hidden secret is already revealed.
The ribbon renders newest unlocks first by reversing the unlocked id list at render time, so fresh badges appear on the left edge and push older ones rightward instead of being appended off to the far right.
Each ribbon badge is now its own button: clicking one opens `AchievementsModal`, switches to the matching category, scrolls the corresponding row into view, focuses it, and plays a brief pulsing cyan highlight that fades back to transparent at the end so the player lands on the right achievement immediately without a lingering static halo. The pulse is implemented in `src/index.css` as presentation-only animation and is disabled under `prefers-reduced-motion`.

Late-game gotcha: the visible director tier is capped at 5 (`Settling` → `Cataclysm`). Any legacy “tier 8/9/10” style unlock or spawn gate must key off `derived.progression.score / PROGRESSION.tiersPerScore`, not the capped `derived.progression.tier`. `stepAchievements()` and the lost-drone event roll now follow that rule.

3.0.0 added wallpaper-range runtime milestones on top of the existing set: `survived_4h`, `survived_8h`, `survived_24h` (uncommon → legendary). Long-session play now earns explicit recognition instead of topping out at the 2h mark. Sector-level milestones also extend past the original cap with `level_50` and `level_75` so the stretched XP curve has proportional achievement anchors.

### Easter Eggs

- Konami code toggles synthwave palette, logs a message, and unlocks the hidden `synthwave` achievement.
- Typing `drift` anywhere logs "The drift remembers." and unlocks an achievement.
- Tourist drone wanders the field after 15 real-time minutes at city stage 5; click it to unlock `Taking Notes`, keep clicking it across 3 separate passes for `Tour Guide`, and mash it 50 times in one run for the legendary click-total secret.
- While 3 event cards overlap, a dedicated anomaly artifact appears in the field. Clicking it is now the only way to unlock the repurposed `event_streak` secret (`Anomaly Witness`).
- A damaged lost drone can drift through the outer zone on late-game big-event rolls (score threshold equivalent to old tier 9+). Click it to recover the unit and permanently add an extra drone beyond the normal 9-slot roster.
- Zapper bolts, in-flight turret missiles, and death-fading corpses are all valid click targets for hidden secrets.
- Admin console: press `Space` five times with page focus, **or** tap the version badge (e.g. `v3.0.2`) five times within 2 s on mobile. Admin mode extends the existing header speed selector with 10×, 20×, and 100× options, and opens a console with diagnostics, quick setup actions, shell toggles, a vertically-wrapping event-trigger section, and a command terminal. The top-center chevron collapses/expands the panel with an animated grow/shrink; the close (×) button dismisses it entirely.

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
- Header version badge click records the hidden `release_reader` achievement.
- Top project chrome also carries a GitLab source link beside the version badge.
- Public speed presets (1×/2×/4×) are in the main UI. Admin mode (5× Space) extends that same selector with 10×/20×/100× rather than rendering a second admin speed row. Hidden `manual_override` is specifically `1x -> 4x -> 1x` with 10–60 seconds between the 4x and 1x clicks and no other speed click in between.
- `useGameLoop()` caps catch-up work at 180 simulation ticks per animation frame so admin 100× mode can fast-forward aggressively without one delayed frame attempting an unbounded backlog.
- Admin commands live in `src/game/adminCommands.ts`; keep new commands routed through existing helpers (`spawnEnemy`, `activateEvent`, `pushLog`, structural damage funnels when damage commands are added) and return app-shell effects for non-`GameState` actions such as speed or update-banner preview. Do not persist terminal history unless the save-state migration checklist is followed.
- Sector card, resource bar, and sidebar intentionally read the throttled `uiGame` / `uiDerived` snapshot. The field SVG and field-card live indicators still read the per-tick snapshot.
- Favicon assets now live across `public/nexus-drift.svg`, `public/nexus-drift.png`, `public/favicon.ico`, `public/favicon-32x32.png`, `public/favicon-16x16.png`, `public/apple-touch-icon.png`, and `public/site.webmanifest`. Social embeds intentionally remain pointed at `public/og-image.png`; do not swap embed art when only the favicon changes.
- ESLint intentionally ignores `.claude/` so local agent configuration and auxiliary worktrees do not create parser-root conflicts during `npm run lint`.
- `.gitlab-ci.yml` verify stage runs `lint` in addition to `typecheck` + `test` as of 3.1.0 — do not drop the lint step when editing the file.
- Deferred follow-ups for 3.2.0+ are listed in the README "Known Deferred Work" section with matching `TODO(3.2.0)` comments in-source. Do not silently close these out as trivia — each has its own reason it was left for a later release.
- Coarse-pointer `lg` desktop layouts (notably iPadOS landscape Safari) intentionally run a lower-cost presentation path in `Background`, `EventBackdrop`, and `FieldSvg`. Preserve the same art direction there, but gate new expensive particles, long blur animations, and SVG filters behind `useLowFxMode`.
- `package.json` version and `src/changelog.ts` must stay in sync for every release.
- Unless the user explicitly asks for a new release boundary, assume follow-up polish work belongs to the same current release line and expand that changelog entry instead of bumping again.
- When releasing, also update `README.md` and this file if architecture or player-facing behavior changed.
- ESLint `no-explicit-any` is set to `error` — any `any` will fail the build.
- 163 tests across `src/game/__tests__/advanceGame.test.ts`, `src/game/__tests__/interactionAchievements.test.ts`, `src/game/__tests__/aiBehavior.test.ts`, `src/game/__tests__/adminCommands.test.ts`, and `src/lib/versionCheck.test.ts` cover simulation invariants, interaction achievements, late-game worker-slot gating, worker unlock resource costs, event HUD linger behavior, AI behavior and archetype targeting, flee-direction worker retargeting, crowded-node avoidance, missile grace behavior, corruption linger, surround-pressure combat, live-version polling helpers, admin preview-version generation, manual-override timing, save/load round-trips, multi-class enemy target eligibility, worker corruption + sentinel cleanse (Step 7), warden permanent cloak + save migration, city regen post-wrap, `hostileKills` vs `totalEnemiesKilled` split, `damageEnemy` shield cooldown arming, and admin command mutation/shell-effect paths.

## Remaining Work

### High Priority

- Long-duration soak testing (30+ minutes at 1×) to confirm no memory leaks or FPS degradation at late game.
- Verify Docker image serving and GitLab registry flow end-to-end.

### Medium Priority

- Richer admin terminal commands for timer forcing, paid/free upgrade purchase checks, and damage-funnel drills.
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
