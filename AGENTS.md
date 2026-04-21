# AGENTS.md

## Repo Guidance

- `handoff.md` is the primary source of context for agents operating in this repo. Read it before starting any non-trivial work.
- `src/changelog.ts` is the in-game release history and a useful quick-scan of what has changed recently — read it alongside `handoff.md` to understand the current state of the project.
- Keep `README.md`, `handoff.md`, `package.json`, and `src/changelog.ts` aligned. If architecture, commands, or player-facing behavior changes, update the docs in the same pass.
- `src/changelog.ts` is the source for the in-game release history. It must match `package.json` version.
- Every non-trivial change should have a matching `src/changelog.ts` entry. If work is folded into an existing release version, update that version's entry instead of leaving the changelog behind.
- Ignore `.claude/` in both git status and agent summaries. It is local tooling noise, not project source, and repo tooling like ESLint should keep ignoring it too.
- If the user does not specify a new release boundary, assume follow-up work belongs to the current in-flight release and keep expanding that version's changelog entry.

## Always Update Docs (Every Change)

After every change that lands — feature, fix, refactor, tooling, anything non-trivial — update the repo documentation in the same pass, before considering the work done:

- **`README.md`** — update if the change alters player-facing behavior, the architecture summary, available components, commands, or contributor guidance.
- **`handoff.md`** — update if the change alters project structure, game systems, invariants, operational notes, or the reading order. Add new components, subsystems, or concepts here so the next agent sees them.
- **`AGENTS.md`** — update if the change alters how future agents should work in this repo: new invariants, new checklists, new rules, new conventions, or new gotchas. Do not let implicit knowledge stay implicit.

This is **separate from release work**. Even if no version bump is happening, the docs must stay current every pass. Version bumps, `package.json`, and `src/changelog.ts` only get touched when the user explicitly asks for release work (see Release Work Checklist below).

If a change genuinely needs no doc update in one of the three files, say so explicitly in your summary so the user can confirm — do not silently skip.

## Committing Changes (Commit, Don't Push)

Agents should **commit regularly** as they work. The default cadence is one commit per logical unit of work: a feature, a bug fix, a refactor, a docs pass, a release bump. Do not batch unrelated changes into a single commit.

- **Commit every time a logical unit of work completes** — after tests and lint pass, after docs are updated, before moving on to the next task.
- **Never push** (`git push`, `git push --force`, etc.) unless the user explicitly asks. Committing keeps history clean and recoverable locally; pushing is the user's decision.
- **One topic per commit.** Bug fix, doc update, and new feature are three commits, not one. The changelog and commit history should tell parallel, coherent stories.
- **Follow the repo's existing commit message style.** Imperative mood, short subject line, optional body explaining the "why" rather than the "what". Look at `git log --oneline` for recent examples before writing a new one.
- **Do not skip hooks** (`--no-verify`, etc.) unless the user explicitly asks.
- **Do not amend commits that have already been pushed.** Check `git status` for "Your branch is ahead" before any amend.

If a user asks for work across multiple logical units in a single message, commit them separately as you complete each one — do not wait for the whole batch to finish before committing.

## Release Monitoring

Agents working in this repo should actively watch for changes that are large enough to justify a new release suggestion.

- Do not silently bump versions unless the user explicitly asks for release work.
- Do suggest a next version in your final response when the work clearly crosses a release boundary.
- When suggesting a version, mention why in one short sentence.

## Versioning Heuristics

The project uses semver. As of 2.0 the leading `0.` prefix was dropped — the current major line is `2.x`.

- Suggest a **patch bump** (e.g. `2.0.1 → 2.0.2`) for contained bug fixes, docs, tooling, or small polish that does not materially change the player experience.
- Suggest a **minor bump** (e.g. `2.0.x → 2.1.0`) for a meaningful player-facing feature, balance pass, UI pass, or a bundled set of smaller improvements that together feel release-worthy.
- Suggest a **major bump** (e.g. `2.x → 3.0.0`) only when the project makes a deliberate, large step-change — a new primary game mode, a total visual identity refresh, or an architecture change that breaks saves on purpose.

Do not re-introduce the `0.` prefix. The version schema migration in 2.0.0 rolled every historical release forward by one dot (old `0.1.5` → new `1.5.0`, old `0.0.1` → new `0.1.0`, etc.).

## When To Raise A Release Suggestion

Raise a version suggestion when one or more of these land:

- a new gameplay system or mechanic
- a broad balance or progression pass
- a major visual or UX refresh
- a meaningful architecture milestone that changes how the project is maintained

## Release Work Checklist

If the user asks for a release or version bump, update these together:

- `package.json`
- `src/changelog.ts`
- `README.md`
- `handoff.md`

If the user does not ask for release work, keep the suggestion advisory only.

## Entity Spawn / Death Animation Fields

`ResourceNode`, `Enemy`, and `Agent` each carry a `spawnTick: number` field (set to `timers.tick` at creation/respawn/reboot). `Enemy` also carries `dyingTicks: number` (counts down from `DEATH_FADE_TICKS` after hp hits 0). Both fields are used **only in the renderer** (`FieldSvg.tsx`).

Rules for these fields:
- Always pass `state.timers.tick` when calling `makeNode`, `respawnNode`, `makeWorker`, or `spawnEnemy` at runtime. The initial-state factory (`createInitialGameState`) passes `0`, which the renderer treats as "no fade".
- Migration must add `?? 0` fallbacks for both `spawnTick` and `dyingTicks` on all three entity types so loaded saves do not flash-in.
- Do not use `dyingTicks` for any sim logic. Movement, targeting, and combat all guard on `enemy.hp > 0`. Dying enemies linger in `state.enemies` for visual purposes only — they must not participate in gameplay.
- If you add a new entity type that spawns/despawns at runtime, follow the same pattern: `spawnTick` on the entity, set at construction, used only in the renderer.

## Save State And Migration (Check On Every Feature)

Any change that adds, removes, or renames a field on `GameState` (or any nested type) requires updates in three places. Before finishing a feature, explicitly ask: *does this change the shape of what gets saved to localStorage?* If yes:

1. **`src/game/types.ts`** — add the new field to `GameState` (or the relevant nested type).
2. **`src/game/factories.ts`** — set a default value in `createInitialGameState()` so fresh runs always have the field. Then add a defensive fallback in `migrateGameState()` so existing saves without the field load cleanly (e.g. `raw.newField ?? defaultValue`). If the schema change is significant, bump `SCHEMA_VERSION`.
3. **`src/game/factories.ts` → `cloneGameState()`** — if the new field is an object or array, add an explicit spread or map so it gets deep-copied. Primitive fields are handled by `...prev` automatically.

Do this even for fields that seem cosmetic or optional. A missing field on a loaded save will produce `undefined` where the sim expects a number, which causes silent NaN propagation that is hard to diagnose.

## Achievement System Invariants

`ACHIEVEMENT_DEFS` in `src/game/achievements.ts` is the single source of truth for all achievement metadata. The subsystem (`src/game/subsystems/achievements.ts`) only calls `unlockAchievement()` — it never pushes to the log directly.

Rules for adding achievements:
- Add the new `AchievementId` to the union type in `achievements.ts`.
- Add a `AchievementDef` entry with `id`, `label`, `description`, `rarity`, `category`, and optionally `hidden: true`.
- Add the condition check in `stepAchievements()` in `subsystems/achievements.ts`.
- If the condition needs a new stat counter, add it to `Stats` in `types.ts`, initialise it in `createInitialGameState()`, and add a `?? 0` fallback in `migrateGameState()` — the same save-state migration checklist as any other field change.
- `state.stats.purges` counts completed node cleanses only. Increment it in `stepScouts()` when a node is actually cleansed; do not increment it for corruptor or blight deaths.
- `state.stats.sentinelKills` counts lethal sentinel hits only. Credit it at the damage site in `stepSentinels()`, not later in `resolveEnemyDeaths()` based on `targetId`.
- `tourist_spotted` is intentionally input-driven. `App.tsx` calls `spotTourist()` when the player clicks the tourist drone rendered in `FieldSvg.tsx`; do not reintroduce a passive visibility unlock in `stepAchievements()`.
- Keep the input-driven helper layer authoritative. `App.tsx`, `EventChip.tsx`, and `FieldSvg.tsx` should route achievement-relevant interactions through the exported helpers in `src/game/achievements.ts` (`inspectEventTag`, `spotTourist`, `recoverLostDrone`, `witnessAnomaly`, `clickProjectile`, `clickDyingEnemy`, `recordAchievementsOpen`, `recordChangelogOpen`, `completeManualOverride`) rather than mutating achievement state inline.
- `derived.progression.tier` is a capped display tier (max 5). Any legacy late-game gate that talks about tier 8/9/10 must use `derived.progression.score / PROGRESSION.tiersPerScore` instead of the capped tier field. Current examples: threat-rank achievements and the lost-drone event roll.
- Rarity tiers: `common` (tutorial-level), `uncommon` (mid-game), `rare` (late-game / specific combos), `legendary` (exceptional / near-impossible feats).
- Hidden achievements (`hidden: true`) show as "???" placeholders in the modal until unlocked. Use sparingly — only for genuine easter eggs and surprises.
- The `AchievementsModal` component renders all `ACHIEVEMENT_DEFS` entries. If you add a def without a matching condition in `stepAchievements`, it will appear permanently locked but won't break anything.

## Event Card Invariants

`EventDef.durationTicks` is the mechanical lifetime. `EventDef.hudDurationTicks` is the footer-card / backdrop lifetime. They are deliberately separate.

- Timed modifier events set both values and create `ActiveEvent` entries with `revertOnExpire: true`.
- One-shot events (`cache_discovery`, `pirate_caravan`, `echo_signal`) keep `durationTicks = 0` but set `hudDurationTicks` so they still surface as inspectable cards and backdrops for roughly 10 seconds.
- `stepEvents()` must only call `eventDef.revert()` when `activeEvent.revertOnExpire` is true.
- Event inspection is click-only. Hover/focus tooltip behaviour in `EventChip.tsx` must never count as inspection progress.

## Activity Log Invariants

`state.log` is a `LogEntry[]` (max 40, newest first). Each entry has `tick`, `category`, and `message`.

- Always call `pushLog(log, message, category, state.timers.tick)` — never push raw objects directly.
- `LogCategory` is one of: `system` | `combat` | `mining` | `corruption` | `event` | `upgrade` | `achievement` | `ambient`. Pick the tightest fit; default to `ambient` for flavor.
- `migrateGameState()` maps legacy `string[]` saves to `{ tick: 0, category: "system", message }` — do not remove that branch.
- `cloneGameState()` maps `entry => ({ ...entry })` — log entries are plain objects, so shallow spread is sufficient.
- `MAX_LOG` is 40. Do not lower it without checking the `ActivityLog` component's `max-h-72` scroll container.

## Worker Slot Invariants

`state.agents` starts with exactly 9 slot-backed agents (3 per kind: miner/runner/drone, slots 0–2). Only slot 0 of each kind starts active. Extra slots are intentionally late-game: the relevant upgrade track must reach its normal threshold (level 3 for the second slot, level 6 for the third), the colony must also reach sector level 12 / 24 before those units deploy, and those two worker-track purchases now add `flux` + `cores` on top of the normal gold cost. A recovered lost drone is the one explicit exception: it appends a permanent extra active drone beyond the slot system.

- `WORKER_SLOTS_BY_UPGRADE[kind][upgradeLevel]` is the slot count allowed by that worker track's upgrade level.
- `WORKER_SLOTS_BY_LEVEL[level]` is the slot count allowed by colony progression; `stepWorkerSlots()` uses the lower of the upgrade-based and level-based gates.
- `WORKER_SLOT_UNLOCK_RESOURCE_COSTS[level]` is the extra flux/core surcharge applied by `nextUpgradeCost()` when a worker-track purchase lands exactly on one of the slot-unlock levels.
- `stepWorkerSlots()` (called after `stepEconomy`) reconciles `agent.active` against the combined upgrade+level gates. It only ever activates, never deactivates — workers stay in the field once deployed.
- All subsystems that iterate `state.agents` must guard on `agent.active` before processing. Check combat, movement, mining, and zapper targeting when touching those subsystems.
- `FieldSvg.tsx` filters `game.agents` to active-only before rendering.
- Migration always defaults `agent.active ?? true` so existing 3-agent saves load cleanly.
- Do not try to fold the recovered lost drone back into `WORKER_SLOTS_BY_UPGRADE`; it is intentionally outside the normal 9-slot invariant.

## Key Invariants (Do Not Break)

- `advanceGame()` is the single simulation orchestrator. Subsystem execution order is documented in that file — read the comments before touching it.
- All simulation randomness must use the seeded `Rng` instance on `GameState`, never `Math.random()`.
- `cloneGameState()` is shallow-spread only. State must stay single-level. Deeper nesting silently breaks cloning.
- Save migration lives in `migrateGameState()` in `factories.ts`. Always stamp `schemaVersion` (the `SCHEMA_VERSION` constant) on the returned state.
- Derived/presentation calculations belong in `selectors.ts`, never inside subsystems.
- ESLint `no-explicit-any` is `error` — any `any` usage will fail the build and CI.

## Test Coverage

65 tests across `src/game/__tests__/advanceGame.test.ts`, `src/game/__tests__/interactionAchievements.test.ts`, and `src/lib/versionCheck.test.ts`. They must all pass before any commit. Coverage includes simulation invariants, subsystem targeting behavior, interaction-achievement helpers, worker-slot gating and costs, event-card linger behavior, live-version parsing/fetch helpers, admin preview-version helpers, manual-override timing, projectile behavior, and save/load round-trips. When adding new subsystems or schema changes, add tests in the same commit.

## Grid And Flex Children Must Have `min-w-0`

Grid and flex children default to `min-width: auto`, which means "as wide as intrinsic content". When a child contains horizontally-scrollable strips (`overflow-x-auto`), a long unbreakable string, or any element with a large intrinsic width, the parent grid/flex container will be forced wider than its fractional allocation (`1.45fr`, `0.85fr`, etc.). This breaks the field/sidebar proportions and pushes content off-screen.

Rule: every direct child of a grid with `fr` units or a flex column that might contain pill strips, tables, or long content must have `min-w-0` (and `min-h-0` for flex rows with similar risks). The field card and sidebar wrapper in `App.tsx` both have `min-w-0` — do not remove them.

If you add a new column to the main grid or put a new scrollable strip inside the field card, check proportions at the `lg` breakpoint first. If the column is wider than expected, `min-w-0` on the grid child is almost always the fix.

## Breakpoint Conventions

The desktop two-column layout triggers at **`lg` (1024px)**, not `xl`. All structural layout classes (`h-[100dvh]`, `overflow-hidden`, `grid-cols-[1.45fr_0.85fr]`, sector card `absolute` positioning, speed controls, resource pill order) use `lg:` prefixes. This threshold was chosen so 11-inch iPads in landscape (1194px CSS) get the full desktop layout.

Viewport sizing uses `100dvh` (dynamic viewport height), not `100svh` or `100vh`. iPadOS Safari misreports `svh` when the URL bar is visible, returning roughly the full-screen height and causing absolute-positioned footers inside `overflow-hidden` containers to clip below the visible viewport. `dvh` adjusts as browser chrome shows/hides and is supported on Safari 15.4+ (all shipping iPadOS today). Do not reintroduce `100svh` or `100vh` for the app shell without testing on iPadOS landscape with the URL bar visible.

The field card (left column of the `lg` grid) must have `lg:h-full overflow-hidden`. Without `lg:h-full` the card can grow taller than its grid cell, pushing its `absolute bottom-0` footer off-screen where it is clipped by the grid's `overflow-hidden`. Without `overflow-hidden` on the card itself, content inside can visually escape the card's bounds. The sidebar already carries `lg:h-full`; keep both columns in sync.

Do not add new layout behaviour gated on `xl:` — use `lg:` instead. The `xl` breakpoint (1280px) is available for fine-tuning within the already-active desktop layout (e.g. wider max-width, larger typography) but must not be used to unlock layout features that should appear on iPad.

## Coarse-Pointer Desktop FX Budget

`src/hooks/useLowFxMode.ts` is the presentation-only guardrail for `lg` coarse-pointer desktop layouts, especially iPadOS landscape Safari. `Background.tsx`, `EventBackdrop.tsx`, and `FieldSvg.tsx` already use it to preserve the same overall look while dropping the most compositor-heavy continuous effects.

Rules for this path:

- Treat `useLowFxMode` as a **render-budget fallback only**. Never branch gameplay, save data, or simulation logic on it.
- Any new full-screen ambient animation, large blur wash, particle loop, or SVG filter added to the background / event backdrop / field-label surfaces must either simplify or disable under `useLowFxMode`.
- Do not flatten the surface into "no effect". Keep a static gradient / glow version so the visual identity remains intact even when motion is reduced for performance.

## HUD And Indicator Conventions

The field card is the primary HUD surface — especially on mobile where the sidebar sits below the fold. When adding any new live indicator (upgrade status, stat pill, event chip, alert badge), default to placing it **inside the field card footer on mobile**. Current mobile footer order is: active events → `FieldStatsStrip` → `UpgradeIndicatorRail`. On `lg` desktop layouts, the upgrade rail is the explicit exception: it lives in the top-right chrome band above the resource bar so the footer can stay focused on events + live stats. Only push UI into the sidebar when the information is dense, multi-line, or rarely glanced at.

Rules for indicators on the field card footer:

- **Tooltip positioning — use `position: fixed` with a viewport-anchor ref**. Do NOT use `absolute bottom-full` on tooltips inside the footer. The footer rows use `overflow-x-auto` for scroll-on-narrow-screens; CSS's overflow interaction rule makes `overflow-y` effectively clipped on those rows, which silently clips any upward `absolute` tooltip (only the arrow shows). The established pattern: attach a `useRef<HTMLButtonElement>` to the anchor button, on `open` run `useLayoutEffect` to read `getBoundingClientRect()`, store viewport coordinates in state, and render the tooltip with fixed positioning. Reference implementations: `FieldStatsStrip` (centered, above), `EventChip` (left-aligned, above), `UpgradeIndicatorRail` (above in the mobile footer, below in the desktop top chrome).
- **Tooltip stacking**: use `z-50` on fixed tooltips (not `z-30`) so they render above any `z-20` / `z-40` surface. Modals at `z-50` are fine — when both are open the modal's backdrop captures pointer events so the tooltip is a non-issue.
- **`pointer-events-none` on fixed tooltips** — prevents the tooltip from interfering with hover leave detection on the button underneath when the cursor drifts upward.
- **Mobile first**: on small screens, hide text labels and keep icon + value + a tone-coloured dot. Use `hidden md:inline` for labels. Icons must be distinctive — do not share the same icon across semantically different indicators.
- **Tone colour is meaning**: each indicator's colour must encode state, not just decoration. Use the existing tone vocabulary (`calm` cyan, `warn` amber, `danger` rose, `ready` emerald, `toxic` fuchsia) and extend it deliberately if a new category is genuinely needed.
- **Focus and hover parity**: every indicator that opens a tooltip must do so on both hover and keyboard focus. Use local `useState` for `hovered` and `focused` and OR them together — this is the established pattern.
- **Accessibility**: tooltip buttons need `aria-describedby` (pointing to the tooltip id) and an `aria-label` summarizing label + value. Tooltips use `role="tooltip"`.
- **Visibility rules must match the sidebar**: if a piece of state is gated by tier or by a stat threshold in the sidebar, the field-card indicator for it must use the same gate. `UpgradeIndicatorRail` is the reference implementation — it mirrors the sidebar's upgrade filter exactly.
