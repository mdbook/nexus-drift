# Known deferred work

Follow-ups that were deliberately scoped out of earlier releases. Most have an in-source `TODO` comment.

Follow-up work for `3.2.0+` that was deliberately scoped out of `3.1.0`
because the touch surface was too large for a release polish pass. Each
item has an in-source `TODO(3.2.0)` comment anchoring it.

- **`computeDerived` lift** - `computeDerived` runs ~15× per tick because
  every subsystem recomputes it independently. Naïve WeakMap memoization is
  unsafe (state identity is stable but contents mutate mid-tick). The
  correct fix threads `derived` through subsystem signatures and patches
  specific fields after mutating phases. See
  `src/game/selectors.ts:computeDerived`.
- **Spatial index for enemy / worker scans** - movement, targeting, and
  combat all walk the full live-enemy list every tick. At admin speeds
  (`20×`, `100×`) with 100+ enemies this is measurable. Add a coarse grid
  (~64 px buckets) built once per tick at the top of `advanceGame` and
  reuse it across all nearest-neighbor scans. See top of
  `src/game/subsystems/movement.ts`.
- **Split `movement.ts`** - ~800 LOC housing three concerns (worker
  movement, enemy movement, ghost reposition). Break into
  `workerMovement.ts`, `enemyMovement.ts`, and a `ghostReposition.ts`
  helper. See top of `src/game/subsystems/movement.ts`.
- **Retire unseeded `Math.random` helpers in `src/game/utils.ts`** - the
  sim is deterministic and seeded via `src/game/rng.ts`; `rand`, `pick`,
  `chance`, and `pickWeighted` all fall back to `Math.random` and are only
  safe for cosmetic paths (starfield). Split them into a clearly-labeled
  cosmetic module or lean on the seeded `Rng` everywhere.
- **React `18 → 19` upgrade** - the app pins to React `18.3.1` plus
  matching type packages. Upgrading unlocks the newer `useOptimistic` /
  `useFormStatus` ergonomics and the compiler, but `framer-motion` and
  `lucide-react` peer ranges need revalidation first.

### Audit-pass polish (3.1.4)

Smaller follow-ups surfaced by the 3.1.4 audit that were consciously
scoped out. Not structural - mostly a11y, tooling, and migration
tightening. Each of these can be its own tiny PR.

- **TODO: `AchievementsModal` target-scroll effect re-runs per sim
  render.** The sorted list re-creates each sim render at
  `src/components/AchievementsModal.tsx:207`. Memoize the sort or
  narrow the scroll effect to fire only on target-id change.
- **TODO: `WikiOverlay` focus trap / restore weaker than
  `AchievementsModal`.** A11y consistency pass, not a regression.
- **TODO: Tourist drone keyboard focus ring.** `src/components/FieldSvg.tsx:1537`
  removes the outline without a `:focus-visible` fallback - keyboard
  users lose the focus ring on that target.
- **TODO: Mobile `ResourceBar` order check.** `order-4` on the resource
  bar may push resources below the sidebar on mobile. Verify on a real
  mobile viewport before treating it as a bug - the current order may
  be intentional.
- **TODO: Pin CI notification script.** `.gitlab-ci.yml:53,63` `wget`s
  a mutable `master` URL from self-hosted GitLab. Pin to a commit SHA
  or vendor the script into the repo.
- **TODO: Run `npm audit` locally.** Not part of the 3.1.4 triage;
  worth one pass to baseline dependency advisories.
- **TODO: Add `npm run build` to the CI verify stage.** Currently only
  exercised by the Docker build on `main` and `dev`, so branch
  pipelines can miss Vite compile regressions until deploy.
- **TODO: Tighten `migrateGameState` unknown-key handling.**
  `src/game/factories.ts:523` spreads `raw.achievements` unfiltered;
  the stats migration accepts unknown event-stat keys the same way.
  Inert because the UI renders from `ACHIEVEMENT_DEFS`, but the
  tightening is cheap.
- **TODO: Seed pattern for `createInitialGameState()`-based tests.**
  Audit-caught a flaky test (see commit 12) rooted in
  `createInitialGameState()` without a fixed seed; fixed that specific
  case and added a header comment in `src/game/__tests__/advanceGame.test.ts`,
  but the broader pattern-level refactor (either default-seed the
  helper in test contexts or audit every call site) is deferred.

### Balance / progression follow-ups

- **TODO: Speed up early-game progression so variety arrives sooner.**
  New players currently sit on the tier 0 roster (mite + wisp) until
  the director `score` crosses 75, and the full roster doesn't open
  until tier 6 (score 450) - see the score coeffs and `combatWeights`
  `minTier` gates in `src/game/balance.ts:686`. The goal is for players
  to see rushers / brutes / sappers noticeably faster without
  collapsing the long-haul curve that 3.0.0 established. Candidate
  levers: raise `PROGRESSION.scoreCoeffs.level` / `totalUpgrades`,
  lower `tiersPerScore`, or pull the `minTier` gates for the early
  variety enemies (rusher/brute/sapper) down a tier. Needs a balance
  pass, not a one-line tweak - pick after deciding whether tier pacing
  or unlock gates is the right knob.
- **TODO: Scale enemy HP to keep pace with turret upgrade investment.**
  Turret damage grows with both `upgrades.turret` and `upgrades.reactor`
  (see `TURRET` in `src/game/balance.ts:356`) but enemy `hpBase` and
  `hpWave` (`ENEMY_STATS`, `src/game/balance.ts:139`) are flat values
  with no upgrade-linked scaling - late-game turrets can one- or
  two-shot mid-tier enemies regardless of how far into the run you are.
  Two candidate approaches: (a) apply a multiplicative scaling factor
  to `hpBase` driven by `director.score` or `director.tier` on enemy
  spawn (keeps balance.ts values as baselines), or (b) directly buff
  `hpBase` / `hpWave` per problem enemy and nudge turret
  `damagePerTurret` / `damagePerReactor` down proportionally. Approach
  (a) is more self-correcting; (b) gives finer per-archetype control.
  Either way, cross-check against sapper explosion, missile silo
  `damageBase`, and sentinel `damageBase` so one-shot outliers don't
  just shift to a different weapon.
