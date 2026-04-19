# Nexus Drift Expansion Plan

> **Handoff note for Sonnet:** This plan was authored by Opus after exploring the codebase end-to-end. Execute the milestones in order. Each milestone is its own commit + changelog version + `package.json` bump. After each milestone, verify per the checklist before moving to the next. The user is targeting a half-day idle pacing (3–5 hours to feel maxed) and wants two new resources: `flux` and `cores`.

## Context

Today's loop tops off in ~30–60 minutes: the 8 upgrades cap out fast, enemy variety is thin (4 kinds), and once you have arsenal + 4 scouts the corruption layer is solved. The game is meant to be an ambient wallpaper sim that holds attention for hours. We need slower ramp, deeper progression, more enemy variety, and idle-friendly random events — without losing the calm "watch the colony breathe" feel.

**Pacing target:** half-day (3–5 hours to feel maxed, with a long tail past that).
**Staging:** four sequential milestones, each its own commit + changelog version.
**New resources:** two — `flux` (purge-driven) and `cores` (rare elite drops).

---

## Milestone 1 — Pacing rework + drone nerfs (v0.1.1 "Slow Burn")

The most urgent feel issues. Ship this first; balance tweaks here unblock everything that follows.

### M1.1 Economy / progression slowdown
Touch [src/game/balance.ts](src/game/balance.ts):
- `UPGRADES.*.growth` — bump each by ~0.02 across the board (e.g. miner 1.18 → 1.20, reactor 1.25 → 1.27, bot 1.30 → 1.32). Compounds noticeably past level 15 without breaking early game.
- `ECONOMY.rates.goldPerMiner` 0.9 → 0.78, `orePerMiner` 0.35 → 0.30, `oreBase` 0.4 → 0.32. Ore is the primary bottleneck so trim it harder.
- `ECONOMY.xpRate.scale` 12 → 9.5 (slower leveling = slower wave power scaling = longer mid-game).
- `PROGRESSION.spawn.baselineInterval` 232 → 280 (calmer early game).
- `PROGRESSION.spawn.intervalPerScore` 3.4 → 2.1 (spawn rate doesn't accelerate as harshly).
- `PROGRESSION.wave.budgetPerScore` 0.058 → 0.038, `budgetPerTier` 0.33 → 0.24 (waves grow slower).
- `PROGRESSION.tiersPerScore` 11 → 14 (stretches tier 4–7 milestones farther apart).
- `PRESTIGE.goldGate` 5200 → 9800, `gemsGate` 36 → 70 (prestige feels like an actual milestone, not a quick reset).

### M1.2 Drone nerfs
Touch [src/game/factories.ts:118-181](src/game/factories.ts) and [src/game/balance.ts](src/game/balance.ts):
- Scout base speeds in `makeScouts()`: 1.46–1.54 → **0.95–1.05**. This is the headline nerf — drones currently zip across the field.
- `SCOUT.cleanseRateBase` 0.2 → **0.10** (twice as long to purge a node solo).
- `SCOUT.damageBase` 10 → 6, `SCOUT.damagePerScout` 2.5 → 2.0.
- `SCOUT.cooldownBase` 18 → 24, `SCOUT.cooldownFloor` 6 → 8.
- `SCOUT.preferredRangeBase` 68 → 56 (must close more aggressively, more vulnerable).
- `SCOUT.capBase` 3 → **2**, `SCOUT.capBoostThreshold` 5 → 8 (start with 2 active, 4th unlocks much later).
- `SCOUT.speedPerScout` 0.08 → 0.05, `SCOUT.speedPerArsenal` 0.16 → 0.10 (slower per-upgrade speed scaling — speed becomes a thing you have to invest in heavily, not a freebie).

### M1.3 Multi-drone cleanse synergy
Touch [src/game/subsystems/scouts.ts](src/game/subsystems/scouts.ts).

Current code in scouts.ts:106 picks one node per scout via `corruptedNodes[Math.min(index, ...)]` — accidental piling only happens when scouts > corrupted nodes. Make it intentional:

1. Before the per-scout loop, build a `nodeAssignments: Map<nodeId, scoutCount>` by walking corruptors-and-corrupted-nodes assignment ahead of time.
2. When applying `cleanseRate` (line 120), multiply by a synergy factor:
   ```
   const synergy = 1 + (assignedCount - 1) * 0.6;  // 1→1x, 2→1.6x, 3→2.2x, 4→2.8x
   ```
3. Also actively *route* extra scouts to already-targeted nodes when corrupted nodes are scarce, instead of patrolling. New rule: if a corrupted node exists and a scout has nothing to do, double up rather than patrol.

Add `SCOUT.cleanseSynergyPerExtra: 0.6` to balance.ts so it's tunable.

### M1.4 Verification
- Run `npm run dev` (preview tools).
- Watch a fresh seeded run for 5+ minutes — confirm spawn intervals feel slower, scouts visibly drift across the field rather than dart.
- Spawn 2 corruptors via admin panel onto same node area; confirm two scouts pile and corruption drops at the synergy rate (visually faster than 2× the solo rate).
- `npm test` for any tuning-sensitive unit tests in [src/game/](src/game/) (esp. anything in `progression.test.ts` if it exists).

Update [src/changelog.ts](src/changelog.ts) with v0.1.1 "Slow Burn" entry. Bump version in `package.json`.

---

## Milestone 2 — New enemies + meaningful random events (v0.1.2 "Strange Tides")

Adds enemy variety that gates introduction by tier, plus a random-event system above the existing flavor logs.

### M2.1 New enemy kinds
Extend `EnemyKind` in [src/game/types.ts](src/game/types.ts) and add stats in [src/game/balance.ts](src/game/balance.ts). All entries also need budget cost, contact damage, combat weights with `minTier`, and rendering color/shape in [src/components/FieldSvg.tsx](src/components/FieldSvg.tsx).

| Kind | Tier gate | Role | HP | Speed | Damage | Notes |
|---|---|---|---|---|---|---|
| **rusher** | 3 | combat | 24 | 1.85 | 4.0 | Cheap, fast, no strafe — straight-line darters. Anti-turret pressure. |
| **brute** | 4 | combat | 160 | 0.55 | 12.0 | Tanky, slow, high contact damage. Soaks turret fire. Drops `cores`. |
| **sapper** | 5 | combat | 35 | 1.1 | 0 | Suicide unit; on contact with a worker or near a turret, explodes for AoE 18 damage in 60-radius. New `onDeath`/`onContact` hook. |
| **blight** | 5 | corruptor | 95 | 0.8 | 0 | Heavy corruptor; takes 60% reduced scout damage until arsenal ≥ 3. Corrupts faster (0.95/tick). |
| **leech** | 6 | combat | 70 | 0.85 | 2.0 | When within 100u of home, drains 0.4 gold + 0.02 energy per tick from colony. Priority turret target. |
| **phantom** | 7 | combat | 55 | 1.3 | 5.0 | Cycles cloak every ~120 ticks (visible 90 ticks, cloaked 30); turret targeting ignores cloaked phantoms but scouts still see them. |

Wave-power scaling and per-tier weights go into `PROGRESSION.combatWeights` (similar shape to wisp/raider). Enemy IDs may need a new dispatch in `spawnEnemy()` for the `forcedKind` path — extend the `rng.pick` array to respect tier gating, pulled from progression.ts.

### M2.2 Cores resource (elite drops)
- Add `cores` to [src/game/types.ts](src/game/types.ts) `ResourceKey` union.
- Brutes drop 1 core on death; phantoms drop 2; "boss" elites (M2.3) drop 5.
- Cores HUD pill: gold-tinted, distinct icon, in main resource bar.
- Cores cost in M3 upgrades (Sentinel/Archive tiers).
- Initial supply: 0; reset multiplier for prestige: 0.05 (mostly resets, prestige isn't a core farm).

### M2.3 Random events system
Refactor [src/game/subsystems/events.ts](src/game/subsystems/events.ts) into two modes: ambient flavor logs (current behavior) and **mechanical events** (new). Add `state.timers.event` already exists; add a separate `state.timers.bigEvent` and roll a real event every ~30–90s (configurable).

Event pool — pick a handful for M2, expand later:
- **Meteor Shower** (60s): all node yields ×1.6, brief visual streaks across canvas.
- **Solar Flare** (45s): energy generation ×2, turret cooldowns +20%. Forces a defensive choice.
- **Cache Discovery**: spawns one bonus high-yield node at a random valid position; despawns after harvest or 3 minutes.
- **Pirate Caravan**: triggers an off-schedule wave of 3–5 raiders carrying ×2 kill rewards.
- **Xeno Bloom**: corruption rate ×1.5 for 90s but purges grant ×3 flux.
- **Dust Storm**: turret range -25%, enemy speed -20%. Visual: subtle grain overlay.
- **Echo Signal** (rare, tier 5+): a single elite "Hivemind" enemy spawns, drops 5 cores on death.

Each event has: `id`, `label`, `description`, `durationTicks`, `apply(state)`, `revert(state)`, `weight` (prob), `minTier` (gating). Store active events in `state.activeEvents: ActiveEvent[]`.

Surface active events in HUD as a single status badge row above the event log.

### M2.4 Verification
- Preview dev server, watch for ~10 minutes; verify random events fire and HUD shows their banner.
- Manually trigger each event via admin panel button (extend admin panel with event triggers).
- Spawn a brute via admin; confirm core drop animates and HUD pill increments.
- Run a phantom through turret fire — confirm cloak phase visually fades and turrets stop targeting.

Changelog v0.1.2 "Strange Tides".

---

## Milestone 3 — New upgrade tracks + Flux resource (v0.1.3 "Deep Reserves")

Adds the second new resource and three new upgrade categories to extend the progression tail.

### M3.1 Flux resource
- Add `flux` to `ResourceKey`.
- Earned via: scout purges (+0.5 base, +0.1 per arsenal), corruptor kills (+1.0), purging fully-corrupted nodes (+3.0).
- Soft cap at 200; over-cap goes to 0.3× rate (encourages spending, not stockpiling).
- HUD pill, purple-tinted.
- Reset multiplier for prestige: 0.25 (some carries over).

### M3.2 New upgrade tracks
Add to [src/game/data.ts:31](src/game/data.ts) `upgradeDefs`. Each new upgrade has cost in **flux** and/or **cores** as a gating mechanism:

| Key | Label | Base cost | Effect | Gates |
|---|---|---|---|---|
| `foundry` | Foundry | 4 flux + 200 ore | +12% node max yield per level; node respawn 8% faster | Unlocks at tier 3 |
| `sentinel` | Sentinel Mech | 3 cores + 800 gold | Spawns a heavy ground unit per level (cap 2). Slow, high-damage, hunts brutes/sappers/leeches preferentially. | Unlocks at tier 5 (after first brute kill) |
| `archive` | Data Archive | 6 flux + 1 core | +8% XP rate per level; +0.05 prestige combo per level (stacks with PRESTIGE.comboBonus). | Unlocks at tier 4 |

Each needs:
- Cost calc extension — `nextUpgradeCost` currently assumes single-resource cost. Rework to `Record<ResourceKey, number>` shape, default to gold-only for existing 8.
- Autobuy logic in [src/game/subsystems/autobuy.ts](src/game/subsystems/autobuy.ts) — add weighted rules and emergency triggers (e.g. "buy sentinel if 2+ brutes alive").
- Smart gates in autobuy.ts:127 — block until prereqs.

### M3.3 Sentinel mech subsystem
New file `src/game/subsystems/sentinels.ts` modeled on scouts.ts. State: `state.sentinels: Sentinel[]`. Slow ground patrol along a midfield band, target priority: leech > brute > sapper > anything. Heavy projectile (visually distinct from turret/scout). Add render in FieldSvg.tsx.

### M3.4 Foundry & Archive — pure modifiers
No new subsystem; extend existing rates:
- `mining.ts` yield: multiply by `1 + 0.12 * upgrades.foundry` and node respawn cooldown reduced.
- `economy.ts` xpRate: multiply by `1 + 0.08 * upgrades.archive`.
- Prestige combo in `selectors.ts`: add archive bonus.

### M3.5 Verification
- Preview run; reach tier 3 and verify Foundry unlocks, autobuy starts considering it.
- Sim-up to tier 5 via admin; confirm Sentinel mech spawns and visually patrols.
- Trigger a brute spawn; confirm Sentinel preferentially targets it.
- Verify flux pill appears, increments on purges, soft-caps at 200.
- Run unit tests for any cost-calculation changes (extend existing tests or add new).

Changelog v0.1.3 "Deep Reserves".

---

## Milestone 4 — Easter eggs, polish, idle-friendly UX (v0.1.4 "Long Watch")

Smaller, lower-risk additions that make the wallpaper experience richer.

### M4.1 Easter eggs
- **Konami code** (↑↑↓↓←→←→BA) on the App: toggles a hidden "synthwave" palette via a CSS variable swap.
- **Tourist worker**: at city stage 5, after 15 minutes runtime, a single non-functional cosmetic worker wanders the field carrying a tiny camera. Pure flavor.
- **Lost worker**: tier 9+, rare (1% per big-event roll): a beat-up worker drone wanders in from the edge, joins your colony permanently as a 4th worker (one-time per run).
- **Hidden log line**: typing "drift" anywhere logs `"The drift remembers."` in the event log.
- **Click city stage 5 building 7 times**: building lights up, plays a single chime via Web Audio API (or just a visual flash if no audio).

### M4.2 Idle-friendly UX
- **Pause on tab hidden**: hook `document.visibilitychange` in useGameLoop.ts to halt the accumulator (currently ticks burn while hidden — bad for laptop battery, also causes burst-catchup when refocused).
- **Persistence**: localStorage save every 30s of GameState (with seed), restore on load. Optional "fresh run" button.
- **Achievements ribbon**: track ~12 milestones (first prestige, kill 100 brutes, max foundry, see all events, etc.). Display as a thin ribbon under the resource bar; clicking opens a panel.
- **Day/night cycle**: 30-minute real-time day cycle, subtle palette shift on the city/sky. Pure visual. Some events more likely at "night" (Xeno Bloom, Phantom waves).
- **Speed presets**: replace the admin-only speed slider with public 1×/2×/4× buttons (still gated behind admin tap if you prefer).

### M4.3 Polish
- Worker veteran ranks: workers track personal kill-near-them counts; at thresholds, gain a small visual chevron and +5% speed. Cosmetic-leaning.
- Better death/spawn vfx: brief particle burst on enemy death (already partially via `flash`; extend with 4–6 expanding dots).
- Improve event log readability: timestamps, event-type color coding.

### M4.4 Verification
- Preview run; trigger Konami code; confirm palette swaps.
- Hide tab for 30s, refocus; confirm no catch-up burst.
- Reload page; confirm save restores.
- Let run for 30 min; confirm day/night visible and persistence holds across reload.

Changelog v0.1.4 "Long Watch".

---

## Critical files (touched across milestones)

- [src/game/balance.ts](src/game/balance.ts) — every milestone tunes constants here.
- [src/game/types.ts](src/game/types.ts) — `ResourceKey`, `EnemyKind`, new entity types.
- [src/game/factories.ts](src/game/factories.ts) — scout speeds, new enemy/sentinel factories.
- [src/game/subsystems/scouts.ts](src/game/subsystems/scouts.ts) — multi-drone synergy.
- [src/game/subsystems/spawns.ts](src/game/subsystems/spawns.ts) — new enemy gating, event-driven waves.
- [src/game/subsystems/events.ts](src/game/subsystems/events.ts) — split into ambient + mechanical events.
- [src/game/subsystems/autobuy.ts](src/game/subsystems/autobuy.ts) — weights/gates for new upgrades.
- [src/game/subsystems/economy.ts](src/game/subsystems/economy.ts) — flux/cores gen, archive XP modifier.
- [src/game/subsystems/mining.ts](src/game/subsystems/mining.ts) — foundry yield modifier.
- New: `src/game/subsystems/sentinels.ts`, `src/game/events/eventDefs.ts`.
- [src/game/data.ts](src/game/data.ts) — new upgrade defs, multi-resource cost shape.
- [src/game/progression.ts](src/game/progression.ts) — new combat weight entries with minTier.
- [src/game/selectors.ts](src/game/selectors.ts) — derived state for active events, new resources, sentinel cap.
- [src/components/FieldSvg.tsx](src/components/FieldSvg.tsx) — render new enemies, sentinels, event vfx, day/night.
- [src/App.tsx](src/App.tsx) — Konami hook, achievements ribbon, save/load.
- [src/hooks/useGameLoop.ts](src/hooks/useGameLoop.ts) — pause-on-hidden, save tick.
- [src/changelog.ts](src/changelog.ts) — version entry per milestone.
- `package.json` — version bump per milestone.

## Reused existing utilities
- `dist`, `clamp`, `pushLog` from [src/game/utils.ts](src/game/utils.ts) — used everywhere.
- `findClosestEnemy` / `findClosestNode` from [src/game/targeting.ts](src/game/targeting.ts) — sentinels reuse these.
- `addProjectile` from [src/game/factories.ts](src/game/factories.ts) — sentinel projectiles reuse.
- `Rng` from [src/game/rng.ts](src/game/rng.ts) — all event rolls use the seeded RNG (keeps runs reproducible).
- `computeDerived` from [src/game/selectors.ts](src/game/selectors.ts) — already centralizes derived modifiers; extend rather than recompute inline.

## Cross-cutting verification
After every milestone:
1. `npm test` — fix any tuning-broken assertions; add new tests for new subsystems (especially sentinels and event apply/revert).
2. `npm run dev` + preview tools — verify the new behavior visually for at least 5 minutes of real-time play. For pacing changes, sim with admin speed 4× to compress.
3. Spot-check tier 3, tier 5, tier 7 transitions with admin panel — confirm new enemies appear at right tiers, new upgrades unlock when expected.
4. After M3 and M4, leave a 30-minute idle session running to confirm no perf regressions (target: still hitting 60fps at tier 7+ with full enemy cap).
5. Update [README.md](README.md) at the end of M4 with the new feature summary.
