# Nexus Drift Handoff

## Overview

Nexus Drift is a React + TypeScript + Vite app that runs an ambient autonomous colony sim entirely in the browser. The original single-file artifact is preserved at `reference/idle_wallpaper_game.reference.jsx`; the maintainable app lives under `src/`.

Current version: **2.4.5**. The in-game changelog is at `src/changelog.ts` and opens via the version badge in the header. As of 2.0.0 the project dropped its leading `0.` prefix from all historical versions — the first release is now `0.1.0` (was `0.0.1`), and the "Living Field" milestone is `2.0.0` (was `0.2.0`).

## Core Architecture

- `advanceGame(prev)` is the single simulation orchestrator. It clones state, advances timers, runs each subsystem in a fixed order, and returns the new state.
- The subsystem execution order inside `advanceGame.ts` is load-bearing and is fully documented with per-step rationale in that file. Do not reshuffle without reading those comments.
- Simulation logic is split across focused modules in `src/game/subsystems/`.
- `GameState` carries a seeded `Rng` instance and `citySeed`, so simulation randomness is deterministic once a run starts. All gameplay randomness must flow through the seeded `Rng`, never `Math.random()`.
- Save files carry a `schemaVersion` field (currently `5`). `migrateGameState()` always stamps the current version on load and handles older saves gracefully. The `SCHEMA_VERSION` constant lives in `factories.ts`. v5 added AI fields: `ResourceNode.workTicks`, `Agent.threatMemory`, `Enemy.archetype`, `Enemy.squadId`, optional `Enemy.dashTicks` — all populated with `?? default` fallbacks during migration.
- Presentation-only calculations live in `selectors.ts` and are exposed to React as derived state. Do not put derived calculations inside subsystems.
- React rendering sits on top of the sim via `useGameLoop()`: `requestAnimationFrame` + fixed-tick accumulator, pauses on hidden tabs, autosaves every 30 seconds, and publishes a live field snapshot plus a short-throttled UI snapshot (`125ms`) so sidebar/chrome rendering is not locked to the full sim cadence.

## Project Structure

- `src/App.tsx` — top-level layout, save bootstrap, speed presets, achievement UI, easter-egg listeners, admin panel, and release-history modal
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
- `src/components/Sidebar.tsx` — economy, automation, and threat panels
- `src/components/HudPrimitives.tsx` — shared HUD widgets (StatusBadge, ResourcePill, StatTile, UpgradeTile)
- `src/components/ui/` — local card and progress bar primitives
- `src/lib/versionCheck.ts` — version parsing/comparison helper plus the `/version` fetch wrapper used by `useVersionCheck`
- `src/hooks/useGameLoop.ts` — rAF-driven simulation loop, pause-on-hidden, autosave, direct state mutation hook for admin controls, and a throttled `uiGame` / `uiDerived` snapshot for scroll-heavy chrome surfaces
- `src/game/advanceGame.ts` — thin orchestrator over subsystem steps; execution order documented inline
- `src/game/achievements.ts` — achievement definitions, unlock helper, and the explicit `spotTourist()` secret trigger used by the UI click path
- `src/game/persistence.ts` — localStorage save/load with `schemaVersion`-aware migration
- `src/game/factories.ts` — initial state, entity construction, `SCHEMA_VERSION`, `migrateGameState`
- `src/game/selectors.ts` — UI-facing derived state
- `src/game/balance.ts` — single source of truth for all tuning constants
- `src/game/rng.ts` — deterministic Mulberry32 PRNG
- `src/game/targeting.ts` — shared targeting helpers
- `src/game/events/eventDefs.ts` — seeded random-event definitions and activation helper
- `src/game/subsystems/` — economy, spawns, movement, workers (slot activation), corruption, turrets, scouts, sentinels, combat, mining, autobuy, projectiles, events, achievements
- `src/game/__tests__/advanceGame.test.ts` — 52 tests: simulation invariants, subsystem behavior, achievement edge cases, projectile behavior, corruption linger, worker-slot gating/costs, surround-pressure combat, and save/load round-trip
- `src/game/__tests__/interactionAchievements.test.ts` — 10 tests: explicit interaction-driven achievement paths, event HUD linger, anomaly gating, migration of newer interaction fields, and manual-override timing
- `src/game/__tests__/aiBehavior.test.ts` — 23 tests: worker path safety, commitment, flee-direction retargeting, and crowded-node avoidance, archetype targeting, brute target stability, squad bucketing, sentinel intercept priority, scout finish-bias, sticky retarget threshold, ambusher dash trigger/duration, ghost reposition window, group dispersal, save migration, and threat-field path weighting
- `src/lib/versionCheck.test.ts` — 7 tests: flat-version parsing, preview-version generation, semver comparison, and `/version` fetch handling for plain text and JSON payloads
- `.gitlab-ci.yml` — verify and container-build pipeline. Automatic release image builds only run on `main` and `dev`; each publishes the commit SHA, `:latest`, and the exact `package.json` version tag, with `dev` also retaining the `:dev` channel tag. The build preflights the GitLab container registry and fails if that version tag already exists, preventing accidental duplicate-version pushes from moving an existing release tag.
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

Kinds: `miner`, `runner`, `drone`. Each kind has **3 slots** (9 agents total). Slot 0 starts active. Extra slots are now intentionally late-game: the relevant upgrade track still has to reach its slot thresholds (level 3 for slot 1, level 6 for slot 2), but the colony must also hit **sector level 12** before the second unit deploys and **sector level 24** before the third unit deploys. Those two slot-unlock purchases now also add `flux` + `cores` costs on top of the normal gold price. The `active: boolean` field on `Agent` controls this — inactive agents are skipped by all sim logic and hidden in the renderer.

`WORKER_SLOTS_BY_UPGRADE` in `balance.ts` maps upgrade level → slot eligibility, `WORKER_SLOTS_BY_LEVEL` maps sector level → late-game slot eligibility, and `WORKER_SLOT_UNLOCK_RESOURCE_COSTS` adds the flux/core surcharge for the level-3 and level-6 worker-track purchases. `stepWorkerSlots()` in `subsystems/workers.ts` reconciles active flags against the minimum of the upgrade gate and the level gate each tick (called after `stepEconomy`, before `stepSpawns`).

Workers pick targets autonomously via a scored target-selection function in `src/game/ai/workerTargeting.ts` (`chooseWorkerTarget` / `scoreWorkerNode`). Scoring factors in distance, kind preference, path threat (sampled at start/midpoint/destination via `threatAlongPath`), explicit close-enemy count around the node (`nodeThreatRadius` / `nodeThreatCrowdPenalty`), corruption tolerance (non-miners hard-avoid heavily corrupted nodes), node progress (`workTicks` bonus for nodes actively being mined), a current-target finish bonus for partially mined nodes, a contested-by-evading-workers penalty (quadratic — third worker on a node is a strong deterrent), and a **region-distance penalty** that biases each kind toward its preferred field sector. Worker targeting filters to live enemies before scoring, so death-fade enemies stay visual-only and cannot affect path threat, node crowding, or flee-direction retargeting.

**Worker personalities and territories** (`WORKER_PERSONALITY`, `WORKER_REGIONS` in `balance.ts`):

- **Miner** — left sector (cx 200, cy 250), brave (`pathFearScale 0.60`), pushes through moderate threats.
- **Runner** — mid-field (cx 500, cy 280), moderate courage, loose territory.
- **Drone** — right sector (cx 780, cy 240), cautious (`pathFearScale 1.30`), takes safer routes.

Each kind has a `groupRepelRadius` and `groupRepelMinCount`; when that many same-kind peers are nearby, a centroid-repulsion force (scaled with crowd size) disperses the cluster. Applied after the per-frame separation pass in `movement.ts`.

When `hp < maxHp * 0.5` (hurt but not yet in full recovery), workers nudge toward their region center each tick (`lowHpPull`) instead of all converging on the home pad.

Evasion direction blends 70% old heading / 30% new signal (smooth curves). As of 2.4.2, workers are intentionally less proactive about distant threats: enter radius is 62 px, exit radius is 104 px, evasion persistence is 52 ticks, and `WORKER_AI.pathSafetyPenalty` is 34. Workers at their node use a tighter `harvestingEvasionRadius` (42 px) so they finish a harvest under mild pressure. As of 2.4.3, harvesting workers ignore one or two nearby enemies until `damageTicks` shows actual damage; three or more nearby enemies still force early evasion. As of 2.4.4, close-combat pressure also scales up when multiple attackers are already in contact, so a real surround hurts harder instead of letting a worker slip out. Sticky retarget threshold is 0.64, meaning a candidate must be much better before it unseats the current assignment; partially mined current nodes also get `currentTargetProgressBonus`. Workers in persistent evasion with no immediate threat periodically call `chooseFleeDirectionTarget()` to look for a safe node ahead along `evadeDx/evadeDy`; candidates behind the worker, outside the flee lane, too far ahead, or behind a high-threat path are rejected. Each worker carries `threatMemory` (EMA of local enemy threat) to drive the regroup trigger. Workers recover from damage, reboot from home pads on destruction, and accumulate veteran ranks (kills nearby → speed bonus + visual chevron).

Worker movement now treats live enemy bodies as physical obstacles. `stepWorkers()` samples `WORKER_BLOCKING` radii from `balance.ts` and slows workers that are moving through crowded hostile lanes. The layer is intentionally slowdown-only: it must not apply a hidden knockback force that shoves workers away from nearby enemies. Dying enemies (`hp <= 0`) do not block movement; only live hostile bodies participate. `Agent.tx` / `Agent.ty` are destination/render anchors, not authoritative velocity. If resources or a future moving-node type ever move during the sim tick, update node positions before worker movement/blocking and derive velocity-sensitive behavior from actual `x/y` deltas.

### Enemies

**Combat** (`mite`, `raider`, `wisp`, `rusher`, `brute`, `sapper`, `leech`, `phantom`, `zapper`): pursue workers, apply pressure, targeted by turrets. Phantoms cycle cloak and disappear from turret targeting while hidden. Sappers detonate near workers. Brutes and phantoms yield Core fragments on death. Zappers (tier 7+) hold at firing range and fire energy bolts (`tag: "zapper-bolt"`) that disable the struck target for 210 ticks (~7s); disabled workers freeze with task `"Disabled"` and disabled turrets skip firing. **Leeches (tier 6+) bypass worker targeting entirely and drive directly for the home district** to activate their gold/energy drain — their movement goal is a hardcoded home anchor (`HOME_DISTRICT_X = 500`, `HOME_DISTRICT_Y = 490`) in `movement.ts`.

**Archetypes** (2.4.0+). Every enemy carries an `archetype` field derived from `ENEMY_ARCHETYPE` in `balance.ts`, plus a `squadId` bucketed by `spawnTick / ENEMY_AI.squadBucketTicks` used for emergent group flanking. Target selection in `targeting.ts` (`pickEnemyTarget`) is archetype-aware:

- **direct** (mite, rusher, brute) — straight-line pursuit; prefer wounded or stationary workers; brute ignores crowding so it anchors through groups. Brutes also reuse a valid target for short `ENEMY_AI.tankTargetRefreshTicks` windows to prevent slow tank movement from jittering.
- **flanker** (raider, wisp) — aim at the worker's predicted position (`target + workerVelocity * ENEMY_AI.flankerLeadTicks`) with a tangent blend so the arrival arcs in; prefer isolated, unalert workers.
- **ambusher** (sapper) — approach at `ambusherApproachScale`; once inside `ambusherDashTrigger`, flip on `dashTicks` for a `ambusherDashDuration`-tick burst at `ambusherDashSpeedScale` (1.8×).
- **ghost** (phantom) — while cloaked, reposition behind the worker's movement vector by `ghostRepositionOffset` px so it uncloaks behind the victim.
- **skirmisher** (zapper) — keeps the existing hold-distance logic; picks targets with fewest nearby allies AND fewest nearby hostiles (avoid dogpiling).
- **driver** (leech) — existing home-district rush, unchanged.
- **infester** (corruptor, blight) — existing node-attach behaviour, unchanged.

Squadmates sharing a target spread across `ENEMY_AI.squadBearingBuckets` (6) bearing slices; each enemy prefers the bucket with fewest same-squad competitors, producing emergent flanking without an explicit coordinator.

**Corruptors** (`corruptor`, `blight`): never attack workers. Never target gold nodes. Prefer ore/gems/energy. Attach while corrupting and reduce economic output. Blight is the heavier variant with early scout resistance. Passive residue cleanup is deliberately slow as of 2.4.2 (`CORRUPTION.purgeBase = 0.12`, `purgePerArsenal = 0.025`) so corruption effects stay visible after corruptors detach; scout cleansing rates are the active cleanup path and should not be conflated with passive fade.

### Turrets

Static base defense. Target combat enemies only (never corruptors, never cloaked phantoms). Range and cooldown respond to event modifiers. Carry a `disabledTicks` counter; while > 0 the turret skips targeting and firing entirely.

### Enemy Shield System

Three enemy kinds carry a regenerating shield layer that sits on top of their normal HP pool: `leech` (50 HP shield), `phantom` (10 HP shield), `zapper` (20 HP shield). Shield amounts are declared once in `ENEMY_SHIELD.shieldMax` in `balance.ts`.

Fields on `Enemy` (all optional — `undefined` means "no shield mechanic"): `shield`, `shieldMax`, `shieldRegenCooldown`. `spawnEnemy()` in `factories.ts` sets all three for enemies whose kind is in `ENEMY_SHIELD.shieldMax`; migration populates them with full-shield defaults for existing saves.

**Damage routing**: all hostile damage paths (turret missile/beam, sentinel shot, scout shot) now go through `damageEnemy(enemy, amount)` in `enemyUtils.ts` rather than subtracting from `enemy.hp` directly. `damageEnemy` deducts from the shield first, does not spill overflow into HP in the same hit, and resets `shieldRegenCooldown` to `ENEMY_SHIELD.regenDelayTicks` (90). Any new damage source must use this helper, not raw `enemy.hp -=`.

**Turret missile behavior**: homing missiles steer only toward their original live target. Launched missiles have a small terminal grace radius (`missileGraceRadius`) so a shot that arrives just behind a moving target can still connect. If the original target dies right before impact, a missile close to that enemy's death-fade position can resolve there and disappear without dealing splash. Missiles still never retarget; if the original target cloaks, disappears, or dies outside corpse grace, the missile fizzles.

**Regeneration**: `stepEnemyShields()` runs after `stepZapperFire()` and before `resolveEnemyDeaths()`. While `shieldRegenCooldown > 0` it decrements by 1; otherwise, if `shield < shieldMax`, shield recovers by `ENEMY_SHIELD.regenRatePerTick` (0.25). Dying enemies (`hp <= 0`) skip regen.

**Render**: `FieldSvg.tsx` computes `hasShield`, `shieldPct`, and pulsing state once per enemy and injects a dashed cyan ring + soft glow + thin shield bar stacked above the HP bar into the render blocks for shielded kinds. Because leech and phantom share the fallback render block, the shield overlay is embedded there too.

**Sentinel kill credit**: `sentinels.ts` credits only HP-lethal sentinel hits after shield routing. Because shield overflow does not spill into HP, any target with positive shield remaining before the shot is treated as non-lethal for sentinel-kill achievements; once shield is gone, the normal `target.hp - damage <= 0` check applies.

### Disable System

Workers and turrets carry `disabledTicks: number`. While > 0, the entity is inert (worker task becomes `"Disabled"`, turret skips its fire path) and the counter decrements each tick. Source today: zapper-bolt impact (sets `ZAPPER.disableDurationTicks = 210`). Worker reboot clears `disabledTicks`. Renderer shows disabled entities greyscale with a pulsing orange ring.

### Scouts

Dedicated anti-corruption units. Priority: live corruptors → corrupted nodes → patrol home. Not mobile turrets. Corruptor targeting (2.4.0+) is rate-weighted — a corruptor's per-tick corruption rate (blights score higher than regular corruptors) is multiplied by the attached node's current corruption level, so a blight on a 95%-corrupt node outranks a fresh corruptor. Node cleansing alternates between a **finish-job bias** (nodes within `SCOUT_AI.finishNodeThreshold` of cleanse) and a **stop-bleed bias** (nodes with `corruptedBy != null`) based on which pile is larger. **Pair-up** routes the second live scout onto any node over `SCOUT_AI.pairUpCorruptionThreshold` once at least `SCOUT_AI.pairUpScoutCount` scouts are live, so multi-scout synergy fires on the worst nodes automatically. Four physical scout slots in state; activation gated by upgrade level.

### Sentinels

Heavy late-game ground mechs. Target priority weights the threat's distance to its nearest worker (not just distance to the sentinel) plus a priority bonus for `leech > brute > sapper > general combat`. A brute near a worker outranks a closer brute drifting alone. Active sentinels move to an **intercept point** between the threat and the worker the threat is targeting (lerp factor `SENTINEL_AI.interceptLerp`, predicting worker position forward by `interceptLeadTicks`) so they feel like bodyguards rather than chasers. Patrol position blends `homeX` with the active-worker centroid so off-center late-game deployments still get cover. Two physical sentinel slots; activation gated by upgrade level.

### Mining

Workers harvest assigned nodes with kind-specific behavior and crit chances. Corrupted nodes yield less. Foundry upgrades increase yield and respawn speed. Temporary cache nodes disappear on exhaustion instead of respawning. Recently worked, partially mined nodes use `workTicks` to render a fading mined-progress ghost segment and deterministic particles over the missing health-bar span; this is presentation only and must never restore `ResourceNode.hp` or regenerate resources.

### Entity Spawn / Death Animation

Nodes, enemies, and agents all fade in and out rather than popping. Three fields drive this entirely in the renderer (`FieldSvg.tsx`) — no presentation logic leaks into the sim:

- **`spawnTick: number`** on `ResourceNode`, `Enemy`, and `Agent` — the `timers.tick` value when the entity entered the field. Set in `makeNode`, `respawnNode`, `makeWorker`, `spawnEnemy`, and in `combat.ts` at agent reboot. Migration fallback `?? 0` disables fade for loaded saves (avoids a flash-of-invisible on load).
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

### Persistence And Idle UX

Autosaves to localStorage every 30 seconds. Saves carry `schemaVersion: 5`; `migrateGameState()` handles older saves by stamping current schema on load and backfilling the newer interaction fields: `stats.eventTagsInspected`, `stats.touristClicks`, `stats.touristPassesClicked`, `touristWorker.passId`, `touristWorker.lastClickedPassId`, `touristWorker.squishTicks`, `lostDrone`, and `activeEvents[].revertOnExpire`. Existing saves with 3 agents still get `active: true` defaulted on migration. Hidden tabs pause the accumulator — no catch-up burst on refocus. `localStorage["nexusDriftSave"]` is the active save slot.

The app shell separately polls `/version` about every 5 minutes (and when the tab regains focus), extracts a flat semver from the response body, and compares it to `CURRENT_VERSION`. When the live version is newer, `App.tsx` shows a banner with `Refresh`, `Close`, and session-only `Don't Show Again`. The ignore state is intentionally ephemeral and is not part of save data or localStorage migration. The hidden admin panel also has a `Show Update Banner` action that forces the same banner path open using a preview patch version, so QA can exercise the refresh/dismiss controls without waiting for a deploy.

### Achievements

54 achievements across 4 rarity tiers (`common` / `uncommon` / `rare` / `legendary`) and 6 categories (`combat`, `corruption`, `mining`, `progression`, `survival`, `secret`). `AchievementDef` now carries `rarity`, `category`, and an optional `hidden` flag. Hidden locked achievements display as "???" placeholders in the modal until revealed.

Categories and examples:

- **Progression** — level milestones (10/20/30), prestige stacking (1/3/5), threat tiers (5/8/10), all-upgrades-at-1 and all-at-5, foundry/archive max, cores/flux accumulation
- **Combat** — kill counts (10/100/500/1000), brutes (10/25), phantoms (5), leeches (3), sappers (10), first sentinel kill, turret level 8
- **Mining** — first crit, 25/100 crits, mined 1k/10k resources, gold hoard (5k), gem collector (200)
- **Corruption** — first purge, 50/200 purges, pristine (corruptors present + zero corrupted nodes), triple rot (3+ simultaneously), full spectrum (all three types)
- **Survival** — 15m/30m/1h/2h runtime, colony health 95% under pressure, every active worker full HP while hostiles are present
- **Secret** — drift easter egg, click-spotted tourist drone, multi-pass tourist secrets, broken lost-drone recovery, synthwave Konami, all 12 events experienced, all 12 event cards inspected, anomaly witness, projectile/corpse clicks, changelog/modal opens, manual override

New stats tracked on `GameState.stats`: `phantomsKilled`, `leechesKilled`, `sappersKilled`, `sentinelKills`. `sentinelKills` is credited only when a sentinel lands the lethal hit; do not infer it later from target selection or corpse cleanup. Migration adds `?? 0` fallbacks for all four.

`state.stats.purges` counts completed node cleanses only. It increments in `stepScouts()` when a node crosses back under the corruption threshold and must not be incremented for corruptor or blight deaths.

Interaction-driven achievement helpers now live in `src/game/achievements.ts` and own the shell/renderer mutation points: `inspectEventTag`, `spotTourist`, `recoverLostDrone`, `witnessAnomaly`, `clickProjectile`, `clickDyingEnemy`, `recordAchievementsOpen`, `recordChangelogOpen`, and `completeManualOverride`. Keep those helpers authoritative — `App.tsx` and `FieldSvg.tsx` should forward interaction intent into them, not inline achievement state mutations.

`AchievementsModal` (`src/components/AchievementsModal.tsx`) replaces the inline modal in `App.tsx`. Features: category tab bar with per-tab unlock counts, rarity-coloured rows and badges, hidden-achievement masking toggle (eye icon), completion progress bar, and a rarity legend footer.

The achievement ribbon in the field card now uses rarity-coded border/background colours instead of flat indigo. An unlock count badge (e.g. `3/54`) appears at the right end of the strip. Opening the ribbon can itself unlock `archivist` once any hidden secret is already revealed.
The ribbon renders newest unlocks first by reversing the unlocked id list at render time, so fresh badges appear on the left edge and push older ones rightward instead of being appended off to the far right.
Each ribbon badge is now its own button: clicking one opens `AchievementsModal`, switches to the matching category, scrolls the corresponding row into view, focuses it, and plays a brief pulsing cyan highlight that fades back to transparent at the end so the player lands on the right achievement immediately without a lingering static halo. The pulse is implemented in `src/index.css` as presentation-only animation and is disabled under `prefers-reduced-motion`.

Late-game gotcha: the visible director tier is capped at 5 (`Settling` → `Cataclysm`). Any legacy “tier 8/9/10” style unlock or spawn gate must key off `derived.progression.score / PROGRESSION.tiersPerScore`, not the capped `derived.progression.tier`. `stepAchievements()` and the lost-drone event roll now follow that rule.

### Easter Eggs

- Konami code toggles synthwave palette, logs a message, and unlocks the hidden `synthwave` achievement.
- Typing `drift` anywhere logs "The drift remembers." and unlocks an achievement.
- Tourist drone wanders the field after 15 real-time minutes at city stage 5; click it to unlock `Taking Notes`, keep clicking it across 3 separate passes for `Tour Guide`, and mash it 50 times in one run for the legendary click-total secret.
- While 3 event cards overlap, a dedicated anomaly artifact appears in the field. Clicking it is now the only way to unlock the repurposed `event_streak` secret (`Anomaly Witness`).
- A damaged lost drone can drift through the outer zone on late-game big-event rolls (score threshold equivalent to old tier 9+). Click it to recover the unit and permanently add an extra drone beyond the normal 9-slot roster.
- Zapper bolts, in-flight turret missiles, and death-fading corpses are all valid click targets for hidden secrets.
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
- Header version badge click records the hidden `release_reader` achievement.
- Top project chrome also carries a GitLab source link beside the version badge.
- Public speed presets (1×/2×/4×) are in the main UI. Admin panel (5× Space) adds extended controls and event triggers. Hidden `manual_override` is specifically `1x -> 4x -> 1x` with 10–60 seconds between the 4x and 1x clicks and no other speed click in between.
- Sector card, resource bar, and sidebar intentionally read the throttled `uiGame` / `uiDerived` snapshot. The field SVG and field-card live indicators still read the per-tick snapshot.
- Favicon assets now live across `public/nexus-drift.svg`, `public/nexus-drift.png`, `public/favicon.ico`, `public/favicon-32x32.png`, `public/favicon-16x16.png`, `public/apple-touch-icon.png`, and `public/site.webmanifest`. Social embeds intentionally remain pointed at `public/og-image.png`; do not swap embed art when only the favicon changes.
- ESLint intentionally ignores `.claude/` so local agent configuration and auxiliary worktrees do not create parser-root conflicts during `npm run lint`.
- Coarse-pointer `lg` desktop layouts (notably iPadOS landscape Safari) intentionally run a lower-cost presentation path in `Background`, `EventBackdrop`, and `FieldSvg`. Preserve the same art direction there, but gate new expensive particles, long blur animations, and SVG filters behind `useLowFxMode`.
- `package.json` version and `src/changelog.ts` must stay in sync for every release.
- Unless the user explicitly asks for a new release boundary, assume follow-up polish work belongs to the same current release line and expand that changelog entry instead of bumping again.
- When releasing, also update `README.md` and this file if architecture or player-facing behavior changed.
- ESLint `no-explicit-any` is set to `error` — any `any` will fail the build.
- 97 tests across `src/game/__tests__/advanceGame.test.ts`, `src/game/__tests__/interactionAchievements.test.ts`, `src/game/__tests__/aiBehavior.test.ts`, and `src/lib/versionCheck.test.ts` cover simulation invariants, interaction achievements, late-game worker-slot gating, worker unlock resource costs, event HUD linger behavior, AI behavior and archetype targeting, flee-direction worker retargeting, crowded-node avoidance, missile grace behavior, corruption linger, surround-pressure combat, live-version polling helpers, admin preview-version generation, manual-override timing, and save/load round-trips.

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
- `build` stage: Kaniko builds and publishes the production container image from `main` and `dev` only. Images get the commit SHA, `:latest`, and the exact `package.json` version tag; `dev` also keeps `:dev`. CI fails before building if that version tag already exists in the GitLab container registry.
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
