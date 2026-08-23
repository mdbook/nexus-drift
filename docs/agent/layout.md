# Layout & HUD

**Source files:** `src/App.tsx`, `src/components/FieldSvg.tsx`, `src/components/FieldPopover.tsx`, `src/components/Sidebar.tsx`, `src/components/idleModeButton.ts`, `src/components/V4OnboardingCard.tsx`, `src/components/FieldStatsStrip.tsx`, `src/components/EventChip.tsx`, `src/components/UpgradeIndicatorRail.tsx`, `src/hooks/useLowFxMode.ts`, `src/hooks/useCoarsePointer.ts`, `src/hooks/useTooltip.ts`
**Tests:** none (visual)
**Key invariants:** `lg` breakpoint, not `xl`; grid/flex children carry `min-w-0`; HUD lives in the field card footer on mobile; fixed-position tooltips with viewport ref.

## Responsive Layout

The UI uses Tailwind with a responsive flex layout.

- **Mobile / small tablet (< 1024 px)**: title + top chrome → field card (full width) → resource pills → sidebar stacked below.
- **Desktop / large tablet (`lg`, ≥ 1024 px)**: field + sidebar side by side; sector status card collapses to a compact single-row bar positioned `absolute` top-right; speed presets and New Game button integrate into the title row.

The `lg` threshold was chosen so 11-inch iPads in landscape (1194 px CSS) get the full desktop layout. **All structural layout classes use `lg:` prefixes** — `xl` (1280 px) is available for fine-tuning within the desktop layout (wider max-width, larger typography) but must not unlock layout features that should appear on iPad.

Max content width is 1920 px with wider gutters at `xl`.

## Grid And Flex Children Must Have `min-w-0`

Grid and flex children default to `min-width: auto`, which means "as wide as intrinsic content". When a child contains horizontally-scrollable strips (`overflow-x-auto`), long unbreakable strings, or any element with a large intrinsic width, the parent grid/flex container is forced wider than its fractional allocation (`1.45fr`, `0.85fr`, etc.) and the sidebar gets pushed off-screen.

**Rule:** every direct child of a grid with `fr` units, or a flex column that might contain pill strips, tables, or long content, must have `min-w-0` (and `min-h-0` for flex rows with similar risks). The field card and sidebar wrapper in `App.tsx` both have `min-w-0` — do not remove them.

If you add a new column to the main grid or put a new scrollable strip inside the field card, check proportions at the `lg` breakpoint first.

## Field Card Sizing

The field card (left column of the `lg` grid) must have `lg:h-full overflow-hidden`. Without `lg:h-full` the card can grow taller than its grid cell, pushing its `absolute bottom-0` footer off-screen where it is clipped by the grid's `overflow-hidden`. Without `overflow-hidden` on the card itself, content inside can visually escape its bounds. The sidebar already carries `lg:h-full`; keep both columns in sync.

`FieldSvg` uses `h-full min-h-[380px] w-full lg:min-h-0`. The `min-h-[380px]` floor keeps the mobile stacked layout readable; on `lg` it must be released (`lg:min-h-0`) so the SVG can shrink to fit its grid cell on short desktop viewports. Without `lg:min-h-0`, a 380 px SVG inside a shorter `lg:h-full overflow-hidden` card clips the bottom of the viewBox — where the city skyline renders.

## Viewport Sizing — `100dvh` Only

Viewport sizing uses `100dvh` (dynamic viewport height), not `100svh` or `100vh`. iPadOS Safari misreports `svh` when the URL bar is visible, returning roughly the full-screen height and causing absolute-positioned footers inside `overflow-hidden` containers to clip below the visible viewport. `dvh` adjusts as browser chrome shows/hides and is supported on Safari 15.4+ (all shipping iPadOS today). Do not reintroduce `100svh` or `100vh` for the app shell without testing on iPadOS landscape with the URL bar visible.

## Field Card Footer (Primary HUD)

The field card footer is the primary HUD surface — especially on mobile where the sidebar sits below the fold. When adding any new live indicator (upgrade status, stat pill, event chip, alert badge), default to placing it **inside the field card footer on mobile**.

Mobile footer order, top to bottom: active events bar (`EventChip`s) → `FieldStatsStrip` → `UpgradeIndicatorRail`.

On `lg` desktop layouts, the upgrade rail leaves the footer and renders as an absolutely-positioned overlay in the otherwise-unused top-right chrome band above the resource bar, with downward-opening tooltips. The footer overlay contains the active-events row plus the stats strip. The events row is always rendered — "No ongoing events" placeholder when idle — so footer height is stable and the canvas never resizes when events start or end. The SVG wrapper uses a fixed `lg:mb-[83px]` / `mb-[124px]` inset.

Achievement badges live inside the field card, below the field toolbar, so they don't consume outer layout height. The achievement ribbon renders newest unlocks first by reversing the unlocked id list at render time, so fresh badges appear on the left edge. Each badge is its own button that opens `AchievementsModal`, switches to the matching category, scrolls the row into view, focuses it, and plays a brief pulsing cyan highlight (animation in `src/index.css`, disabled under `prefers-reduced-motion`).

Only push UI into the sidebar when the information is dense, multi-line, or rarely glanced at.

## Touch Targets (Coarse Pointer)

The field is played on iPad, where the `viewBox` WORLD_W=1000 renders to ~600px (world→screen scale ≈ 0.6), so a world-space hit radius `r` becomes `r*0.6` px on screen. Small transparent hit-circles that feel fine with a mouse fall well under the 44px touch minimum.

- **`useCoarsePointer` (`src/hooks/useCoarsePointer.ts`)** is the signal for touch-target sizing: `(hover: none) and (pointer: coarse)` at **any** width (unlike `useLowFxMode`, which also requires `lg`). Use it to enlarge invisible hit-halos on touch while keeping desktop precise. Presentation/input only — never branch game/sim logic on it.
- **Field hit-halo radii (`FieldSvg.tsx`)** are gated on `useCoarsePointer`: worker `18→28`, tourist `16→26`, lost-drone `22→30`, resource node `size+10 → size+22`, enemy `style.radius+12 → style.radius+24` (corruptor corpse `24→34`). Desktop (fine pointer) keeps the smaller values.
- **Live enemies** normally rely on their visible geometry for clicks (no transparent halo). On coarse pointers only, they also get an enlarged transparent hit-halo (`showEnemyHit = corpseInteractive || (inspectInteractive && coarsePointer)`), so desktop click precision is unchanged. Enlarging changes ONLY the invisible hit-circle — never entity visuals, collision, or movement.
- **`touch-action: manipulation`** is set app-wide on `button` (index.css) and on the field `<svg>` (`touch-manipulation` utility) to kill the iOS ~300ms tap delay and double-tap-zoom hijack. The field `<svg>` also carries `select-none` so drags don't select. `manipulation` still permits pan/scroll.
- **Sidebar / HUD controls** carry `min-h-[36px]`–`min-h-[44px]` finger targets (Buy button, per-tile Auto toggle, master All/None/Custom, Idle Mode toggle, `FieldPopover` action buttons). The Autobuy master group is spaced (`gap-2.5`) so mis-taps between Idle Mode and the master switch are less likely. Keep the visual tone; only the tap area grew.

## Tooltip Conventions

**Tooltip positioning — use `position: fixed` with a viewport-anchor ref.** Do NOT use `absolute bottom-full` on tooltips inside the footer. The footer rows use `overflow-x-auto` for scroll-on-narrow-screens; CSS's overflow interaction rule makes `overflow-y` effectively clipped on those rows, which silently clips any upward `absolute` tooltip (only the arrow shows).

Established pattern: attach a `useRef<HTMLButtonElement>` to the anchor button; on `open` run `useLayoutEffect` to read `getBoundingClientRect()`; store viewport coordinates in state; render the tooltip with fixed positioning. Reference implementations: `FieldStatsStrip` (centered, above), `EventChip` (left-aligned, above), `UpgradeIndicatorRail` (above in the mobile footer, below in the desktop top chrome).

**Tap-to-open on touch (`useTooltip`).** Hover-only tooltips are invisible on touch. `useTooltip` opens on `hover || focus || tapped`: a `pointerdown` with `pointerType` `touch`/`pen` (pure `isTapPointer` helper) toggles a latched `tapped` state, and while latched a document `pointerdown` listener closes it on any outside tap. Mouse is unaffected — it never sets `tapped`, so the hover path (and hover-leave close) stays clean. Every `useTooltip` consumer gets this for free via the spread `triggerProps` (now including `onPointerDown`).

### Inspect Popovers (`FieldPopover`)

4.0 inspect popovers use the **same fixed-position rule** because they sit over the `overflow-hidden` field card — an `absolute` panel would clip. `src/components/FieldPopover.tsx` anchors to the originating click's viewport coordinates (a mouse click carries `clientX/Y`; a keyboard Enter/Space activation falls back to the target's on-screen centre), then a `useLayoutEffect` measures the panel and clamps it into the viewport (flips left / above at an edge). **One popover is open at a time** — `App.tsx` owns the single open/closed state, and a full-viewport catch layer closes it on any outside click. The three variants: worker (task, **target node + one-line "why" reason (4.x)**, HP bar, speed/fear chips, "Send home"), city (hp / regen / last-hostile / energy factor, read-only), enemy (kind, hp, shield, threat, cloak, "Mark priority"). Live entity data is read from the throttled `game`/`derived` snapshot by id, so a unit that dies while inspected renders a "no longer on the field" state instead of stale numbers. Click routing lives in `FieldSvg` (`onWorkerInspect` / `onEnemyInspect` / `onCityInspect` open popovers; `onNodeClick` stays a direct worker nudge — nodes never open a popover).

**Worker "why" (4.x).** The worker variant surfaces the worker's current target (`${node.kind} node #${id}`, or "Home pad" under a forced-home command) plus a short plain-English reason from `describeWorkerReason(agent)` in `interactions.ts` — a pure read of agent locals the sim already computes (`corrupted` → "void-infested", `disabledTicks` → "disabled", `rebootTicks` → "rebooting", `evadeTicks` → "fleeing", home command → "returning home", `corruptingTicks` → "under corruption", node nudge → "tasked by you", `spookedTicks` → "avoiding a threat lane"). Priority mirrors the sim's dominance order (offline/fleeing beats a standing command beats a passive spook); an ordinary worker returns `null` and the row is omitted. No sim change.

**Honest "Mark priority" (4.x).** The enemy variant greys its "Mark priority" button out and relabels it "No weapon can hit this" when `canWeaponActOnEnemy(game, enemy.id)` is false (cloaked / out of every weapon's range / pre-any-weapon), so a mark that would silently no-op is reported instead. See [defenses.md § Defense priority marks](defenses.md).

**No-op interaction cues (4.x).** The `suggestWorkerToNode` / `suggestWorkerHome` / `suggestDefensePriority` helpers each return a boolean; `App.tsx` now consumes it and, on a `false` (no eligible worker to reroute/recall, or the enemy already died), writes a short `appendLog(..., "system")` activity-log line ("No free worker to reroute there.", "That worker can't be recalled right now.", "Target lost — nothing to mark.") so a no-op reads as a stated reason instead of a dead button. These UI-driven logs never touch the sim/trace.

- **Stacking**: use `z-50` on fixed tooltips (not `z-30`). Modals at `z-50` are fine — when both are open the modal's backdrop captures pointer events so the tooltip is a non-issue.
- **`pointer-events-none`** on fixed tooltips — prevents the tooltip from interfering with hover-leave detection on the button underneath when the cursor drifts upward.
- **Focus and hover parity**: every tooltip must open on both hover and keyboard focus. Use local `useState` for `hovered` and `focused` and OR them together.
- **Accessibility**: tooltip buttons need `aria-describedby` (pointing to the tooltip id) and an `aria-label` summarizing label + value. Tooltips use `role="tooltip"`.

## Indicator Conventions

- **Mobile first**: on small screens, hide text labels and keep icon + value + a tone-coloured dot. Use `hidden md:inline` for labels. Icons must be distinctive — do not share the same icon across semantically different indicators.
- **Tone colour is meaning**: each indicator's colour must encode state, not just decoration. Use the existing tone vocabulary (`calm` cyan, `warn` amber, `danger` rose, `ready` emerald, `toxic` fuchsia) and extend it deliberately if a new category is genuinely needed.
- **Visibility rules must match the sidebar**: if a piece of state is gated by tier or by a stat threshold in the sidebar, the field-card indicator for it must use the same gate. `UpgradeIndicatorRail` is the reference implementation — it mirrors the sidebar's upgrade filter exactly.

`FieldStatsStrip` pill tones derive from integrity thresholds, `hostilePressure`, `corruptionPressure`, `progression.recoveryMode`, and tier. The corruption pill shows a single combined count (corruptors + infected nodes) to stay compact.

`EventChip` is `shrink-0` + `whitespace-nowrap` so crowded event lanes scroll horizontally instead of collapsing labels into multi-line pills. Hover or focus reveals a tooltip with the event name, rarity label (`common` / `uncommon` / `rare` / `legendary`, derived from `EventDef.weight`: ≥0.7 common, ≥0.4 uncommon, ≥0.15 rare, <0.15 legendary), flavor text, and per-effect list. Timed events keep visible countdowns; one-shot cards omit the timer and fade by remaining HUD linger. Inspected cards dim the leading marker dot; clicks produce a small local ripple at that dot.

`UpgradeIndicatorRail` shows one glowing dot per currently-visible upgrade. Category colour (yield / defense / support / elite) is centralized in a `UPGRADE_CATEGORY` map inside the component. Glow intensity scales with level (capped at 5). Affordability drives a pulsing outer ring.

## Coarse-Pointer Desktop FX Budget

`useLowFxMode` is a presentation-only guardrail for `lg` coarse-pointer desktop layouts, especially iPadOS landscape Safari. `Background.tsx`, `EventBackdrop.tsx`, and `FieldSvg.tsx` already use it to preserve the same overall look while dropping the most compositor-heavy continuous effects.

- Treat `useLowFxMode` as a **render-budget fallback only**. Never branch gameplay, save data, or simulation logic on it.
- Any new full-screen ambient animation, large blur wash, particle loop, or SVG filter added to the background / event backdrop / field-label surfaces must either simplify or disable under `useLowFxMode`.
- Do not flatten the surface into "no effect". Keep a static gradient / glow version so the visual identity remains intact even when motion is reduced for performance.

The 4.0 click-acknowledge pulse follows this budget: clicking a node / live enemy / city core stamps a brief tick-driven ring (`FieldSvg.tsx` local `clickPulse` state, faded via `elapsedTicks`, no timers). Under `useLowFxMode` it renders a single static ring instead of the expanding animation — simplified, not removed.

The 4.1.0 **worker "tasked" indicator** follows the same budget: while a worker carries an active `kind: "node"` suggestion (`agent.suggestedTarget`), `FieldSvg.tsx` draws a subtle cyan lead line from the worker to the suggested node plus a marker ring on the node. The ring pulses (tick-driven `sin`) only at full FX; under `useLowFxMode` it renders a static ring. Presence of the marker (whose node still exists) is the proxy for "active" — the sim clears it on arrival / expiry / node-gone.

The 4.x **marked-enemy priority ring** follows the same budget: any enemy carrying an unexpired defense-priority mark (`isPriorityMarked`) gets a persistent **amber** (`warn` tone) dashed ring drawn in `FieldSvg.tsx`. It is a **separate overlay map** (keyed `mark-${enemy.id}`) placed _before_ the enemy-body map, so the ring sits beneath the bodies and never occludes the threat/shield rings, and it carries `pointerEvents: none` so it never intercepts a touch hit-halo tap. It **coexists independently** with the cyan worker→node lead line (a different entity layer, drawn in the agents section) and the touch hit-halos (inside each enemy `<g>`). The ring pulses (tick-driven `sin`) and adds a faint fill glow only at full FX; under `reduceFx` it collapses to a single static dashed stroke (no pulse, no fill). A marked cloaked enemy dims the ring to 0.35 opacity. The mark's lifetime (`PRIORITY_MARK.expiryTicks`) is the "active" proxy — the sim prunes expired marks, so the ring vanishes on expiry.

### `prefers-reduced-motion`

`FieldSvg.tsx` reads `useReducedMotion()` (framer-motion, same as `Background.tsx`) and folds it into the FX gate two ways:

- **`reduceFx = lowFxMode || prefersReducedMotion`** replaces `lowFxMode` at the continuous-motion FX gates already documented above (tasked-node ring pulse, click-acknowledge pulse) so reduced-motion users get the same static fallbacks. `reduceFx` is a superset of `lowFxMode`, so iPad (already low-FX) behaviour is unchanged — this only _adds_ the reduced-motion case.
- **Un-budgeted continuous motions** that were not previously `lowFxMode`-gated (worker/scout bob, corruption shake, resource-node glow pulse) are zeroed/flattened on `prefersReducedMotion` **only** (not `reduceFx`), so their iPad look is preserved while reduced-motion users get a still field. Follow this split when adding new continuous field motion: gate documented FX-budget effects on `reduceFx`, and zero any always-on sine/bob/shake on `prefersReducedMotion`.

## Idle Mode Status Indicator (Sidebar)

The sidebar "Idle Mode" control (`Sidebar.tsx`, the master autobuy all↔none quick-toggle) reads as a **lit/glowing status indicator** when idle mode is active (`game.upgradeAutoMaster === "all"`) and a normal muted button otherwise — it still toggles either way. The active treatment uses the existing `ready` (emerald) tone: a glowing emerald button (`shadow` + `ring`) with a leading status pip. No new colors. The styling and active-state logic are factored into pure, node-test-friendly helpers in `src/components/idleModeButton.ts` (`isIdleModeActive`, `idleModeButtonClass`, `idleModeDotClass`) so the tone-tracks-state contract is unit-tested without a DOM render.
