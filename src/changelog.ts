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
    version: "2.3.2",
    badge: "Signal Trim",
    summary:
      "Small HUD polish patch. One-shot event cards keep their distinct short-lived card treatment, but the oversized explanatory label and visible countdown have been removed so they can linger, then fade out cleanly.",
    sections: [
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
          "ESLint now ignores `.claude/worktrees/`, matching the documented local-tooling ignore rule so auxiliary agent worktrees do not break `npm run lint`.",
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
