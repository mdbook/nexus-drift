import packageJson from "../package.json";

export const CURRENT_VERSION = packageJson.version;

type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogEntry = {
  version: string;
  badge: string;
  summary: string;
  sections: ChangelogSection[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "3.1.4",
    badge: "Audit Pass — Simulation & Selectors",
    summary:
      "Follow-up patch after a multi-agent audit of the 3.1.3 branch. Timed event modifiers now compose cleanly; late-tier events and their achievements are reachable again; lone-sapper kills go through a shared worker-death helper; dying enemies no longer pressure-feed gameplay; zapper bolts revalidate on impact; `colonyHealth` is normalized; `cloneGameState` clones the RNG; death fades tick once per sim tick; late-game upgrades score into defense; and `elapsedTicks` centralizes the tick-wrap invariant for log age, temp-node despawn, and spawn/despawn fade visuals.",
    sections: [
      {
        title: "Event System",
        items: [
          "Timed event modifiers now compose cleanly. Each event declares multiplicative `modifierContributions` and `state.eventModifiers` is recomputed from the set of active events on activate / expire / admin clear. Before, one event expiring hard-reset every shared key to 1 and silently erased any other active event's contribution.",
          "Late-tier events (`starcall` minTier 6, `null_surge` minTier 7) are reachable again. `stepEvents` gates eligibility on the uncapped `rawTier` now, mirroring the phantom/zapper enemy-weight fix. Previously the gate used the display-capped `tier` (max 5), so both events and the `all_events` / `field_report` achievements were silently unreachable.",
        ],
      },
      {
        title: "Combat & Death",
        items: [
          "A lone sapper that brought a worker to 0 HP no longer leaves a zombie drone frozen on the field. Death bookkeeping is now funneled through a shared `killWorker` helper, called directly from the sapper explosion loop for any worker reduced to ≤0 HP. Before, reboot only kicked off when a live attacker stayed in contact the next tick — but the sapper self-destructs in the same tick, so a single-sapper kill left the worker at `hp=0` with `rebootTicks=0` indefinitely.",
          "Zapper bolts revalidate their target at impact. Mid-flight the target can enter reboot (worker/scout/sentinel destroyed, turret broken) — previously the bolt would still stamp `disabledTicks` + a `Disabled` task onto the rebooting slot, extending the disable into the next active window. The impact path now requires the target to be on-field and operational.",
          "Enemy death fade-outs tick down exactly once per sim tick. `resolveEnemyDeaths` (called twice per tick in `advanceGame` — once after defences, once after worker melee) used to decrement `dyingTicks` on every call, halving the death-fade visual window and the `clickDyingEnemy` achievement window. The per-tick decrement + corpse filter lives in a new `tickDeathFades` that runs exactly once near the bottom of the tick.",
        ],
      },
      {
        title: "Selectors & Scoring",
        items: [
          "Dying enemies (corpses still fading out on-field) no longer pressure-feed gameplay. `enemyCounts`, `combatThreats`, and `corruptorCount` now filter `hp > 0`, and `stepSpawns` counts live enemies against the director's cap. Before, a brief stack of fading corpses inflated threat scoring and stalled spawns just after a clear.",
          "`colonyHealth` is now averaged as `hp/maxHp` over *active* workers and scaled to 0..100. Before, it averaged raw `hp` across every slot — locked slots dragged the reading, and a warden-toughened worker (`maxHp=150`) pushed it above the 0..100 ceiling that every consumer (`hostilePressure`, autobuy triggers, `stable_colony`, director recovery reference) compares against.",
          "`defenseScore` and `weightedUpgradeScore` now include `focusedBeam` and `missileLauncher`. Before, late-game turret/silo investment was silently invisible to the HUD defense/threat ratio and to `homeDevelopment` / city build progression, even as the player poured cores and flux into that tier of the tree.",
        ],
      },
      {
        title: "Invariants & Determinism",
        items: [
          "`cloneGameState` now builds a fresh `Rng` instance from the previous state's seed instead of aliasing the class instance. In the normal advance loop the clone replaces prev each tick so aliasing self-healed, but snapshot tests, replay tooling, and admin preview paths that held a pre-advance clone would see RNG mutations bleed through.",
          "Tick-wrap audit: activity-log age, temp-node despawn, and spawn/despawn fade-in visuals now use a shared `elapsedTicks(now, then)` helper in `utils.ts` that applies the `(now - then + TICK_WRAP) % TICK_WRAP` invariant. Before, after the sim tick counter wrapped at `TICK_WRAP`, old log entries briefly showed `0s ago`, recently-spawned temp nodes could vanish instantly or linger, and spawn/despawn alphas snapped instead of easing across the wrap.",
        ],
      },
      {
        title: "UI Text & Tests",
        items: [
          "Focused Beam upgrade description now reads +6px/level (was +16px/level). The text lagged the 3.1.3 turret-range rebalance that lowered the per-level bonus to 6 and clamped total turret range to `TURRET.rangeMax` — the sim was correct, only the label was stale.",
          "Deflaked the miner-overclock accumulation test by seeding `createInitialGameState` and re-pinning the miner's target each loop iteration. `stepWorkers` retargets on the tick==0 cadence check and `chooseWorkerTarget` draws from `state.rng`, so an unseeded run could silently retarget the miner off its placed node mid-loop.",
          "Test count now 187 (was 163 at the start of the 3.1.3 branch).",
        ],
      },
    ],
  },
  {
    version: "3.1.3",
    badge: "Balance Pass — Range, Pressure, Pacing",
    summary:
      "Mid-game rebalance: turret range hard-clamped well below missile silos so silos own long range while turrets defend a tight perimeter; spawn director softened around defensive investment and field-fill; worker speed transitions tightened so flee speed sits within ~10% of work speed (sprint ability untouched); dev builds now show a BETA pill next to the version and a tinted favicon variant.",
    sections: [
      {
        title: "Turret Range Clamp & Silo Gap",
        items: [
          "TURRET range constants slashed and a hard `TURRET.rangeMax` ceiling added (rangeBase 125 → 110, rangePerUpgrade 15 → 5, rangePerReactor 6 → 2, FOCUSED_BEAM.rangePerLevel 16 → 6, new rangeMax 270). At late game a fully-invested turret tops out at 270 px on a 1000 px field instead of the previous ~460 px.",
          "Damage and cooldown nudged up to compensate for the smaller footprint (`damagePerTurret` 4 → 5, `cooldownPerTurret` 1.4 → 1.7).",
          "Missile silos now scale with `missileLauncher` upgrade level via the new `MISSILE_SILO.rangePerLevel = 6`. Even at L1 the silo (406 px) out-ranges any turret; investment widens the gap further.",
          "FieldSvg silo range ring now reflects the dynamic per-upgrade silo range instead of the static base.",
        ],
      },
      {
        title: "Dev Build Indicator",
        items: [
          "Dev builds (`npm run dev`) now render an amber `BETA` pill next to the version button so the development tab is unmistakable next to a production tab.",
          "Dev builds also swap the favicon to a tinted variant (`public/nexus-drift-dev.svg`, brand purple → amber) and prefix the document title with `[DEV]`. Production builds are unchanged.",
        ],
      },
      {
        title: "Worker Speed Smoothing",
        items: [
          "Tightened the spread between baseline worker movement states so transitions don't feel like gear shifts. Maxed-panic flee multiplier now caps at 1.06× the base (was 1.28×) — flee speed lives within ~12% of work speed (`evadeSpeedBase` 1.1 → 1.0, `evadeSpeedPanicCap` 0.18 → 0.06, `evadePanicDivisor` 180 → 400).",
          "`recoverySpeed` 0.66 → 0.78, `damagedSpeed` 0.66 → 0.82, `traversingSpeed` 0.74 → 0.88 — all three multipliers cluster closer to 1.0.",
          "Sprint cooldown ability and per-worker `speedMod` variance left untouched — those are intentional bursts / spawn-time flavour and remain.",
        ],
      },
      {
        title: "Spawn Director Pacing",
        items: [
          "Defensive interval drag eased so a healthy turret line no longer starves the field (`intervalPerTurret` 4 → 1.5, `intervalPerScout` 3 → 1.0). Pressure now lifts as defences come online instead of cratering.",
          "New field-fill feedback: when live enemies approach the dynamic `enemyCap`, spawn cadence stretches up to 1.85× and decays smoothly back as the field clears (applied AFTER the interval clamp so it can exceed `intervalMax` when truly full).",
          "Recovery mode replaced by a 0..1 `recoveryStrength` scalar; the wave-budget ceiling now lerps from 1.3 → 1.05 instead of binary-flipping. The boolean `recoveryMode` is preserved (threshold 0.4) for log prefixes and the early-break gate.",
          "Combat enemy `minTier` gates lowered so unlocked variety lines up with the slowed-down score curve (rusher 3→2, brute 4→3, sapper 5→4, leech 6→5, phantom & zapper 7→6). Mid-game players see the right roster instead of being stuck on the early lineup.",
        ],
      },
      {
        title: "Follow-ups",
        items: [
          "Phantom and zapper enemy unlocks now actually fire at the documented score. The `minTier` gate in `getCombatEnemyWeights` now keys off an uncapped `rawTier` (score / `tiersPerScore`) instead of the display-capped `tier`, which was clamped at 5 and silently excluded every enemy with `minTier ≥ 6`.",
          "Dev build favicon swap narrowed to the SVG variant only. Production raster icons were being rewritten to `-dev` paths that don't exist on disk; narrowing the regex to `link[rel*='icon'][type='image/svg+xml']` keeps the tinted icon working in SVG-capable browsers without the devtools 404s.",
          "`package-lock.json` refreshed to `3.1.3` (was stuck at `3.0.2`) and stale test-count / release references in `README.md`, `AGENTS.md`, and `handoff.md` updated to match 174 tests. New guidance in `AGENTS.md` Release Work Checklist + Test Count References to keep these in sync going forward.",
        ],
      },
    ],
  },
  {
    version: "3.1.2",
    badge: "Worker Death & Early Pacing",
    summary:
      "Addresses early-game pacing and visual clarity. Early enemies (mite/wisp/raider) no longer camp the city; worker deaths now show a distinct flash and a slow regen reboot instead of instant respawn; scouts and corruption unlock at tier 1. Fixes iPad admin panel safe-area overflow.",
    sections: [
      {
        title: "Early-Game Pacing",
        items: [
          "Mite, wisp, and raider `city` targeting priority set to 0 — early enemies now idle when no workers or defences are nearby instead of camping the home district.",
          "Assault Scout upgrade and corruptor spawning now unlock at tier 1 instead of tier 2, giving players an intercept tool before the corruption wave hits.",
        ],
      },
      {
        title: "Worker Death & Regen",
        items: [
          "Worker deaths now trigger a 6-second regen reboot (`rebootDuration: 180` ticks) using the existing `rebootTicks` infrastructure. HP regenerates linearly from 0 to max over the reboot window; a charging ring in FieldSvg shows progress.",
          "A blue expanding ring (`workerDeathFlash`) is emitted at the death position so it is visually clear when a drone is lost.",
          "Workers no longer teleport home with 55% HP on death — they park at home pad and animate back online.",
        ],
      },
      {
        title: "iPad Admin Panel",
        items: [
          "Admin panel bottom padding now accounts for iOS safe-area-inset-bottom so the panel no longer extends past the screen edge on iPad.",
          "Expanded body max-height reduced from 82dvh to 76dvh for extra clearance when Safari toolbar is visible.",
        ],
      },
    ],
  },
  {
    version: "3.1.1",
    badge: "Warden Polish & Zapper Reach",
    summary:
      "Follow-up patch addressing a post-3.1.0 audit. Relaxes the warden spawn gate so the void_outbreak path stays reachable while still preserving at least one healthy worker, lands the long-documented corrupted-worker toughness buff, fixes healthy-reporter bookkeeping, and extends zapper disruptor bolts to disable scouts and sentinels. Stamps save schema v9 with additive fallbacks.",
    sections: [
      {
        title: "Warden System",
        items: [
          "Warden spawn gate now blocks only when the fleet has ≤ 1 healthy worker remaining (active, not corrupted, not rebooting) instead of the old any-corrupted short-circuit. A 3-worker fleet allows 2 simultaneous corruptions; a 9-worker fleet allows up to 8. Makes void_outbreak (3+ simultaneously corrupted) reachable in practice.",
          "Corrupted workers now take the documented toughness buff on attach: `maxHp = round(workerBaseHp * corruptToughnessMult)` = 150. Baseline is restored on sentinel cleanse and on admin `clearCorruption`.",
          "`clearCorruption` admin path now clamps hp after restoring maxHp so a previously-buffed worker cannot be left with hp > maxHp.",
          "Healthy-reporter exclusion for worker corruption visibility now also excludes rebooting workers (`rebootTicks > 0`), matching the original design note.",
        ],
      },
      {
        title: "Zapper Disruptor Reach",
        items: [
          "Zapper ranged bolts now consider scouts and sentinels as eligible targets via the existing nearest-in-range pick, matching `ENEMY_TARGET_PRIORITY.scout = 0.80` and `sentinel = 0.15`. Bolts apply `disabledTicks` instead of damage — scouts and sentinels idle under the `Disabled` task state until the timer expires, mirroring the worker/turret behavior already in place.",
          "Scouts and sentinels gain a `disabledTicks` field; their per-tick update short-circuits while the timer is positive.",
        ],
      },
      {
        title: "Text & Doc Drift",
        items: [
          "Miner, drill, and bot upgrade effectText entries updated from `sector 12 / 24` to `sector 22 / 42` to match the actual sector gates.",
          "Foundry upgrade effectText updated from `+12% node yield` to `+5% node yield` to match `stepMining`.",
          "handoff.md schemaVersion reference on the example state block updated from 7 → 9, and the warden paragraph now describes the healthy-worker spawn gate.",
        ],
      },
      {
        title: "Save Schema",
        items: [
          "`SCHEMA_VERSION` bumped to 9. `makeScout` and `makeSentinel` stamp `disabledTicks: 0`; `migrateGameState` backfills the field with `?? 0` so older saves load cleanly.",
        ],
      },
    ],
  },
  {
    version: "3.1.0",
    badge: "Field Archive & Correctness",
    summary:
      "Correctness-and-polish release. Adds the in-game Field Archive overlay, closes a batch of sim invariants (sapper damage funnel, worker reporting, TICK_WRAP city regen, kill-stat double-count), and reworks void wardens into permanently cloaked ghosts. Ships accessibility, render-perf, and CI hardening alongside a documented deferred-work list.",
    sections: [
      {
        title: "Field Archive Overlay",
        items: [
          "New lore-first archive overlay covering 42 entries across Field Entities, Resources, Defenses, Sector Operations, and Field Events. Opens from the header ARCHIVE button; purely presentational and never touches sim state.",
          "Left sidebar index + right content pane on desktop; mobile collapses to an index-first view with entry navigation.",
          "Written as atmospheric field dossiers with Field Notes bullets for key behaviors — no stat tables so player discovery through play is preserved.",
        ],
      },
      {
        title: "Simulation Correctness",
        items: [
          "Sapper detonations now route contact damage through the `damageWorker` funnel and skip corrupted or rebooting targets, matching every other worker-damage path.",
          "Worker reporting no longer early-exits after the first tick — reporters now pin `spottedTicks` at max for any corrupted worker they can see every tick, so sentinels keep uninterrupted vision through long cleanse approaches.",
          "City regen gate now uses a modulo-safe `(tick - lastHostileTick + TICK_WRAP) % TICK_WRAP` delta, so the home district does not incorrectly unlock regen after the 10M-tick counter wraps.",
          "Enemy kill statistics now separate `hostileKills` (combat enemies only) from `totalEnemiesKilled`, so corruptor purges and cleanse removals stop inflating the Hostiles Cleared counter.",
          "Turret, scout, sentinel, and city HP defaults are now sourced from `balance.ts` instead of duplicated literals in `factories.ts`, preventing balance drift between initial-state and migration paths.",
          "Save schema stamps `schemaVersion: 8` with a `?? default` migration fallback for every new field.",
        ],
      },
      {
        title: "Void Warden Rework",
        items: [
          "Wardens are now permanently cloaked ghosts. They add a `permanentCloak` flag, reposition continuously like the ghost archetype, and stay invisible to sentinel and scout targeting at all times.",
          "Worker retaliation still reaches wardens during attach attempts, so `warden_killed` remains achievable without exposing wardens to normal combat targeting.",
          "Migration backfills `permanentCloak = true` for wardens in older saves so mid-run saves carry over without regression.",
        ],
      },
      {
        title: "Accessibility & Render Perf",
        items: [
          "Achievements modal gained a proper focus trap, Escape-to-close, `role=\"dialog\"` + `aria-modal`, `aria-labelledby`, and explicit `aria-label`s on its category and close buttons.",
          "Speed buttons now expose `aria-pressed` + `aria-label` so the active speed is announced correctly by assistive tech.",
          "`FieldSvg` is wrapped in `React.memo`, district render data no longer bakes in `game.timers.tick`, and the hexagon geometry helper was hoisted to module scope. Field interaction handlers in `App.tsx` are memoized so identity-stable props reach the memoized field.",
          "`EventChip` collapsed an old duplicated one-shot / timed branch where both arms emitted identical classes.",
        ],
      },
      {
        title: "Stability & Types",
        items: [
          "Agent / Scout / Sentinel `task` fields tighten from `string` to a new `TaskState` union covering every in-sim assignment site. Balance's `WORKERS_AT_HOME` uses the same type.",
          "Worker retarget cadence in `stepWorkers` hashes off `agent.id` instead of the array index, so a worker's retarget window does not silently shift when peers die or reboot.",
          "Added `damageEnemy` tests for shield regen cooldown arming and zero-amount no-ops.",
        ],
      },
      {
        title: "CI & Docs",
        items: [
          "GitLab CI `verify` stage now runs `npm run lint` alongside `typecheck` and `test`, so lint regressions can no longer sneak through on green pipelines.",
          "README gains a Known Deferred Work section anchoring each deliberately-deferred follow-up (computeDerived lift, spatial index, movement split, unseeded Math.random helpers, React 19 upgrade) with matching in-source TODO comments.",
        ],
      },
    ],
  },
  {
    version: "3.0.2",
    badge: "Admin Console",
    summary:
      "Admin tooling release. The hidden panel is now a proper console with shared high-speed presets, scenario buttons, event triggers, shell settings, live diagnostics, and a command terminal for setting up balance and QA scenarios without touching save schema.",
    sections: [
      {
        title: "Admin Console",
        items: [
          "Pressing Space five times now opens a full admin console instead of the old compact speed/event popup.",
          "The console shows live diagnostics for speed, director tier/score, enemy counts, active events, and city integrity.",
          "Quick actions now cover midgame and late-game presets, siege drills, bankroll grants, healing, corruption cleanup, threat clearing, and update-banner preview.",
          "The console can collapse into a tiny quick-send panel with only the admin title, close button, command input, and a top-center expand arrow.",
          "Collapsing and expanding the panel now animates — the card grows up and shrinks down smoothly, and the chevron rotates 180° on toggle.",
          "The collapse/expand chevron now uses the same neutral glass treatment as the close button instead of a contrasting cyan glow.",
          "Event triggers now wrap into multiple rows instead of scrolling horizontally, so all events are visible at once.",
          "On mobile, tapping the version badge five times within two seconds opens the admin console without needing a keyboard.",
          "Event trigger buttons now live in their own left-column section under Shell Settings instead of being attached to the command terminal.",
          "The synthwave visual mode can now be toggled from the console without needing the Konami-code path.",
        ],
      },
      {
        title: "Speed Controls",
        items: [
          "Admin mode extends the existing header speed selector with 10x, 20x, and 100x options, so there is no separate admin-only speed row.",
          "100x mode now runs behind a per-frame catch-up cap so a stalled frame cannot try to process an unbounded simulation backlog.",
          "The public 1x, 2x, and 4x selector remains unchanged until admin mode is opened or an admin-only speed is active.",
        ],
      },
      {
        title: "Command Terminal",
        items: [
          "New admin commands include status, speed, grant, upgrade, level, xp, event, spawn, heal, clear, preset, and banner.",
          "Commands route through the existing mutation and helper paths: events use `activateEvent`, enemy spawns use `spawnEnemy` with the seeded RNG, and log entries use `pushLog`.",
          "Terminal history is session-local React state only; no command state was added to saved games.",
        ],
      },
      {
        title: "Tests",
        items: [
          "Added admin command coverage for resource grants, upgrades, timed-event trigger/revert, seeded enemy spawning, corruption cleanup, speed requests, and banner requests.",
        ],
      },
      {
        title: "Balance",
        items: [
          "Wisps now appear from the very start of a run (tier 0) instead of being gated to tier 1, so early waves include more than just mites.",
          "Raiders start appearing at tier 1 instead of tier 2, adding a third enemy variant well before corruptors arrive.",
          "Scout upgrade is now hidden until tier 2 (the same point corruptors first spawn), so it only shows up when it is actually needed.",
          "Autobuy's emergency scout trigger now aligns with tier 2 to match the new visibility gate.",
          "The third scout slot now requires upgrade level 10 instead of 8, adding a longer ramp between the second and third active scouts.",
        ],
      },
    ],
  },
  {
    version: "3.0.1",
    badge: "Targeting & Warden Hotfix",
    summary:
      "Patch release for the 3.0.0 Balancing & Behavior branch. Enemy target selection now respects deployed/live entity gates, void wardens no longer bank cooldown while blocked, and warden kill credit now reaches the matching achievement.",
    sections: [
      {
        title: "Enemy Targeting",
        items: [
          "Combat enemies now ignore undeployed turret, scout, and sentinel slots when choosing targets.",
          "Corrupted and rebooting workers are no longer valid enemy targets, preventing enemies from stalling on immune or off-field workers.",
          "Stale contact targets are rechecked before damage lands, so rebooting scouts/sentinels and undeployed structures cannot be damaged by old target ids.",
          "City targeting now updates its comparison score correctly, keeping the multi-class picker stable if target evaluation order changes later.",
        ],
      },
      {
        title: "Void Warden Fixes",
        items: [
          "Killing a void warden before it attaches now increments `wardensKilled` and unlocks the matching achievement.",
          "The warden spawn timer now resets while a live warden or corrupted worker blocks the spawn gate, so cooldown cannot bank during an active infestation.",
          "Partial warden attach progress now decays on the worker that actually has stale progress, even if another worker becomes the nearest candidate.",
          "Sentinel cleanse damage now uses a dedicated corrupted-worker damage funnel with clamp and hit-flash handling.",
        ],
      },
      {
        title: "Performance & Coverage",
        items: [
          "Missile silo target selection now uses a single-pass best scan instead of allocating and sorting every tick.",
          "Regression coverage now includes deployed-only enemy target eligibility, corrupted/rebooting worker exclusion, warden cooldown reset semantics, stale attach decay, cleanse damage routing, missile silo activation, city energy modulation, and warden kill credit.",
          "146 tests across four files: 104 in the main simulation suite, 25 AI behavior tests, 10 interaction-achievement tests, and 7 version-check tests.",
        ],
      },
    ],
  },
  {
    version: "3.0.0",
    badge: "Balancing & Behavior",
    summary:
      "Major update stretching Nexus Drift into a true multi-session wallpaper. The economy is 5–8× slower, turrets and scouts can be broken or driven back, sentinels tank real hits and cleanse void-corrupted workers, void wardens stalk isolated miners in late game, and every worker now has a personality — a speed quirk, a fear profile, and a class ability.",
    sections: [
      {
        title: "Progression & Economy",
        items: [
          "Upgrade costs and growth rates have been substantially increased across the board — the second turret is now a ~25-35 minute milestone rather than a sub-10-minute purchase, and late-game slots take multiple real-time hours to reach.",
          "Worker extra-slot unlocks now require both an upgrade-track level and a sector level (level 22 for the second slot, level 42 for the third), and their Flux+Cores surcharges have roughly quadrupled.",
          "XP gain, income rates, enemy wave budget, and mining yields were all scaled to match the stretched timeline — a session that previously peaked in one hour now rewards hours-long and overnight play equally.",
          "Foundry yield was retuned from +12% per level to +5% per level so late-game stacking stays inside the slower economy curve.",
          "Prestige now requires substantially more gold and gems, keeping late-game players invested in defending what they've built rather than refreshing immediately.",
          "New runtime achievement tiers: 4 h, 8 h, and 24 h (legendary). New level gates at 50 and 75.",
        ],
      },
      {
        title: "Turret & Defense Structure HP",
        items: [
          "Turrets now have a structural HP pool. Enemies that reach and hammer a turret can crack it: when HP hits zero the turret breaks for ~80 seconds and respawns at half HP.",
          "Turret HP scales with the turret upgrade track and the shield upgrade. All incoming turret damage flows through a single funnel so future threat types are automatically covered.",
          "Active turret count is now dual-gated by upgrade level and sector level — the second slot opens at sector 2, the third at sector 8 — matching the worker-slot pattern.",
          "Turret targeting now gives a priority bonus to enemies actively chasing workers near the home district, so sentinels don't ignore a brute marching on a miner while picking off stragglers at max range.",
        ],
      },
      {
        title: "Scout HP, Retreat & Speed",
        items: [
          "Scouts now have structural HP and a retreat state: below 50% HP the scout sprints home, heals at the pad, and redeploys once recovered to 90%.",
          "A dead scout reboots for ~20 seconds then respawns at full HP — losing both scouts simultaneously creates a real cleanse vulnerability window.",
          "Scout movement speed increased from 0.60 to 0.78 to offset the awareness overhead of routing around hostile lanes.",
          "Scout pair-up now triggers with two active scouts instead of three, making the multi-scout synergy useful from the moment you buy the second scout upgrade.",
        ],
      },
      {
        title: "Sentinel HP & Cleanse",
        items: [
          "Sentinels now have a much larger HP pool than scouts and don't retreat until 35% HP, reflecting their heavier tank role. They heal faster at the home pad and reboot for ~40 seconds on death.",
          "Sentinels gained a new cleanse priority that overrides normal combat: when a corrupted worker is visible, the sentinel moves toward it and fires a purple beam until the corruption is purged.",
          "Cleansing a worker rewards flux and cores and initiates a worker reboot; the worker returns uncorrupted after a 60-second cooldown.",
          "Sentinel kill credit only registers when the sentinel lands the lethal hit — cleansing a corrupted worker does not count toward sentinel kills.",
        ],
      },
      {
        title: "City HP & Energy Modulation",
        items: [
          "The home district now has a real HP pool. Brutes, leeches, and other enemies can deal structural damage when they reach it.",
          "City integrity directly modulates energy production: full HP gives 100% energy; a fully destroyed district floors at 25%, compounding economic pressure during active sieges.",
          "The district slowly regenerates when no combat enemies are nearby, giving players an incentive to break sieges rather than letting them drag.",
        ],
      },
      {
        title: "Enemies Targeting Structures",
        items: [
          "Combat enemies can now pivot between workers, turrets, scouts, sentinels, and the city based on per-kind priority weights.",
          "Brutes are siege units — they weight turrets and the city higher than before. Sappers prefer turrets. Rushers hunt scouts. Raiders and wisps chip at the city. Phantoms assassinate sentinels.",
          "Contact damage against non-worker targets is filtered by per-class armor: turrets are moderately armored, sentinels very heavily armored, the city lightly armored.",
          "Enemy archetypes (flanker lead, ghost reposition, squad bearing spread) still activate only when targeting workers; structure pursuit uses direct chase.",
        ],
      },
      {
        title: "Missile Silos",
        items: [
          "Missiles have been separated from the turret loop into a dedicated Missile Silo upgrade track.",
          "Silos fire long-range, slow-cadence shots: 400 px range (roughly 3× turret range), ~16-second reload, and high base damage that scales with the silo upgrade level.",
          "Silo missile physics differ from the old turret missiles — more speed, less steering, longer flight time — so they feel like long-range artillery rather than guided turret shots.",
          "Base turrets now always fire instant-hit beams. The Focused Beam upgrade extends turret acquisition range instead of switching fire modes.",
          "Autobuy includes the missile silo track and fast-tracks the first level when brutes or leeches are active.",
        ],
      },
      {
        title: "Worker Abilities & Variance",
        items: [
          "Each worker now has a seeded personality: speed variance (±12%), fear variance (±20%), and a harvest bias (±15%) that tilts the individual toward or away from their preferred node tier.",
          "Miners accumulate an overclock bonus while continuously mining without taking damage — after 120 ticks the crit chance for the next mining hit increases by 10%.",
          "Runners gain a sprint burst when evading with high panic: 1.5× speed for 90 ticks once every 600 ticks.",
          "Drones passively discount the corruption avoidance penalty for resource nodes they're within scan range of, slightly broadening safe harvesting options near moderate corruption.",
          "All workers deal light retaliation damage to attackers when not in recovery. Damage scales with the bot upgrade track.",
          "Worker evasion persistence now cascades super-linearly with enemy count — a single pursuer barely extends the evade timer, but a real surround compounds hard.",
        ],
      },
      {
        title: "Void Warden Corruption",
        items: [
          "A new late-game threat arrives at tier 4+: the Void Warden — a slow, tanky infester that bypasses normal combat and seeks isolated workers.",
          "If a warden reaches a worker and stays adjacent for ~7 seconds, the worker becomes void-corrupted: it freezes in place, drains nearby resource nodes, and can only be destroyed by sentinel cleanse beams.",
          "Corrupted workers are immune to enemy contact damage and turret/scout fire. They render with a purple body, a pulsing void ring, and a position shake that intensifies over time.",
          "Healthy workers within reporting range of a corrupted ally flag the infestation, making it visible to sentinels across the full map even beyond the sentinel's vision radius.",
          "Wardens spawn on their own 2-minute timer, not through the normal wave budget, and at most one warden and one corrupted worker are active at a time.",
          "Killing a warden before it attaches counts toward combat stats. Successful attachment removes the warden without rewards — so letting it attach is always the worse outcome.",
        ],
      },
      {
        title: "Achievements",
        items: [
          "Four new corruption-category achievements: First Light (first cleanse), Cut the Thread (kill a warden before it attaches), Quarantine Protocol (5 cleanses in one run), and Void Outbreak (legendary — survive with 3+ simultaneously corrupted workers for 30 continuous seconds).",
          "Four new long-session survival achievements: 4 h, 8 h, and 24 h runtime milestones plus sector level 50 and level 75 progression gates.",
          "58 achievements total.",
        ],
      },
      {
        title: "Tests & Architecture",
        items: [
          "138 tests across four files: 96 in the main simulation suite covering all new subsystems, 25 AI behavior tests, 10 interaction-achievement tests, and 7 version-check tests.",
          "New subsystem: workerCorruption.ts (warden attach, node drain, worker reporting).",
          "New subsystem: missileSilos.ts (silo targeting, fire cadence, damage).",
          "advanceGame step order extended with stepWardenSpawn (after stepSpawns) and stepWorkerCorruption (after stepCorruption).",
        ],
      },
    ],
  },
  {
    version: "2.4.5",
    badge: "Surround Pressure",
    summary:
      "Worker survival and combat-readability release. Workers now take harder punishment when they get properly boxed in, live enemy bodies slow escape routes, and shielded enemies read as a real two-layer threat instead of a single mixed health bar.",
    sections: [
      {
        title: "Combat Pressure",
        items: [
          "Worker combat detection widened slightly so close-range contact starts registering sooner.",
          "Incoming worker damage now scales up when multiple attackers are already in contact, making true surround situations much harder to escape cleanly.",
          "The multi-enemy pressure change stays scoped to close combat; it does not alter worker flee logic or node selection rules.",
        ],
      },
      {
        title: "Worker Blocking",
        items: [
          "Live enemy hitboxes now slow workers down before contact, so crowded lanes trim forward progress instead of letting crews slide through bodies at full speed.",
          "Enemy bodies only slow movement and prevent easy lane slipping; they no longer apply a hidden knockback force that shoves workers away from the threat.",
          "Only live enemies block movement; dying enemies still fade out visually without continuing to affect the sim.",
          "Worker target scoring and flee-direction retargeting now explicitly ignore death-fade enemies so visual corpses cannot scare workers off useful nodes.",
        ],
      },
      {
        title: "Shield Layer",
        items: [
          "Shielded enemies now show a distinct cyan shield bar above their HP bar, plus a ring/glow overlay that makes the outer layer obvious in the field.",
          "Shield damage is consumed before HP, but overflow no longer spills through to health in the same hit. Once a shield breaks, the next hit is what starts cutting HP underneath.",
          "All shield-carrying enemies still have normal HP underneath the shield layer; the shield is a buffer, not the whole health pool.",
        ],
      },
      {
        title: "Tests",
        items: [
          "Added coverage for heavier multi-attacker worker damage, worker-vs-enemy blocking, shield-first damage routing without HP spillover, and worker targeting around death-fade enemies.",
        ],
      },
    ],
  },
  {
    version: "2.4.3",
    badge: "Flee Routing",
    summary:
      "Worker routing follow-up for the commitment pass. When a worker has been pushed off a node and is coasting through the last safe part of an evasion path, it now looks for a useful resource node ahead instead of blindly returning to the abandoned assignment. Workers are also a little more stubborn at active nodes: light enemy pressure no longer forces a retreat until damage actually lands, while target selection now penalizes nodes with clustered hostiles nearby.",
    sections: [
      {
        title: "Worker Routing",
        items: [
          "Workers in persistent evasion now scan along their flee direction once immediate threats clear.",
          "If a safe node is ahead within the flee lane, the worker can retarget to it while still moving away, reducing wasted travel after being forced off a resource.",
          "The scan rejects nodes behind the worker, far off the flee lane, too far ahead, or behind a threatened path, so panic movement still prioritizes survival.",
          "Harvesting workers now hold position under one or two nearby enemies until they actually take damage; three or more nearby enemies still force an early retreat.",
          "Worker target scoring now adds an explicit close-enemy count around each node, so a crowded resource becomes less attractive even before the path threat score dominates.",
        ],
      },
      {
        title: "Tests",
        items: [
          "Added worker-AI coverage for safe flee-direction retargeting, blocked-path refusal, stubborn harvesting under light pressure, swarm-triggered retreat, and crowded-node avoidance.",
        ],
      },
    ],
  },
  {
    version: "2.4.2",
    badge: "Commitment Pass",
    summary:
      "Field-feel patch for the 2.4 line. Turret missiles now get a small terminal grace window after launch without ever retargeting, brutes keep their target long enough to stop twitching, workers commit much harder to resource nodes, and corruption residue lingers longer so purge pressure is easier to read.",
    sections: [
      {
        title: "Field Feel",
        items: [
          "Turret missiles remain locked to their original target, but now get a small launched-flight grace radius so shots that arrive just behind a moving enemy still connect.",
          "If the original target dies right before impact, a missile close to that death-fade position now resolves cleanly there instead of feeling like it vanished a frame early.",
          "Missiles still never retarget, never splash onto another enemy, and still fizzle if the original target cloaks, disappears, or dies outside the small grace radius.",
          "Brutes now hold a valid target for short refresh windows, smoothing slow tank movement and reducing path jitter while preserving their direct-march pressure.",
        ],
      },
      {
        title: "Worker Commitment",
        items: [
          "Workers now treat distant hostiles as less urgent: proactive evade range, harvesting evade range, path-fear scoring, and panic persistence were all trimmed so crews stay on resources longer.",
          "Partially mined current targets now get a stronger finish bias, so workers are less likely to abandon nearly completed nodes for a fresh deposit unless the alternative is clearly better.",
          "Recently worked resource bars now leave a fading ghost segment and small deterministic particles over the mined portion, making interrupted progress fade visually instead of simply snapping smaller.",
          "Resource nodes do not regenerate mined HP from idleness; the new deterioration cue is visual only.",
        ],
      },
      {
        title: "Corruption Linger",
        items: [
          "Passive corruption cleanup now runs more slowly, leaving toxic residue on the field longer after corruptors detach or die.",
          "Scout cleansing, purge rewards, corruption spread, and active anti-corruption upgrade value are unchanged.",
        ],
      },
      {
        title: "Tests",
        items: [
          "Added coverage for missile terminal grace/no-retarget behavior, slower corruption residue cleanup, brute target stability, worker harvesting commitment, and partially mined target stickiness.",
        ],
      },
    ],
  },
  {
    version: "2.4.1",
    badge: "AI Polish",
    summary:
      "Correctness and feel pass on the 2.4.0 AI overhaul. Worker panic duration trimmed so drones return to nodes faster after clearing a threat, scouts stay away from field edges, and enemy squads now visibly spread to six distinct approach angles instead of collapsing to two. Group dispersal is also now ordering-consistent — same-kind workers push apart uniformly regardless of spawn order.",
    sections: [
      {
        title: "Behavior Fixes",
        items: [
          "Worker panic duration reduced from 80 → 70 ticks. Regroup centroid bias partially offsets drift during prolonged evasion, but workers now return to nodes more reliably after mid-field skirmishes.",
          "Scouts now apply soft edge-repulsion nudges in all three movement paths (sweep, standby, patrol), preventing them from drifting into screen corners and getting stuck.",
          "Enemy squad bearing spread now uses real 60° world-space angles (6 distinct buckets) instead of collapsing to a ±1 parity toggle — squads visibly encircle their target rather than splitting into just two approach lanes.",
          "Same-kind group dispersal is now compute-then-apply: all workers read the same post-movement snapshot before any repulsion is written, so early workers no longer push later workers' centroids during the same tick.",
        ],
      },
      {
        title: "Code Quality",
        items: [
          "GitLab container release builds now only run automatically on main and dev. Main publishes the commit SHA plus :latest, while dev publishes the commit SHA plus :dev.",
          "Worker target scoring moved from factories.ts into src/game/ai/workerTargeting.ts, removing the inverted factories → subsystems import dependency.",
          "Worker AI helpers (threat memory, anti-corner evasion, region pull, group dispersal) consolidated into src/game/subsystems/workerAI.ts.",
          "Contested-node map and nearby-ally counts are now precomputed once per call rather than recomputed per candidate, reducing O(n²) work per enemy tick.",
          "16 tests in aiBehavior.test.ts now cover worker path safety, archetype targeting, squad bucketing, sentinel intercept priority, scout finish-bias, sticky retarget, ambusher dash, ghost reposition, group dispersal, save migration, and threat-field path weighting.",
        ],
      },
    ],
  },
  {
    version: "2.4.0",
    badge: "AI Overhaul",
    summary:
      "Workers, enemies, sentinels, and scouts all picked up proper judgement. Workers now have individual personalities and field territories — miners push left and brave threats, runners roam mid-field, drones work the right sector and play it safe. Same-kind group dispersal, low-hp regional homing, and smoother evasion curves round out the worker feel. Enemies split into archetypes — flankers arc in, ambushers stalk then dash, ghosts reposition behind workers during cloak, and same-squad attackers spread across bearing buckets for emergent flanking. Sentinels intercept between threats and their worker victims, and scouts weight corruptor kills by corruption rate while alternating between finish-the-node and stop-the-bleed cleanse priorities.",
    sections: [
      {
        title: "Worker Personalities & Territories",
        items: [
          "Each worker kind has a preferred field region: miners claim the left sector, runners roam the mid-field corridor, drones occupy the right. Node scoring adds a region-distance penalty so workers stay in their zone unless a clearly better node pulls them out.",
          "Per-kind courage: miners have a 0.6× path-fear scale (will cut through moderate threat), drones are 1.3× cautious and take safer routes, runners are in between.",
          "Same-kind group dispersal: when 2+ peers of the same kind cluster within the worker's groupRepelRadius, a centroid-repulsion force scales with crowd size — so 4 miners bunched together are pushed apart harder than 2.",
          "Low-hp regional homing: below 50% HP (hurt but not yet in full recovery), workers nudge toward their region center each tick — injured miners drift left, drones right — instead of all streaming to the same home pad.",
          "Workers already at their node now hold their ground until an enemy closes within 56 px (down from 92), so they finish a harvest under pressure if they have a clear line out.",
          "Evasion direction blend shifted to 70/30 old/new (was 45/55) and persist ticks extended to 80 (was 48), producing smooth flight curves instead of per-tick direction snapping.",
          "Retarget interval extended and sticky threshold tightened — a candidate needs a 28% score advantage (was 15%) to override the current node assignment.",
        ],
      },
      {
        title: "Worker AI",
        items: [
          "Target selection scores nodes by path safety (sampled along start/midpoint/destination), progress bias (freshly respawned or already being mined), corruption tolerance (non-miners hard-avoid heavily corrupted nodes), and contested-by-evading-workers penalty.",
          "Contested penalty is now quadratic — a second worker on a node is tolerable, a third is a strong deterrent, so workers spread across nodes rather than piling on the best one.",
          "Evasion adds anti-corner logic — when a projected flight path would hit a wall, the escape vector rotates to the lowest-threat candidate heading.",
          "Per-worker threat memory (EMA of nearby enemy weight) drives the regroup trigger and scales panic with sustained exposure.",
        ],
      },
      {
        title: "Enemy Archetypes",
        items: [
          "Direct archetype (mite, rusher, brute) pursues straight; brutes now anchor and ignore crowding so they march through groups instead of orbiting.",
          "Flankers (raider, wisp) aim at the worker's predicted future position, blending a tangential component so they arrive along an arc.",
          "Ambushers (sapper) approach slowly until they close inside the dash trigger, then burst at ~1.8× speed for a short window.",
          "Ghosts (phantom) reposition behind the worker's movement vector during the cloaked portion of the cycle.",
          "Same-squad enemies (spawned within the same tick bucket) share a squad id and pick bearing buckets with the fewest competitors, producing emergent flanking.",
          "Target selection is archetype-aware — direct archetypes prefer wounded or stationary workers; flankers and ambushers prefer isolated, unalert workers; zappers prefer targets with fewest nearby allies and fewest hostile competitors.",
        ],
      },
      {
        title: "Sentinels",
        items: [
          "Target priority weighs the threat's distance to the nearest worker, not just distance to the sentinel. A brute near a worker outranks a closer brute that's drifting alone.",
          "Move to an intercept point between the threat and that threat's worker victim (predicting worker position forward by SENTINEL_AI.interceptLeadTicks) so sentinels feel like bodyguards instead of chasers.",
          "Patrol position blends homeX with the active-worker centroid so late-game workers deployed off-center still receive cover.",
        ],
      },
      {
        title: "Scouts",
        items: [
          "Corruptor scoring now multiplies by the corruptor's per-tick rate (blights count extra) and the corruption level of the node they're attached to — a blight on a 95%-corrupt node is now a priority kill.",
          "Node cleansing alternates between finish-job bias (nodes near the cleanse threshold) and stop-bleed bias (nodes actively being corrupted) based on which pile is larger.",
          "Pair-up routes a second scout onto any node over the pair threshold once three or more scouts are live, so multi-scout synergy actually fires on the worst nodes.",
        ],
      },
      {
        title: "Balance & Save",
        items: [
          "New balance blocks: AI_THREAT, ENEMY_ARCHETYPE, ENEMY_AI, WORKER_AI, SENTINEL_AI, SCOUT_AI — all existing constants preserved.",
          "Schema bumped to 5; old saves migrate in place with default values for the new entity fields (ResourceNode.workTicks, Agent.threatMemory, Enemy.archetype/squadId/dashTicks).",
        ],
      },
    ],
  },
  {
    version: "2.3.3",
    badge: "Signal Trim",
    summary:
      "Small HUD polish patch plus a shell-and-balance trim. One-shot event cards keep their distinct short-lived card treatment without the oversized explanatory label or visible countdown, extra worker slots now wait for much later colony progression and premium resource unlocks, and the shell now checks `/version` for newer live builds so players can refresh into updates without guessing.",
    sections: [
      {
        title: "Tourist Click Polish",
        items: [
          "Clicking the tourist drone now keeps only the squish animation.",
          "The oversized white outline that briefly appeared around the tourist on click has been removed so the interaction reads as a tiny in-world easter egg instead of a selected UI control.",
        ],
      },
      {
        title: "Live Update Banner",
        items: [
          "The app shell now polls `/version` roughly every 5 minutes and again when the tab regains focus, then extracts a flat `x.y.z` version string from the response body.",
          "If that live version is newer than the currently running build, a banner appears with `Refresh`, `Close`, and `Don't Show Again` actions.",
          "The `Don't Show Again` action is intentionally session-only; it hides the current live version until reload or a newer version appears, but does not touch save data or add another persisted user setting.",
          "The hidden admin panel now includes a `Show Update Banner` action so the live-update banner can be exercised on demand without waiting for a real deploy.",
        ],
      },
      {
        title: "Worker Progression",
        items: [
          "Extra miner, runner, and drone bodies no longer appear as soon as their upgrade track hits level 3 / 6.",
          "Second and third worker slots now also require sector levels 12 and 24, turning multi-worker tracks into deliberate mid-to-late and late-game unlocks instead of an early snowball.",
          "Those two slot-unlock purchases now also charge both Flux and Cores, so expanding the roster competes with other late-game systems instead of being a pure gold check.",
          "Upgrade tile copy now calls out the sector-level and premium-resource gates directly so the delayed deployment reads as intended rather than feeling like a hidden rule.",
        ],
      },
      {
        title: "Turret Missile Tuning",
        items: [
          "Homing missiles no longer retarget when their chosen enemy dies first.",
          "Instead, a missile whose target dies or cloaks before impact now fizzles out immediately, trimming the accidental follow-through damage that made the missile buff read too hot.",
        ],
      },
      {
        title: "Missile Click Interaction",
        items: [
          "Clicking an in-flight missile to unlock `Warhead Whisperer` now freezes the missile gold in place for 1 second, then detonates it in a spreading gold starburst explosion that awards 50 gold.",
          "After a successful click, all missiles become non-interactive for 30 seconds before the next shot is eligible.",
          "The white border that briefly appeared around clicked missiles has been replaced by the full gold-freeze and explosion sequence.",
        ],
      },
      {
        title: "Event Card Copy",
        items: [
          "Removed the extra `ONE SHOT SIGNAL` label from one-shot event cards.",
          "Removed the visible duration counter from one-shot cards so they no longer read like timed modifiers.",
          "One-shot cards now linger for their HUD lifetime, then fade out smoothly instead of showing a ticking countdown.",
          "One-shot events now use the same compact chip size as normal timed events instead of the larger custom card footprint.",
          "Event chips now refuse to shrink or wrap under heavy overlap, so crowded lanes stay as a horizontal scroller instead of collapsing labels into stacked multi-line pills.",
          "Clicked event cards now keep the inspection state subtle by dimming their existing leading dot instead of adding extra labels or badges.",
          "The click feedback itself is now a small pond-ripple pulse centered on that leading dot instead of a louder full-card pulse.",
          "Polished the desktop top-right upgrade rail spacing so it sits closer to the sector card and no longer crowds the resource row, and slimmed its horizontal scrollbar to reduce chrome weight.",
          "The in-field achievement ribbon now renders newest unlocks first, so fresh badges appear on the left edge and push older ones rightward.",
          "Clicking an achievement badge in that ribbon now opens the archive already filtered to the right category, scrolls the matching row into view, focuses it, and flashes it for quick orientation.",
          "That target-row glow now pulses twice instead of holding as a static cyan halo, making the landing point easier to catch at a glance.",
          "The cyan target glow now also fades all the way back out at the end of that pulse cycle instead of snapping off abruptly.",
          "Event chip tooltips now show a rarity label (Common / Uncommon / Rare / Legendary) below the event name, derived from each event's spawn weight.",
        ],
      },
    ],
  },
  {
    version: "2.3.0",
    badge: "Hidden Signals",
    summary:
      "Late-game pressure and secret-interaction pass. Leeches still bypass worker targeting and charge the home district directly, late-game shields still add a sustained-fire check, and the release now layers a much broader click-driven hidden system on top: inspectable event cards, one-shot event linger/backdrops, a recoverable broken drone, anomaly/projectile/corpse targets, tourist repeat-click chains, and UI/speed-sequence secrets.",
    sections: [
      {
        title: "Leech Homing Behavior",
        items: [
          "Leeches now bypass worker targeting entirely and drive straight for the home district (500, 490) as soon as they spawn. The drain mechanic is unchanged — once within 100 px of the home anchor they start siphoning gold and energy every combat tick.",
          "This makes leech pressure read clearly on the battlefield: a lone leech cutting a lane to the colony is an obvious turret/sentinel priority call, rather than a vague chaser mingling with other hostiles.",
        ],
      },
      {
        title: "Enemy Shields",
        items: [
          "Three late-game enemies now carry a regenerating shield layer that absorbs damage before their HP pool: phantom (10-HP shield, HP unchanged), zapper (20-HP shield, HP cut from 45 → 35), leech (50-HP shield, HP cut from 70 → 30).",
          "All turret, sentinel, scout, and focused-beam damage now flows through the new `damageEnemy()` helper in `enemyUtils.ts`, which deducts from the shield first and spills overflow into HP. This preserves existing balance intent while adding a fresh meaningful defensive layer.",
          "Shields regenerate at 0.25 HP/tick after 90 ticks (~3 s) without taking damage. Any hit — to shield or raw HP — resets the regen delay, so sustained fire prevents regen while strafing or pauses in incoming fire let shields recover.",
          "New render pass: shielded enemies show a dashed cyan ring whose opacity tracks current shield %, a soft blue outer glow, and a thin shield bar above the HP bar. Regenerating shields pulse subtly to telegraph recovery.",
          "Sentinel kill-credit now checks effective lethal damage after shield absorption, so shield-absorbed hits don't falsely award sentinel kill achievements.",
          "Save migration adds shield fields with full-shield defaults so mid-combat saves from before this change don't load with 0-shield enemies.",
        ],
      },
      {
        title: "Event Cards & One-Shots",
        items: [
          "All 12 event defs now share the same inspectable footer lane. Timed events stay as the familiar pill-style cards, while the 3 one-shot events (`Cache Discovery`, `Pirate Caravan`, `Echo Signal`) now linger for about 10 seconds as dedicated cards instead of disappearing immediately after their mechanical effect fires.",
          "Mechanical duration and HUD visibility are now split: `durationTicks` still controls gameplay modifiers, `hudDurationTicks` controls how long the event card/backdrop stays visible, and `ActiveEvent.revertOnExpire` distinguishes revertable timed effects from display-only one-shots.",
          "Each of those one-shot cards now also gets its matching short-lived backdrop again because the footer/event-backdrop stack keys off the same active-event entries.",
          "New inspection secrets hang off this lane: `Field Report` requires clicking all 12 event surfaces, `Stormwatch` triggers on `Dust Storm` or `Solar Flare`, and `Strange Tides` now keys off the full current event list instead of the older hard-coded 7-event count.",
        ],
      },
      {
        title: "Interactive Secrets",
        items: [
          "The tourist drone still unlocks `Taking Notes` on first click, but it now stays clickable after discovery, plays a short squish/bounce response on press, tracks distinct passes across the field for `Tour Guide`, and tracks total clicks for the legendary 50-click secret.",
          "Lost Drone is no longer passive. A damaged, cracked, greyed-out drone can now drift through the outer zone on late-game big-event rolls; clicking it recovers the unit, clears the field prop, unlocks the hidden achievement, and permanently adds an extra drone beyond the normal slot system.",
          "The old passive 3-event-stack secret is now an explicit field target: when 3 event cards overlap, a dedicated anomaly artifact appears until clicked. Additional field-only secrets now unlock from clicking zapper bolts, in-flight turret missiles, and enemies during their death-fade window.",
          "The shell now contributes secrets too: opening the achievements modal after finding a hidden achievement unlocks `Archivist`, clicking the version badge unlocks `Patch Notes`, and `Manual Override` requires the exact `1x -> 4x -> 1x` speed sequence with a 10–60 second wait before the reset click.",
        ],
      },
    ],
  },
  {
    version: "2.2.12",
    badge: "True Viewport",
    summary:
      "Fixes the field card footer — active events (Signal Drought, Xeno Bloom, etc.), FieldStatsStrip, and the upgrade rail — being invisible on iPadOS landscape. Two cooperating bugs: the app shell used `100svh` which WebKit misreports when the URL bar is present, and the field card had no explicit height so it could grow taller than its grid cell and push its absolute footer off-screen.",
    sections: [
      {
        title: "iPad Event HUD Fix",
        items: [
          "The field card now has `lg:h-full overflow-hidden` so it is hard-clamped to its grid cell height at the desktop breakpoint. Without this, the card could grow past the viewport bottom, taking its `absolute bottom-0` footer — events, stats strip, upgrade rail — with it, where it was clipped by the grid's `overflow-hidden`.",
          "The app shell now uses `100dvh` (dynamic viewport height) instead of `100svh`. WebKit misreports `svh` on iPadOS when the URL bar is visible, returning the full physical height rather than the visible area. `dvh` tracks the actual usable viewport and is supported on Safari 15.4+ (all currently shipping iPadOS versions).",
          "The `lg` footer inset is now calibrated to the actual footer height (stats strip only at `lg` since the upgrade rail is hidden): `lg:mb-[83px]` with active events, `lg:mb-[42px]` without. This removes the gap that appeared between the canvas and the events bar after the card height was clamped.",
        ],
      },
      {
        title: "Events Bar & Title Polish",
        items: [
          "The events bar is now always visible in the footer. When no events are active it shows a muted 'No ongoing events' placeholder so the footer height — and therefore the canvas size — stays stable instead of jumping when events start or end.",
          "The title reflows: 'NEXUS DRIFT' stays at full size, '//' acts as a tall inline divider, and 'purge wing online' sits inline at a smaller size with a downward offset so it tucks beneath the slashes without consuming extra vertical space.",
        ],
      },
    ],
  },
  {
    version: "2.2.11",
    badge: "Visible Chrome",
    summary:
      "Top-chrome controls now stay accessible on smaller screens, iPad desktop layouts reserve enough space for live events without clipping the field, and the favicon stack now covers more browsers with PNG, ICO, touch-icon, and manifest fallbacks.",
    sections: [
      {
        title: "Responsive Controls",
        items: [
          "Public speed controls and the New Game action now stay in the header chrome on every breakpoint instead of dropping below the field on smaller screens.",
          "The desktop top-right upgrade rail now opens its tooltips downward, matching its new position near the top of the viewport.",
        ],
      },
      {
        title: "Footer HUD Fit",
        items: [
          "The app shell now uses dynamic viewport sizing (`100dvh`) plus safe-area bottom padding, replacing the earlier `100svh` sizing that WebKit misreports on iPadOS Safari when the URL bar is visible — the field card and its absolute footer now stay inside the visible viewport.",
          "Active events are now anchored inside the footer HUD stack itself instead of living in card flow, so the event strip remains visible across all breakpoints.",
          "The field now reserves extra bottom inset above the overlay footer on every breakpoint, keeping the event HUD visible without chopping it off at the bottom edge.",
        ],
      },
      {
        title: "Favicon Compatibility",
        items: [
          "Added multi-format favicon links in `index.html`: SVG, ICO, 32px PNG, 16px PNG, `shortcut icon`, Apple touch icon, and a web manifest.",
          "Shipped generated `favicon.ico`, `favicon-32x32.png`, `favicon-16x16.png`, `apple-touch-icon.png`, and `site.webmanifest` assets so older browsers have a non-SVG fallback path.",
        ],
      },
    ],
  },
  {
    version: "2.2.10",
    badge: "Clear Margin",
    summary:
      "Desktop iPad layout now keeps the footer and top-chrome HUD visible without covering the field, and a new coarse-pointer low-FX path removes the Safari lag regression that the earlier layout pass exposed.",
    sections: [
      {
        title: "iPad Safari Performance",
        items: [
          "New `useLowFxMode` detects coarse-pointer `lg` desktop layouts such as iPadOS landscape Safari and lets the presentation layer swap to cheaper FX without touching gameplay.",
          "The base background and event backdrops now use static gradient / glow variants in that mode instead of the most expensive moving starfield, particle-loop, and long-lived blur animation paths.",
          "Field labels keep their readable foreground text but drop the extra SVG blur shadow in low-FX mode, removing an expensive filter pass from the battlefield render.",
        ],
      },
      {
        title: "iPad Desktop Layout Fit",
        items: [
          "On `lg` layouts, the field footer stays as an overlay for performance instead of moving into normal flow.",
          "The battlefield now reserves bottom inset space above that overlay, which preserves the city/home strip on iPadOS landscape and keeps the crews/integrity/combat rail fully visible.",
          "The upgrade indicator rail now moves out of the footer and into an absolutely-positioned top-right desktop chrome band, so it no longer pushes the resource bar or shrinks the battlefield.",
          "This avoids the heavy relayout path that made the earlier iPad desktop fix laggy while still preventing the footer from hiding field content.",
        ],
      },
      {
        title: "Branding Metadata",
        items: [
          "The site favicon and touch icon now use the branded `nexus-drift` mark.",
          "Social embeds continue using the existing `og-image.png` artwork, so link previews keep the wide hero image instead of switching to the favicon.",
        ],
      },
      {
        title: "Project Chrome",
        items: ["The top metadata row now includes a direct GitLab source link beside the version badge."],
      },
      {
        title: "Contributor Tooling",
        items: [
          "The full `.claude/` directory is now treated as local tooling noise and removed from repo tracking, so editor/agent settings stay local while GitLab keeps project source clean.",
        ],
      },
    ],
  },
  {
    version: "2.2.7",
    badge: "True Signal",
    summary:
      "Achievement tracking is now aligned with real gameplay outcomes: synthwave unlocks its own secret badge, purge milestones count cleansed nodes, sentinel kills require a lethal sentinel hit, and Immaculate Grid no longer auto-completes on a fresh save.",
    sections: [
      {
        title: "Achievement Integrity Fixes",
        items: [
          "Konami synthwave now unlocks the hidden `synthwave` achievement instead of incorrectly granting `drift_heard`.",
          "Purge achievements now count completed node cleanses rather than corruptor deaths.",
          "Sentinel kill credit is awarded only when a sentinel lands the lethal hit, eliminating false positives from shared targets.",
          "Immaculate Grid now requires every active worker to be at full health while hostiles are actually on the field.",
        ],
      },
      {
        title: "Scout Cleanse Follow-Through",
        items: [
          "Scouts now keep sweeping partially-cleaned nodes until they cross the cleanse threshold instead of abandoning them once residue drops below the old targeting cutoff.",
          "This makes cleanse completion, purge stats, and related achievements internally consistent again.",
        ],
      },
    ],
  },
  {
    version: "2.2.6",
    badge: "Locked On",
    summary:
      "Turrets now fire visible homing missiles instead of instant shots. A new Focused Beam upgrade (tier 4+) unlocks instant-hit fire for close targets while missiles handle the longer range.",
    sections: [
      {
        title: "Turret Missile Rework",
        items: [
          "Turrets default to firing homing missiles that travel visibly and steer toward their target each tick; damage is applied on impact rather than instantly.",
          "Missiles receive a 15% damage bonus to preserve DPS relative to the previous instant-shot baseline.",
          "Missiles fizzle harmlessly if their target dies or cloaks mid-flight.",
          "Missile render: a tiny rocket figurine (red nose, grey body, red fins, orange engine flame) that rotates to face its heading.",
        ],
      },
      {
        title: "Focused Beam Upgrade",
        items: [
          "New `focusedBeam` upgrade track (minTier: 4, cost: 600g + 2 cores, growth ×1.35). Unlocks instant-hit beam fire for targets within base 90px + 8px per level.",
          "When the target is within beam range, the turret fires instantly (classic behaviour); beyond beam range it falls through to the missile path.",
          "The beam's short range ensures missiles remain relevant as the base turret range scales up late-game.",
        ],
      },
    ],
  },
  {
    version: "2.2.5",
    badge: "Crowded House",
    summary:
      "Each worker kind can now field up to three units — slots unlock at upgrade levels 3 and 6. Workers spawn at staggered home pads and activate or deactivate as upgrade levels change.",
    sections: [
      {
        title: "Multiple Workers Per Kind",
        items: [
          "Miner, runner, and drone tracks each support three simultaneous units. Slot 2 unlocks at upgrade level 3, slot 3 at level 6.",
          "All nine agents are pre-allocated in the initial state; inactive slots consume no CPU — movement, mining, combat, and rendering skip them.",
          "New `stepWorkerSlots` subsystem reconciles active count against the current upgrade level each tick; newly unlocked agents deploy from staggered home pads.",
          "Home pads offset by ±28 px horizontally per slot so workers don't stack at spawn.",
          "Schema version bumped to 3; `migrateGameState` defaults `active` to `true` for each kind's first agent in existing saves.",
        ],
      },
    ],
  },
  {
    version: "2.2.4",
    badge: "Informed Colony",
    summary:
      "Tooltip coverage pass — every interactive surface now explains itself on hover or focus, backed by a shared Tooltip primitive that replaces three hand-rolled implementations.",
    sections: [
      {
        title: "Tooltip System",
        items: [
          "New `useTooltip` hook in `src/hooks/useTooltip.ts` and `TooltipPanel` component in `src/components/Tooltip.tsx` extract the common hover/focus + position:fixed portal pattern shared by all HUD tooltips.",
          "EventChip, FieldStatsStrip, and UpgradeIndicatorRail refactored to use the primitive — same visual behaviour, ~80 fewer duplicated lines across those three files.",
          "Speed preset buttons (1×, 2×, 4×) now show a tooltip explaining what each multiplier does.",
          "New Game button shows a tooltip warning that it wipes the save.",
        ],
      },
    ],
  },
  {
    version: "2.2.3",
    badge: "Breathing Room",
    summary:
      "Enemies no longer pile on a cornered worker — a soft-repulsion pass makes them orbit at staggered angles instead of collapsing to zero distance.",
    sections: [
      {
        title: "Enemy AI — Soft Repulsion",
        items: [
          "Combat enemies now check how many other enemies are already contesting the same target within a 55px personal-space radius.",
          "If 2 or more enemies are crowding, this enemy blends its pursuit vector 60/40 with a tangential orbit component, arriving at a staggered angle rather than piling directly on top.",
          "Crowded enemies also hold 10px further back from the target than normal, giving cornered workers breathing room to evade.",
        ],
      },
    ],
  },
  {
    version: "2.2.2",
    badge: "Pressure Front",
    summary:
      "Five new events fill the event roster with threat-tone pressure: three sustained modifiers and two rare late-game shocks.",
    sections: [
      {
        title: "New Events",
        items: [
          "Core Breach (threat, tier 2): energy halved and corruption spread up 40% for 60s. Night-bias ×1.4.",
          "Hunter Pack (threat, tier 3): enemy speed +30%, turret cooldowns +15%, 2 rushers spawn on apply — 40s.",
          "Signal Drought (threat, tier 2): yields ×0.6, flux purge ×0.5 for 50s.",
          "Starcall (rare boon, tier 6, weight 0.12): yields ×2, energy ×1.5, bonus gems node spawns — 30s.",
          "Null Surge (rare threat, tier 7, weight 0.1): turret range halved, enemies +20% speed, one turret disabled on apply — 45s. Night-bias ×2.",
        ],
      },
    ],
  },
  {
    version: "2.2.1",
    badge: "Disruptor",
    summary:
      "A new late-game threat: the Zapper. This ranged enemy holds its distance and fires slow energy bolts that disable workers and turrets for several seconds on impact.",
    sections: [
      {
        title: "New Enemy — Zapper",
        items: [
          "Zappers appear from tier 7 onward. They hold at firing range rather than closing to contact, backing off if a target gets too close.",
          "Every ~90 ticks the zapper fires a zapper-bolt at the nearest worker or turret within range. The bolt travels visually and applies a disable on impact.",
          "Disabled workers freeze in place (task: Disabled) and disabled turrets stop firing. Both show a greyscale filter and a pulsing orange ring. The disable lasts ~7 seconds (210 ticks).",
          "Workers reboot automatically when an attacker kills them and they respawn; the disable clears on reboot.",
        ],
      },
    ],
  },
  {
    version: "2.2.0",
    badge: "Field Clarity",
    summary: "Visual polish pass — field decoration cleaned up for a cleaner, less cluttered battlefield.",
    sections: [
      {
        title: "Visual Polish",
        items: [
          "Removed the corner bracket markers from the home zone — the dashed border already defines the region clearly without the extra decoration.",
        ],
      },
    ],
  },
  {
    version: "2.1.0",
    badge: "Signal & Record",
    summary:
      "Two major quality-of-life systems land together: a fully structured activity log with category filtering and timestamps, and a 44-achievement roster with rarity tiers, category tabs, and a dedicated modal.",
    sections: [
      {
        title: "Activity Log Revamp",
        items: [
          "Log entries are now structured objects carrying a category, a simulation-tick timestamp, and a message — replacing the old plain string array.",
          "Eight categories drive distinct icons and colours in the log: system (cyan), combat (rose), mining (amber), corruption (fuchsia), event (violet), upgrade (emerald), achievement (gold), and ambient (dim white).",
          "The sidebar log panel now shows up to 40 entries (up from 6) in a scrollable list, newest first, with relative-age timestamps ('4s ago', '2m ago').",
          "A filter tab bar lets you narrow the feed to Combat, Corrupt, Upgrade, Event, or Awards entries.",
          "The newest entry is highlighted; all entries show their category label, icon, and age.",
          "A live pulsing dot in the log header confirms the feed is actively updating.",
          "Old saves migrate cleanly: legacy string entries are restored as system-category entries at tick 0.",
        ],
      },
      {
        title: "Achievements Revamp",
        items: [
          "Achievement count grows from 12 to 44, spanning six categories: Combat, Corruption, Mining, Progression, Survival, and Secret.",
          "Four rarity tiers: Common (white), Uncommon (cyan), Rare (violet), Legendary (amber). Each tier has distinct border, background, and badge colours in the ribbon and modal.",
          "New progression achievements: level 10/20/30, prestige 3/5, threat tier 10, all-upgrades-at-1 and all-at-5, Cores 50, Flux 100.",
          "New combat achievements: kill milestones at 10/500/1000, Phantoms ×5, Leeches ×3, Sappers ×10, first Sentinel kill, Turret Ace (level 8), Titan Slayer (25 Brutes).",
          "New corruption achievements: first purge, 50/200 purges, Pristine (corruptors alive but zero corrupted nodes), Triple Rot (3+ simultaneously), Full Spectrum (all three node types corrupted at once).",
          "New mining achievements: first crit, 25/100 crits, 1k/10k resources mined, Gold Hoarder (5k gold at once), Gem Collector (200 gems).",
          "New survival achievements: 15m and 30m runtime milestones, 2-hour Vigil, Equilibrium (95% colony health under hostile pressure), Immaculate Grid (all workers simultaneously at full HP).",
          "Five secret achievements, including the hidden Cascading Anomaly (3+ simultaneous events — legendary).",
          "Hidden achievements show as '???' placeholders until unlocked; an eye-toggle in the modal reveals or masks them.",
          "The achievements modal now has a category tab bar (with per-tab unlock counts), a completion progress bar, a rarity legend footer, and rarity-coloured rows.",
          "The field-card achievement ribbon uses rarity-coded badge colours and shows a running unlock count.",
          "Four new per-kind kill counters added to GameState.stats: phantomsKilled, leechesKilled, sappersKilled, sentinelKills. Old saves migrate with ?? 0 defaults.",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fixed footer tooltip clipping: all HUD strip tooltips now use position:fixed with a viewport-anchored ref, escaping the overflow-x-auto scroll container that was silently clipping upward absolute tooltips.",
          "Fixed tooltip portal rendering to guarantee escape from all ancestor overflow/clip contexts.",
          "Fixed tooltip right-edge overflow: positions are now clamped to the viewport boundary.",
        ],
      },
    ],
  },
  {
    version: "2.0.0",
    badge: "Living Field",
    summary:
      "A major visual and UX pass — the field now breathes with event atmosphere, glanceable HUD indicators, smooth entity transitions, and a thorough overflow/clipping fix across all screen sizes.",
    sections: [
      {
        title: "Event Atmosphere",
        items: [
          "Each active event now drives a distinct full-screen backdrop effect: meteor streaks, solar corona pulse, emerald cache shimmer, red perimeter alert for pirate raids, violet xeno spore fog, amber dust-storm haze, and expanding echo scanner rings.",
          "Event HUD chips are now tone-coded (green boon, red threat, amber mixed) with hover/focus tooltips showing flavor text and a per-effect breakdown.",
          "EventDef now carries flavor, tone, and a structured effects list — the tooltip is the single source of truth for what each event actually does.",
        ],
      },
      {
        title: "Field HUD",
        items: [
          "New FieldStatsStrip: compact scrollable pill row at the bottom of the field card showing crews, integrity, turrets, scouts, sentinels, combat contacts, corruption pressure, threat tier, and combo — all with tone colours and detail tooltips.",
          "New UpgradeIndicatorRail: one glowing dot per visible upgrade, colour-coded by category (amber yield, cyan defense, fuchsia support, indigo elite). Dot brightness scales with level; a pulsing ring highlights affordable next upgrades.",
          "Both strips are now horizontally scrollable on narrow screens instead of wrapping to multiple lines.",
          "The verbose crew/task text line is replaced by the compact stats strip.",
        ],
      },
      {
        title: "Entity Transitions",
        items: [
          "Nodes, enemies, and agents fade in over ~20 ticks on spawn or respawn instead of popping into existence.",
          "Enemies play a short fade-out death animation (~18 ticks) before being removed from state.",
          "Temporary cache nodes fade out as they approach their despawn deadline.",
          "Agents fade in again after rebooting at a home pad.",
        ],
      },
      {
        title: "UI Polish & Bug Fixes",
        items: [
          "Fixed: UpgradeIndicatorRail tooltips were completely invisible — the overflow-x-auto scroll container was silently clipping all upward-pointing absolute tooltips via the CSS overflow interaction rule.",
          "Fixed: FieldStatsStrip pills were wrapping to two rows on narrow screens, causing tooltips to point into occupied UI space rather than the field.",
          "Fixed: EventChip tooltip was overflowing and clipping at card edges — switched to left-anchored layout with max-w viewport clamping.",
          "Fixed: all footer tooltips now clamp to max-w calc(100vw - 2rem) to prevent right-edge overflow on any screen size.",
          "Fixed: the stray tooltip arrow appearing with no body on the upgrade rail (overflow-hidden on the field card was clipping the tooltip panel but not the tiny rotated arrow).",
          "Fixed: FieldStatsStrip and UpgradeIndicatorRail outer wrappers were flex containers, causing the sidebar to bleed into the field at desktop widths — outer wrappers are now block-only positioning contexts.",
          "Fixed: the field card and sidebar were overflowing their grid columns, pushing the sidebar off-screen and letting the field consume ~95% of the viewport. Root cause: grid items default to `min-width: auto` which expands to intrinsic content width; the new pill strips with `overflow-x-auto` carried wide intrinsic widths that ignored the `1.45fr 0.85fr` proportions. Adding `min-w-0` to both grid children restores correct proportions.",
          "Version schema migrated: releases are no longer prefixed with a leading `0.` — the previous `0.2.0` becomes `2.0.0`, `0.1.5` becomes `1.5.0`, and the full history rolls forward in a consistent one-dot shift.",
        ],
      },
      {
        title: "Tablet & Responsive Layout",
        items: [
          "Desktop two-column layout now activates at lg (1024px) instead of xl (1280px), so 11-inch iPads in landscape (1194px CSS) get the full side-by-side field+sidebar view.",
          "h-screen lock, sector card absolute positioning, speed controls, resource pill reorder, and subtitle hide all now trigger at lg instead of xl.",
          "Sidebar scrolls independently at lg+. The layout stays fully usable in both landscape and portrait on iPad.",
        ],
      },
    ],
  },
  {
    version: "1.5.0",
    badge: "Code Hardening",
    summary:
      "Internal quality pass — save versioning, subsystem documentation, stricter linting, and expanded test coverage.",
    sections: [
      {
        title: "Save System",
        items: [
          "Save files now carry a schemaVersion field, enabling explicit migration paths as the game evolves.",
          "Migration always stamps the current schema version on load, so future version checks are unambiguous.",
        ],
      },
      {
        title: "Code Quality",
        items: [
          "Subsystem execution order in the game loop is now fully documented with per-step rationale.",
          "ESLint no-explicit-any rule elevated to error — any future type escapes will fail the build.",
          "Round-trip save/load tests added: data integrity, v1 back-compat, and post-restore NaN checks.",
        ],
      },
    ],
  },
  {
    version: "1.4.1",
    badge: "Field First",
    summary:
      "Layout overhaul for every screen size — the game field is now the focal point on mobile and desktop alike.",
    sections: [
      {
        title: "Layout",
        items: [
          "Game field is now the first thing below the title on mobile and vertical screens.",
          "Sector Level card moves below the fold on mobile so the field gets immediate focus.",
          "Resource pills, speed presets, and sidebar content follow the field on small screens.",
          "SVG field now fills its flex container properly — no more clipping on constrained viewports.",
          "Achievement badges moved inside the field card so they don't consume outer layout height.",
        ],
      },
      {
        title: "Desktop",
        items: [
          "Sector Level card collapses to a compact single-row bar at xl breakpoint.",
          "Description paragraph hidden on xl to recover vertical space for the field.",
          "Speed presets and New Game button integrated into the title row on xl.",
          "Max content width expanded to 1920px with wider gutters on large monitors.",
        ],
      },
    ],
  },
  {
    version: "1.4.0",
    badge: "Long Watch",
    summary: "Save persistence, day/night cycle, achievements, easter eggs, and idle-friendly UX polish.",
    sections: [
      {
        title: "Idle-Friendly",
        items: [
          "Colony state now saves to localStorage every 30 seconds and restores on reload.",
          "The simulation pauses cleanly when the tab is hidden, so returning does not trigger a catch-up burst.",
          "Speed presets (1x, 2x, 4x) are now visible in the main HUD instead of living only in the hidden admin panel.",
          "A 30-minute day/night cycle now shifts the battlefield sky over long runs.",
        ],
      },
      {
        title: "Achievements",
        items: [
          "Added 12 tracked achievements covering prestige, combat milestones, event coverage, and long-run survival.",
          "Unlocked achievements now appear in a ribbon under the resource bar and expand into a dedicated panel.",
          "Achievement state persists through save/load, including hidden unlocks.",
        ],
      },
      {
        title: "Easter Eggs",
        items: [
          "Konami code toggles a synthwave presentation mode.",
          "Typing drift anywhere in the app now wakes a hidden message in the log.",
          "A tourist drone can wander through mature colonies after a long enough real-time run.",
          "At high threat tiers, a lost drone can emerge from the outer zone and permanently join the roster.",
        ],
      },
      {
        title: "Polish",
        items: [
          "Workers now accumulate veteran ranks from nearby kills, gaining subtle movement speed bonuses and chevrons.",
          "Save migration backfills newly added fields so older local runs still load.",
        ],
      },
    ],
  },
  {
    version: "1.3.0",
    badge: "Deep Reserves",
    summary: "Two new resources, three new upgrade tracks, and Sentinel Mechs for the late-game.",
    sections: [
      {
        title: "New Resources",
        items: [
          "Flux: earned by cleansing corrupted nodes and killing Corruptors or Blights. Soft-caps at 200.",
          "Cores: dropped by Brutes, Phantoms, and Echo Signal elites. Spent on Sentinel and Archive upgrades.",
        ],
      },
      {
        title: "New Upgrades",
        items: [
          "Foundry (tier 3): boosts node yield by 12% per level. Costs Ore + Flux.",
          "Sentinel Mech (tier 5): deploys a heavy ground unit that hunts Brutes, Sappers, and Leeches. Costs Gold + Cores.",
          "Data Archive (tier 4): accelerates XP gain and increases prestige combo gain. Costs Flux + Cores.",
        ],
      },
      {
        title: "Economy",
        items: [
          "Flux now comes from scout cleanse ticks, node purge completions, and corruptor kills.",
          "Upgrade costs can now require multiple resource types instead of gold only.",
          "Autobuy now evaluates Flux and Cores affordability and can unlock Foundry and Sentinel paths.",
        ],
      },
    ],
  },
  {
    version: "1.2.0",
    badge: "Strange Tides",
    summary: "Six new enemy types, Cores drops, and a live random-event system reshape the mid-game.",
    sections: [
      {
        title: "New Enemies",
        items: [
          "Rusher (tier 3): fast straight-line darters that pressure turret clusters.",
          "Brute (tier 4): slow tank that absorbs turret fire and drops Core fragments.",
          "Sapper (tier 5): suicide unit that detonates near workers.",
          "Blight (tier 5): heavy corruptor variant that shrugs off scouts until arsenal level 3.",
          "Leech (tier 6): drains gold and energy when it slips near the home district.",
          "Phantom (tier 7): phases in and out of cloak, disappearing from turret targeting during its hidden window.",
        ],
      },
      {
        title: "Resources And Events",
        items: [
          "Added Cores to the resource state so late-game upgrade hooks can land without touching enemy logic again.",
          "Live event system now rolls seeded ambient modifiers and surprise encounters: Meteor Shower, Solar Flare, Cache Discovery, Pirate Caravan, Xeno Bloom, Dust Storm, and Echo Signal.",
          "Active timed events now surface in the HUD with countdown banners, and the admin panel can trigger each event manually for testing.",
        ],
      },
    ],
  },
  {
    version: "1.1.0",
    badge: "Slow Burn",
    summary:
      "Economy and drone rebalance. Slower pacing, weaker early drones, and cooperative cleanse synergy.",
    sections: [
      {
        title: "Balance",
        items: [
          "All upgrade growth rates increased — costs compound harder past level 15",
          "Ore income reduced; XP gain rate lowered for a longer mid-game",
          "Spawn intervals and wave budgets reduced — early game is calmer",
          "Prestige gates raised — prestige is now a meaningful milestone",
        ],
      },
      {
        title: "Anti-Corruption Drones",
        items: [
          "Drone movement speed roughly halved — they drift rather than zip",
          "Base cleanse rate halved; arsenal upgrades matter more",
          "Active drone cap starts at 2 (was 3); 4th active unlocks at scout level 8",
          "Multiple drones on the same corrupted node now cleanse faster (cooperative synergy)",
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    badge: "Foundation",
    summary:
      "This is the first build that feels like it has a real spine. The sim is reproducible, the tuning lives in one place, and the code finally reads like something you can keep building on.",
    sections: [
      {
        title: "What Changed",
        items: [
          "Moved the game's balance knobs into balance.ts and used the cleanup to tune economy, corruption, scouts, turrets, and prestige pacing in one pass.",
          "Replaced Math.random() in the simulation with seeded Mulberry32 RNG, which makes long runs and odd bugs repeatable.",
          "Added the fourth scout unit so the late-game scout cap increase is backed by a real unit on the field.",
        ],
      },
      {
        title: "Under the Hood",
        items: [
          "Added a stricter production CSP plus ESLint and Prettier so the project is harder to break and easier to maintain.",
          "Split the old 953-line advanceGame.ts into focused subsystem files and pulled shared targeting logic into its own module.",
        ],
      },
    ],
  },
  {
    version: "0.8.0",
    badge: "Pressure Pass",
    summary:
      "This was the stop-the-late-game-from-wobbling release. Pressure still ramps, but it ramps in a way that feels fairer and easier to read.",
    sections: [
      {
        title: "Gameplay",
        items: [
          "Reworked progression and enemy counterplay so the colony doesn't swing as hard from panic to free farm.",
          "Fixed recovery mode and spawn pacing, which smoothed out the near-death breather loop that kept showing up in longer runs.",
          "Set clearer limits on anti-corruption scouts early on, then tuned around that cap.",
        ],
      },
      {
        title: "Polish",
        items: [
          "Tightened the scout marker silhouette so it stays readable once the screen gets busy.",
          "Lined up scout, worker, and turret home anchors so the field staging looks deliberate instead of a little off.",
        ],
      },
    ],
  },
  {
    version: "0.7.0",
    badge: "Homefront",
    summary:
      "The colony finally started to feel like a place instead of just a combat board. This is the release where the home district began to tell the story of the run.",
    sections: [
      {
        title: "World",
        items: [
          "Added evolving home district visuals and a procedural skyline.",
          "Slowed the building cadence so the city's growth reads as progression instead of flicker.",
          "Tied district growth to upgrades and turret investment so the skyline reflects how the colony is doing.",
        ],
      },
      {
        title: "Presentation",
        items: [
          "Simplified the field status footer so the center of the screen could breathe.",
          "Fixed the corruption status indicator so the HUD says what the sim is actually doing.",
        ],
      },
    ],
  },
  {
    version: "0.6.0",
    badge: "Visual Pass",
    summary:
      "This was the big readability pass. Enemy types became unmistakable, workers got their own silhouettes, and the whole battlefield stopped collapsing into one color soup.",
    sections: [
      {
        title: "Visual Identity",
        items: [
          "Gave mites, raiders, and wisps distinct shapes and a shared hostile ring, while pushing the colony into a cleaner cyan palette.",
          "Separated resource and corruption colors more aggressively, including a darker steel-grey ore tone that stopped fighting with the colony blue.",
        ],
      },
      {
        title: "Animation",
        items: [
          "Added wisp trails and dedicated harvesting animations for runners and drones.",
          "Rebuilt the runner grabber into a jointed arm with a proper pincher so it reads like a machine, not a tongue.",
        ],
      },
    ],
  },
  {
    version: "0.5.0",
    badge: "AI Pass",
    summary:
      "The sim started behaving better here, not just looking better. Workers made smarter calls, units gave each other room, and busy fights got easier to follow.",
    sections: [
      {
        title: "Decision Making",
        items: [
          "Reworked worker targeting with stronger role preferences, low-health node bias, and a real penalty for dogpiling the same target.",
          "Made the worker roles feel more distinct by sharpening what each unit wants to mine.",
        ],
      },
      {
        title: "Movement",
        items: [
          "Added post-movement separation for both workers and enemies so crowds stop collapsing into one pile.",
        ],
      },
    ],
  },
  {
    version: "0.4.0",
    badge: "Mobile Pass",
    summary:
      "This was the phone-and-layout cleanup release. The interface got less awkward on small screens, and the battlefield became a lot easier to read.",
    sections: [
      {
        title: "Mobile",
        items: [
          "Rebuilt the field card so the header and status blocks behave like real layout instead of floating overlays.",
          "Shortened the header treatment on small screens, centered the badges, and added a cleaner active-field indicator.",
          "Stopped resource nodes from spawning on top of each other.",
        ],
      },
    ],
  },
  {
    version: "0.3.0",
    badge: "Control Room",
    summary:
      "The shell of the game got a lot calmer here. Desktop layout stopped sprawling, the HUD read better, and there was finally a quick way to speed the sim up while tuning.",
    sections: [
      {
        title: "HUD",
        items: [
          "Capped the layout at 1600px, tightened spacing, and let the sidebar scroll on big screens without bloating the page.",
          "Added blurred label shadows and refreshed the top copy so the screen reads better at a glance.",
        ],
      },
      {
        title: "Tools and Feel",
        items: [
          "Added the hidden speed panel for quick pacing checks.",
          "Changed scout patrol and return movement to fixed-speed travel and added avoidance so they feel less twitchy.",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    badge: "Stability",
    summary:
      "A lot of invisible but important work landed here. The project stopped feeling fragile: CI existed, tests existed, and the build path finally matched the app.",
    sections: [
      {
        title: "Build and CI",
        items: [
          "Added GitLab CI for Docker builds and registry publishing, then fixed the install and build failures that showed up right after.",
          "Replaced the fake test script with Vitest and added the first batch of simulation invariant tests.",
        ],
      },
      {
        title: "Maintenance",
        items: [
          "Moved the game loop to requestAnimationFrame, tightened TypeScript settings, and cleaned up dead code.",
          "Added reduced-motion support, better progress bar accessibility, and sturdier Docker, Compose, and Nginx defaults.",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    badge: "Prototype",
    summary:
      "The first playable cut of Nexus Drift. Rough around the edges, but the core idea was already there: a colony that mostly runs itself while you keep the machine from drifting apart.",
    sections: [
      {
        title: "First Cut",
        items: [
          "Shipped the initial autonomous colony sim with mining, hostiles, upgrades, and the basic wallpaper feel.",
        ],
      },
    ],
  },
];
