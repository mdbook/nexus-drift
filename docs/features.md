# Features

What the game does, grouped by area. For how to play, see the [Player Guide](../PLAYER-GUIDE.md).

## Operator Model (4.0)

- **You run the colony.** Upgrade tiles are click-to-buy when affordable, with a tone-coded tooltip explaining any gate or shortfall; autobuy stays as an opt-in fallback with a per-tile Auto chip and a master **All / None / Custom** switch. Fresh 4.0 runs start in manual mode; loaded 3.x saves come up on autobuy-everything, unchanged.
- **Soft field guidance.** Click a resource node to nudge the nearest idle worker toward it; click an enemy to inspect it and mark it a defense priority. Both are soft - the AI stays authoritative under threat and every safety/flee rule still wins.
- **Inspect popovers.** Click a worker, enemy, or the city core for a fixed-position popover (task / HP / modifiers, or hp / regen / energy factor); the worker popover can Send-home and the enemy popover can Mark-priority.
- **One-tap Idle Mode** returns the classic hands-off sim, and a first-run overlay explains the model once (skipped for returning saves).
- **Operator actions are free (4.5.1).** Node nudges, threat marks, send-home and the held drag-to-lead cost nothing. Energy is still a mined resource.

## Simulation & Economy

- Fully browser-run simulation with no network gameplay dependency
- Deterministic seeded RNG in the simulation layer for reproducible runs
- **3.0.0**: Economy stretched 5–8× for multi-session play - the second turret is a 25-35 min milestone, the third worker of any kind takes hours, and overnight runs are now first-class
- Each worker kind (miner / runner / drone) supports up to 3 simultaneous units, dual-gated by upgrade level and sector level (level 10 / 22), with Gold+Ore slot-unlock surcharges
- **3.0.0**: Workers now have per-individual variance (speed ±12%, fear ±20%, harvest bias ±15%) plus class abilities: miner overclock, runner sprint burst, drone corruption scan
- Workers commit hard to partially mined resources; one or two nearby enemies no longer dislodge an undamaged harvesting worker; live enemy bodies slow movement; fleeing workers can retarget ahead
- Flux and Cores feed multi-resource upgrades (Foundry, Data Archive, Sentinel Mechs)
- Seeded random events (12 event types) temporarily bend yields, speed, corruption pressure, and surprise spawns

## Combat & Enemies

- Mid-game enemy roster: rushers, brutes, sappers, blights, leeches, phantoms, zappers - each kind maps to an AI archetype (direct line, flanker, ambusher, ghost, skirmisher) with emergent squad-level flanking
- **3.0.0**: Enemies now target deployed turrets, scouts, sentinels, and the city - brutes siege structures, sappers aim for turrets, phantoms assassinate sentinels. Per-class armor values tune contact damage separately from enemy stats
- **3.0.1**: Enemy target selection now excludes undeployed slots, corrupted/rebooting workers, and stale rebooted structure targets; void warden cooldown and kill-credit blockers are fixed
- Zappers hold at firing distance and fire bolts that disable workers, turrets, scouts, or sentinels for ~7 seconds; late-game Void Wardens stalk isolated workers and, once within range, latch on as parasites - pinning to the host, uncloaking for the 3.5-second corruption window, and giving defenses a real shot to burn them off before the worker converts
- **3.0.0**: Turrets, scouts, sentinels, and the home district all have structural HP and can be broken, retreated, or destroyed. Turrets break for ~80 s; scouts reboot for ~20 s; sentinels reboot for ~40 s
- **3.1.5 defense flip**: Missile Silos are now the colony's first defense - one silo is armed from the very start, available on a gold-only `missileLauncher` track from Tier 0. Defense Turrets gate to Tier 3 "Raid" so the close-range perimeter line shows up alongside the brute (the first enemy that genuinely targets turrets) and the sapper. Long-range silo + short-range turret remain a deliberate split: turret range is hard-clamped to 270 px and silo range scales with the upgrade (400 px + 6 px per level), so silos always out-reach turrets
- Shielded enemies show a cyan shield layer; shield damage is consumed before HP without overflow in the same hit
- 74 achievements across 4 rarity tiers (common / uncommon / rare / legendary) and 6 categories, including the 4.0 operator-model set (first manual purchase, autobuy-off milestone, full manual run)

## HUD & UI

- Glanceable upgrade rail and field stats strip - on mobile the rail stays in the field footer; on desktop it floats in the top-right chrome band so the footer can prioritize events and live field stats without shrinking the field
- The desktop top-right upgrade rail now sits a touch closer to the sector card and uses a thinner horizontal scrollbar so it doesn't crowd the resource pills beneath it
- Active events live in a persistent footer strip that's always visible - timed events render as inspectable pills with countdowns, one-shot events now use the same compact chip size but fade away without counters, crowded rows stay a single horizontal scroller instead of wrapping labels into stacked chips, inspected cards simply dim their existing marker dot, and the canvas size never jumps as events come and go
- Each active event drives a distinct ambient backdrop effect (meteor streaks, xeno spore fog, dust storm haze, solar flare pulses, and more) plus a tone-coded HUD chip; coarse-pointer desktop layouts such as iPadOS landscape fall back to a cheaper static variant so the visual identity stays intact without the Safari lag hit
- Activity log: up to 40 structured entries with per-category icons, relative-age timestamps, and a filter tab bar
- Entities fade in and out instead of popping: nodes, enemies, and agents all animate on spawn and death
- Mature colonies can attract a tiny tourist drone; repeated clicks now just squish it, count per pass, and feed multiple hidden achievements without flashing an oversized white click outline
- Late-game interaction props live directly in the field: a broken recoverable lost drone, a 3-event anomaly artifact, clickable zapper bolts, in-flight missiles, and corpse clicks during enemy death-fade windows
- The in-field achievement ribbon now shows newly unlocked badges first on the left, pushing older ones rightward so fresh unlocks are immediately visible, and clicking a badge jumps the archive modal straight to that achievement with a scroll/focus pulse that fades out cleanly

## Controls & Persistence

- Speed presets: `1x`, `2x`, `4x` stay in the top chrome on every breakpoint; hidden admin mode behind `Space` × 5 extends that same selector with `10x`, `20x`, and `100x`
- The hidden admin console now includes live diagnostics, scenario/preset buttons, shell toggles, a dedicated event-trigger section, and a command terminal (`status`, `grant`, `upgrade`, `spawn`, `event`, `heal`, `clear`, `preset`, and more) for QA and balance setup; it can collapse into a tiny quick-send command panel when you need the field visible
- The shell now polls `/version` roughly every 5 minutes (and when the tab regains focus), extracts a flat semver from the response, and shows a live-update banner with `Refresh`, `Close`, and session-only `Don't Show Again` actions when a newer build is live; the admin console can also force that banner open for testing
- Long runs autosave every 30 seconds, restore on reload, and pause cleanly while the tab is hidden
- Save files carry a schema version for explicit forward-compatible migration
- In-game release history: click the version badge next to `Autonomous Colony Sim`; the version badge itself now also participates in a hidden secret achievement
- A source link sits in the top project chrome beside the version badge
- Favicon stack now includes SVG, PNG, ICO, Apple touch icon, and web manifest fallbacks for broader browser coverage

## Layout

- Responsive: two-column desktop layout activates at 1024px (`lg`), so 11-inch iPads in landscape get the full side-by-side view
- Desktop iPad layouts use dynamic viewport sizing (`100dvh`) plus safe-area bottom padding so the field card and its overlay footer stay inside the visible viewport when Safari's URL bar is present, and the field reserves an inset above the overlay footer on every breakpoint so the bottom HUD stays readable without covering the home district
- On coarse-pointer `lg` desktops, the heaviest ambient background / event animation paths and SVG text blur are intentionally reduced so scrolling stays smooth on iPadOS Safari without flattening the overall look
- On `lg` two-column screens, the upgrade rail is absolutely overlaid in the top-right chrome band above the resource bar instead of taking up vertical layout space
