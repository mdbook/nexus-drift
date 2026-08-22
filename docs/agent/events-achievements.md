# Events, Achievements, Activity Log

**Source files:** `src/game/events/eventDefs.ts`, `src/game/achievements.ts`, `src/game/subsystems/events.ts`, `src/game/subsystems/achievements.ts`, `src/game/notifications.ts`, `src/game/constants.ts`, `src/game/adminCommands.ts`, `src/components/EventChip.tsx`, `src/components/EventBackdrop.tsx`, `src/components/ActivityLog.tsx`, `src/components/NotificationStack.tsx`, `src/components/AchievementsModal.tsx`, `src/components/AdminPanel.tsx`
**Tests:** `src/game/__tests__/advanceGame.test.ts`, `src/game/__tests__/interactionAchievements.test.ts`, `src/game/__tests__/notifications.test.ts`, `src/game/__tests__/adminCommands.test.ts`
**Key invariants:** event modifiers compose via `recomputeEventModifiers`, never inline `apply`/`revert`; `appendLog` is the only log write path; achievement interactions route through helpers in `achievements.ts`; admin terminal mutations route through `mutateGame()`.

## Random Events

Two event layers: ambient flavor log chatter (original) and seeded mechanical events (30–90 second timer). Mechanical events write into `state.activeEvents`, push multipliers into `state.eventModifiers`, and render inspectable HUD surfaces in the footer. Timed cards show countdowns; one-shot cards intentionally do not, and instead fade during their linger window. Night (day/night cycle) slightly biases toward harsher events.

### EventDef metadata

Each `EventDef` in `src/game/events/eventDefs.ts` carries presentational metadata alongside its mechanical `apply` / `revert`:

- `flavor` — short narrative line.
- `tone` — `boon` / `threat` / `mixed` / `neutral`, drives chip colour.
- `effects: { text, tone }[]` — per-line breakdown shown in the tooltip.
- `hudDurationTicks` — HUD linger duration, separate from mechanical `durationTicks`.

Keep these in sync when tuning an event's mechanics — the tooltip/card is the player's only source of truth for what the event actually does.

`getEventDef(id)` is exported from `eventDefs.ts` for presentational lookups — never mutate the returned def.

### `durationTicks` vs `hudDurationTicks`

These are deliberately separate.

- Timed modifier events set both and expire with `revertOnExpire: true`.
- The 3 one-shot events (`cache_discovery`, `pirate_caravan`, `echo_signal`) keep `durationTicks = 0` but set `hudDurationTicks ≈ 10 s`, so they still surface as inspectable cards and short-lived backdrop effects.
- `stepEvents()` must only call `eventDef.revert()` when `activeEvent.revertOnExpire` is true.

### Event inspection

Inspection is **click-only**. `EventChip` click counts as inspection via `inspectEventTag()`. Hover/focus tooltip alone must never mark an event as inspected.

### Modifier composition

Timed modifier values live on `EventDef.modifierContributions` (multiplicative factors — e.g. `{ yieldMultiplier: 1.6 }`). `state.eventModifiers` is recomputed from the active event list via **`recomputeEventModifiers()`** on activate, expire, and admin clear — never written directly from an event's `apply`/`revert`. This lets overlapping events stack (e.g. Meteor Shower + Starcall both touching yield) without one expiring clobbering the other's contribution.

### Backdrop & chip layers

`EventBackdrop` renders a distinct ambient effect per active event id (color wash + particles + blurs). Effects compose additively when multiple events are active. The component keys off event ids rather than per-tick countdown state so long-running events do not rerender the full overlay every sim tick. Effect per event id: `meteor_shower`, `solar_flare`, `cache_discovery`, `pirate_caravan`, `xeno_bloom`, `dust_storm`, `core_breach`, `hunter_pack`, `signal_drought`, `starcall`, `null_surge`, `echo_signal`.

`EventChip` renders the HUD pill/card with hover/focus tooltip. Tone colours are centralized in a `TONE_STYLE` map inside the component. See [layout.md § Indicator Conventions](layout.md#indicator-conventions) for tooltip rules.

## Activity Log

The activity log lives in two parallel arrays.

- **`state.log`** — live HUD feed, capped at `MAX_LOG = 20`, newest first. Shows the most recent moments across every category.
- **`state.archiveLog`** — long-form mirror, capped at `MAX_ARCHIVE_LOG = 200`, newest first. Retains **only** the archival categories `upgrade`, `event`, `achievement` so player-facing progression history is not lost when noisy combat / mining chatter scrolls the recent feed.

The set of archival categories is exported as `ARCHIVE_LOG_CATEGORIES` from `constants.ts`. Each `LogEntry` carries:

- `tick: number` — the simulation tick when the entry was pushed (used to display "Xs ago" relative ages in the UI).
- `category: LogCategory` — one of `system` | `combat` | `mining` | `corruption` | `event` | `upgrade` | `achievement` | `ambient`. Pick the tightest fit; default to `ambient` for flavor.
- `message: string` — the human-readable log line.

### Write path

**`appendLog(state, message, category)`** is the **sole write path**. It pushes onto `state.log` and, when the category is archival, mirrors the entry into `state.archiveLog`. Every subsystem call site uses this helper. `pushLog` is retained as a low-level slicing primitive but should not be called directly from sim code.

### Persistence

- `migrateGameState()` maps legacy `string[]` saves to `{ tick: 0, category: "system", message }` — do not remove that branch. v10-and-earlier saves default `archiveLog` to `[]`.
- `cloneGameState()` deep-copies both arrays via `entry => ({ ...entry })` — log entries are plain objects, so shallow spread is sufficient.

### Caps

`MAX_LOG` is 20 and `MAX_ARCHIVE_LOG` is 200. Do not raise `MAX_LOG` without checking the `ActivityLog` `max-h-72` scroll container; do not lower `MAX_ARCHIVE_LOG` without checking that long sessions still retain enough progression history.

### UI

`ActivityLog` renders the log with per-category icon (lucide-react) and colour coding; relative-age timestamp ("3s ago", "1m ago"); category filter tab bar: All / Combat / Corrupt / Upgrade / Event / Awards; scrollable list (`max-h-72`).

"All" shows 20 newest entries; Upgrade / Event / Awards swap to the 200-entry archive feed so long-form scroll-back is available without bloating the recent HUD. Live pulsing dot in the header. Bottom legend links directly to each represented category.

## Achievements

74 achievements across 4 rarity tiers (`common` / `uncommon` / `rare` / `legendary`) and 6 categories (`combat`, `corruption`, `mining`, `progression`, `survival`, `secret`). `AchievementDef` carries `rarity`, `category`, and an optional `hidden` flag. Hidden locked achievements display as "???" placeholders in the modal until revealed.

Categories and examples:

- **Progression** — level milestones (10/20/30/50/75), prestige stacking (1/3/5), threat tiers (5/8/10), all-upgrades-at-1 and all-at-5, foundry/archive max, cores/flux accumulation, and the 4.0 operator set: `first_manual_purchase` (a real manual buy) and `full_manual_run` (tier 3 with master autobuy off).
- **Combat** — kill counts (10/100/500/1000), brutes (10/25), phantoms (5), leeches (3), sappers (10), first sentinel kill, turret level 8.
- **Mining** — first crit, 25/100 crits, mined 1 k/10 k resources, gold hoard (5 k), gem collector (200).
- **Corruption** — first purge, 50/200 purges, pristine (corruptors present + zero corrupted nodes), triple rot (3+ simultaneously), full spectrum (all three types), first sentinel cleanse (`purify_first`), warden killed before attach completes (`warden_killed`), 5 cleanses in one run (`quarantine`), 3+ workers corrupted for 30 continuous seconds (`void_outbreak` — legendary).
- **Survival** — 15 m / 30 m / 1 h / 2 h / 4 h / 8 h / 24 h runtime, colony health 95% under pressure, every active worker full HP while hostiles are present, and `autobuy_off_milestone` (5 continuous minutes with master autobuy off).
- **Secret** — drift easter egg, click-spotted tourist drone, multi-pass tourist secrets, broken lost-drone recovery, synthwave Konami, all 12 events experienced, all 12 event cards inspected, anomaly witness, projectile/corpse clicks, changelog/modal opens, manual override.

### Rules for adding achievements

`ACHIEVEMENT_DEFS` in `src/game/achievements.ts` is the single source of truth for all achievement metadata. The subsystem (`src/game/subsystems/achievements.ts`) only calls `unlockAchievement()` — it never pushes to the log directly.

1. Add the new `AchievementId` to the union type in `achievements.ts`.
2. Add an `AchievementDef` entry with `id`, `label`, `description`, `rarity`, `category`, optionally `hidden: true`.
3. Add the condition check in `stepAchievements()` in `subsystems/achievements.ts`.
4. If the condition needs a new stat counter, add it to `Stats` in `types.ts`, initialise it in `createInitialGameState()`, and add a `?? 0` fallback in `migrateGameState()` — see [persistence.md § Save State And Migration](persistence.md#save-state-and-migration).

### Stat counters

- `state.stats.purges` counts completed node cleanses only — increment in `stepScouts()` when a node is actually cleansed; do not increment for corruptor or blight deaths.
- `state.stats.sentinelKills` counts lethal sentinel hits only. Credit at the damage site in `stepSentinels()`, not later in `resolveEnemyDeaths()` based on `targetId`.
- `state.stats.wardensKilled` increments in `resolveEnemyDeaths()` only when a warden is killed before attaching; successful attachment removes the warden without kill credit.
- Other tracked stats: `phantomsKilled`, `leechesKilled`, `sappersKilled`, `corruptedPurified`, `corruptedWorkerOutbreakTicks`, `turretsBroken`, `autobuyOffTicks` (4.0 — continuous master-autobuy-off ticks). Migration adds `?? 0` fallbacks for all of these.

### Display-tier gotcha

`derived.progression.tier` is a capped display tier (max 5 — `Settling` → `Cataclysm`). Any legacy late-game gate that talks about tier 8/9/10 must use `derived.progression.score / PROGRESSION.tiersPerScore`, not the capped `tier` field. Current examples: threat-rank achievements and the lost-drone event roll.

### Input-driven helpers (authoritative)

Interaction-driven achievement helpers live in `src/game/achievements.ts` and own the shell/renderer mutation points: `inspectEventTag`, `spotTourist`, `recoverLostDrone`, `witnessAnomaly`, `clickProjectile`, `clickDyingEnemy`, `recordAchievementsOpen`, `recordChangelogOpen`, `completeManualOverride`, `recordManualPurchase`.

`recordManualPurchase` (4.0) is the clean origin signal for `first_manual_purchase`: `App.tsx`'s manual-buy handler calls it only after a successful `purchaseUpgrade`, and `stepAutobuy` NEVER does — so the achievement can only ever fire on a real operator click, and the byte-identical autobuy path is untouched. Do NOT string-match the activity log to detect manual buys. The two milestone operator achievements (`autobuy_off_milestone`, `full_manual_run`) are passive checks in `stepAchievements`: `autobuy_off_milestone` counts CONTINUOUS ticks with `upgradeAutoMaster === "none"` via `stats.autobuyOffTicks` (reset to 0 the moment autobuy is re-enabled, mirroring the `corruptedWorkerOutbreakTicks` idiom; threshold = `ACHIEVEMENTS.autobuyOffMilestoneTicks`), and `full_manual_run` unlocks when `derived.progression.tier >= 3` while master is `"none"`.

Keep these helpers authoritative — `App.tsx`, `EventChip.tsx`, and `FieldSvg.tsx` should route achievement-relevant interactions through them rather than mutating achievement state inline. `tourist_spotted` is intentionally input-driven; do not reintroduce a passive visibility unlock in `stepAchievements()`.

### Rarity and hidden

- **Common** (tutorial-level), **uncommon** (mid-game), **rare** (late-game / specific combos), **legendary** (exceptional / near-impossible feats).
- Hidden achievements (`hidden: true`) show as "???" placeholders until unlocked. Use sparingly — only for genuine easter eggs and surprises.
- The `AchievementsModal` component renders all `ACHIEVEMENT_DEFS` entries. If you add a def without a matching condition in `stepAchievements`, it appears permanently locked but does not break anything.

### UI surfaces

- `AchievementsModal` — full modal with category tab bar (per-tab unlock counts), rarity-coloured rows and badges, hidden-achievement masking toggle (eye icon), completion progress bar, rarity legend footer.
- Achievement ribbon in the field card uses rarity-coded border/background colours. Unlock count badge (e.g. `3/74`) at the right end. Opening the ribbon can itself unlock `archivist` once any hidden secret is already revealed.
- Each ribbon badge is a button: clicking opens `AchievementsModal`, switches to the matching category, scrolls the corresponding row into view, focuses it, and plays a brief pulsing cyan highlight (animation in `src/index.css`, disabled under `prefers-reduced-motion`).

## Unified Notification Stack

`NotificationStack` renders the head three entries of `state.notifications` (cap = `NOTIFICATION_VISIBLE_LIMIT`); additional entries hold in an invisible queue with paused timers and promote automatically as visible slots free up.

Per-kind body components route off `notification.kind` (achievement / enemy-discovered). Adding a new toast variant is a three-step contract documented at the top of `src/game/notifications.ts`:

1. Extend the `Notification` discriminated union.
2. Add a builder (`buildAchievementNotification`, `buildEnemyDiscoveredNotification`, etc.).
3. Add a render branch.

Action callbacks flow through a typed `NotificationAction` discriminated union (`{ kind: "open-wiki"; entryId }`) that the host translates into surface-specific effects. Discoveries persist via `state.discoveredEnemies` so a kind never re-triggers after a reload.

## Easter Eggs

- Konami code toggles synthwave palette, logs a message, and unlocks the hidden `synthwave` achievement.
- Typing `drift` anywhere logs "The drift remembers." and unlocks an achievement.
- Tourist drone wanders the field after 15 real-time minutes at city stage 5. Click for `Taking Notes`; click across 3 separate passes for `Tour Guide`; mash 50 times in one run for the legendary click-total secret.
- While 3 event cards overlap, a dedicated anomaly artifact appears in the field. Clicking it is the only way to unlock the `Anomaly Witness` (`event_streak`) secret.
- A damaged lost drone can drift through the outer zone on late-game big-event rolls (score threshold equivalent to old tier 9+). Click to recover the unit and permanently add an extra drone beyond the normal 9-slot roster.
- Zapper bolts, in-flight turret missiles, and death-fading corpses are all valid click targets for hidden secrets.

## Admin Terminal

The hidden admin console opens with `Space` five times **or** by tapping the version badge five times within 2 s on mobile. Admin mode extends the existing header speed selector with 10×/20×/100×; **do not reintroduce a separate admin-only speed row.** Hidden `manual_override` is specifically `1x → 4x → 1x` with 10–60 seconds between the 4x and 1x clicks and no other speed click in between.

`src/game/adminCommands.ts` is the command executor for the console. Keep command effects centralized there so UI buttons and typed commands share behavior.

- Route terminal state changes through `mutateGame()` in React so cloning and derived recomputation stay consistent.
- Keep command history/session transcript and collapsed/expanded UI state in React state only. Do not persist them unless you update `GameState`, factory defaults, migration, and `cloneGameState()`.
- The collapsed admin panel is intentionally a tiny quick-send terminal surface with title, close, command input, and top-center expand arrow. Keep it small enough not to obscure the field.
- Use existing helpers for mutations: `spawnEnemy()` with `state.rng` and `state.timers.tick`, `activateEvent()` for event cards, `pushLog()` for activity entries, and structural damage funnels if damage commands are added later.
- Commands that clear or bypass normal rewards should be explicit and documented in the terminal help text. Silent debug cleanup should not pretend to be a gameplay kill/purge.
- `useGameLoop()` caps catch-up work for 100× admin speed at 180 sim ticks per animation frame. Preserve the cap if you tune high-speed presets so a stalled frame cannot process an unbounded backlog.
