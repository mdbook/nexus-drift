# Layout & HUD

**Source files:** `src/App.tsx`, `src/components/FieldSvg.tsx`, `src/components/FieldStatsStrip.tsx`, `src/components/EventChip.tsx`, `src/components/UpgradeIndicatorRail.tsx`, `src/hooks/useLowFxMode.ts`
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

## Tooltip Conventions

**Tooltip positioning — use `position: fixed` with a viewport-anchor ref.** Do NOT use `absolute bottom-full` on tooltips inside the footer. The footer rows use `overflow-x-auto` for scroll-on-narrow-screens; CSS's overflow interaction rule makes `overflow-y` effectively clipped on those rows, which silently clips any upward `absolute` tooltip (only the arrow shows).

Established pattern: attach a `useRef<HTMLButtonElement>` to the anchor button; on `open` run `useLayoutEffect` to read `getBoundingClientRect()`; store viewport coordinates in state; render the tooltip with fixed positioning. Reference implementations: `FieldStatsStrip` (centered, above), `EventChip` (left-aligned, above), `UpgradeIndicatorRail` (above in the mobile footer, below in the desktop top chrome).

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
