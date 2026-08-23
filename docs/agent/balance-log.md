# Balance Log

Operator audit trail for hands-off balance changes: every constant changed, the
audit finding that justified it, and the BEFORE/AFTER sim-harness measurement
that validates it. Measurements come from `npm run sim` (see `src/sim/cli.ts`),
seeded and deterministic. Ticks run at ~30/s (240000 ticks ≈ 133 min, 900000 ≈
8.3 h). Autobuy master = `all` (harness default), fresh `createInitialGameState`.

---

## 4.1 — Tier-0 economy deadlock unblock (balance)

### The deadlock (verified against code, then reproduced in the harness)

A fresh colony was permanently pinned at Tier 0. Self-reinforcing loop:

- `WORKER_SLOT_UNLOCK_RESOURCE_COSTS` folds a **flux + cores** surcharge into the
  miner/drill/bot **level-3 and level-6** purchases (via `nextUpgradeCost` in
  `utils.ts`).
- flux/cores only drop from enemies gated `minTier >= 1` (corruptors, brutes,
  phantoms, …).
- Tier never advances: director `score` topped out ~41, but Tier 1 required
  `score >= tiersPerScore = 60`. So only mites/wisps spawned → no corruptors →
  **no flux/cores ever** → miner/drill frozen at L2, bot at L0 → income starved
  → score can't climb → tier can't advance. Closed loop.
- Auto-prestige was independently unreachable (`goldGate = 60000` ≈ 83 h).

**BEFORE (baseline, seeds 1 & 7, 240000 ticks / 133 min):**

| metric @ 133 min          | seed 1    | seed 7    |
| ------------------------- | --------- | --------- |
| tier                      | 0         | 0         |
| score                     | 41.7      | 41.7      |
| total upgrades            | 14        | 14        |
| miner / drill / bot level | 2 / 2 / 0 | 2 / 2 / 0 |
| flux / cores              | 0 / 0     | 0 / 0     |
| prestige                  | 0         | 0         |
| ore (unused)              | 19941     | 19881     |

Miner and drill are hard-frozen at exactly L2 (the level→3 flux/cores wall); bot
never leaves L0. flux/cores are 0 for the entire run. ore/gems/energy pile up
unused. This reproduces the audit exactly.

### Changes

#### 1. [LINCHPIN] `WORKER_SLOT_UNLOCK_RESOURCE_COSTS` — redenominate flux+cores → gold+ore

`balance.ts`. `{3: {flux:18, cores:4}, 6: {flux:55, cores:14}}` →
`{3: {gold:80, ore:150}, 6: {gold:500, ore:900}}`.

- **Why:** this is THE unblock. The surcharge is applied only at the two
  slot-unlock rungs (miner/drill/bot L3 and L6) by `nextUpgradeCost`, but it was
  denominated in resources a Tier-0 colony can never earn. Redenominating to
  gold+ore (earnable from tick 1, and ore was piling up unused so it also gets a
  real early sink) keeps the "deliberate, weighty slot-unlock spend" intent while
  making it payable. The surcharge already lands only on the slot-unlock levels,
  so no relocation of the layer was needed — only the denomination was wrong.
- **AFTER:** miner/drill immediately climb past L2 (miner reaches L4–5 by ~10 min,
  L16–19 by end); bot reaches L1. flux/cores start flowing once tier advances
  (see below). See combined AFTER table.

#### 2. `PROGRESSION.tiersPerScore` 60 → 28

`balance.ts`.

- **Why:** at 60, score topped ~41 and Tier 1 (score ≥ 60) was unreachable even
  with the economy unblocked, so the `minTier >= 1` gates (corruptors → flux/cores,
  scouts, raiders, turret) never opened. 28 lands Tier 1 on the unblocked curve.
- **Tuning note (judgment call):** the audit suggested ~28 targeting Tier 1 in
  15–25 min. Harness measurement of the unblocked curve put Tier 1 at ~36–40 min
  at 28. A more aggressive **20** did hit Tier 1 at ~23 min (inside the target
  window) — but over an 8.3 h run it escalated the higher tiers fast enough that
  autobuy's defense investment lagged the wave curve and **seed 1 income-collapse
  stalled** (total upgrades frozen at 58 from ~166 min, gold pinned at 0 as
  harassed miners stopped earning). At 28 both seeds stay healthy for the full
  8.3 h (hp mostly 87–100, upgrades keep climbing to 200+). Since "progression
  doesn't stall" is the core acceptance criterion, the anti-stall 28 wins over
  the faster-gate 20. Tier 1 at ~36–40 min still beats "never."

**Tier-1 timing AFTER (tiersPerScore = 28), score crossing 28:**

| seed | tier @30 min   | tier @60 min   | ~Tier-1 crossing |
| ---- | -------------- | -------------- | ---------------- |
| 1    | 0 (score 24.3) | 1 (score 43.9) | ~36–40 min       |
| 7    | 0 (score 24.3) | 1 (score 43.9) | ~36–40 min       |
| 3    | 0 (score 24.3) | 1 (score 43.9) | ~36–40 min       |
| 5    | 0 (score 24.3) | 1 (score 43.9) | ~36–40 min       |

#### 3. `PRESTIGE.goldGate` 60000 → 10000

`balance.ts`.

- **Why:** the 60k gate predates the 4.0 income cuts and put auto-prestige ~83 h
  out of reach. Lowered per the audit. gemsGate (380) left unchanged — gems accrue
  fast (thousands within the hour), so gold stays the binding _resource_ gate.
- **Measurement caveat:** see #4. goldGate alone did **not** make prestige fire —
  the harness proved a different constant was the true blocker.

#### 4. `PRESTIGE.maxEnemies` 3 → 12 (companion to #3; data-driven addition)

`balance.ts`.

- **Why (harness finding, not in the original fix list):** after lowering goldGate
  to 10000, prestige _still never fired_ across 8.3 h/seed — even with gold at
  20k–24k and gems at 60k+. The auto-prestige branch also requires
  `enemies.length < maxEnemies`, and at Tier 5 the field never falls below ~4
  enemies (enemyCap runs ~24, constant waves). So **maxEnemies = 3, not goldGate,
  was the real prestige blocker.** Raised to 12: the field must clear to under
  half the Tier-5 cap — a genuine dominance lull, not a constant reset — while
  making prestige actually attainable. This is a pure gate constant (no logic
  touched); the autobuy trigger code in `autobuy.ts` is unchanged.
- **BEFORE:** first prestige = NEVER (goldGate=10000, maxEnemies=3), seeds 1 & 7,
  900000 ticks / 8.3 h — despite gold peaking >20k and gems >60k.
- **AFTER:** first prestige fires and the loop becomes live and repeatable:

| seed | first prestige   | prestige count @500 min |
| ---- | ---------------- | ----------------------- |
| 1    | ~333 min (5.5 h) | 55                      |
| 7    | ~350 min (5.8 h) | 52                      |

First auto-prestige at ~5.5 h is a ~15× improvement over the old ~83 h and lands
in a reasonable multi-hour window. (Endgame churns further prestiges every few
minutes once dominant; the combo bonus caps at `ECONOMY.comboMax = 9.9` so the
extra prestiges self-limit their benefit. Making the autobuy _stop_ prestiging
once combo is maxed would be a logic change — out of scope for this data slice.)

#### 5. `data.ts` `turret.minTier` 3 → 2

- **Why:** the turret is the primary fixed perimeter weapon; Tier-3 gating left an
  unblocked colony without a static gun until deep into the run. Tier 2 keeps it
  off the Tier-0/1 opening but available as real pressure arrives.
- **AFTER:** turrets appear in autobuy builds by ~Tier 2 (tur1 by ~60 min, tur3 by
  ~120 min across all four seeds); colony hp holds 87–100 through the mid/late game.

#### 6. `WORKER_SLOTS_BY_LEVEL` — 2nd slot 22 → 10, 3rd slot 42 → 22

`balance.ts` (array shortened accordingly; still AND-gated by
`WORKER_SLOTS_BY_UPGRADE` = upgrade L3 / L6).

- **Why:** the old L22/L42 sector-level gates (paired with the now-fixed flux/cores
  freeze) kept mining single-worker for hours. Pulling them in lets a 2nd
  miner/runner/drone land in the first ~30–40 min and a 3rd around the first
  prestige window, so mining output scales with the unblocked economy.
- **AFTER:** miner upgrade level reaches L16 by ~90 min / L19 by ~133 min across
  seeds (was frozen at L2), reflecting multi-worker mining feeding the curve.

### Combined AFTER (tiersPerScore=28, all changes; 240000 ticks / 133 min)

| metric @133 min     | seed 1     | seed 3     | seed 5     | seed 7     |
| ------------------- | ---------- | ---------- | ---------- | ---------- |
| tier                | 5          | 5          | 5          | 5          |
| score               | 177.1      | 190.9      | 185.4      | 181.5      |
| total upgrades      | 76         | 82         | 79         | 78         |
| miner / drill / bot | 19 / 8 / 1 | 19 / 8 / 1 | 19 / 8 / 0 | 19 / 8 / 1 |
| flux (flowing)      | ~199       | ~200       | ~200       | ~163       |
| cores               | 4          | 2          | 2          | 2          |
| colony hp           | 97         | 100        | 100        | 93         |

Tier 0 → Tier 5, ~14 → ~76–82 upgrades, flux/cores flowing (corruptors and elite
enemies now spawn), miner/drill unfrozen, colony healthy. Deadlock broken on
every seed measured.

### Deliberately left for the follow-up (operator-action / resource-sink slice)

- **ore / gems / energy remain largely vestigial.** This slice gives _ore_ a small
  early sink (the redenominated slot-unlock surcharge, #1), but gems and energy
  still pile up with no meaningful drain, and ore still accumulates into the
  thousands mid/late game. Adding real multi-resource sinks for ore/gems/energy is
  the separate operator-action-economy design change and was intentionally NOT
  done here — this slice is scoped to the deadlock unblock + safe gate loosening.
- **Endgame prestige churn** (see #4) — gating the autobuy from re-prestiging once
  the combo bonus is maxed is a logic change, deferred.
- **Autobuy defense/offense weighting** — the reason the aggressive tiersPerScore=20
  stalled one seed is that autobuy under-invested in defense as tiers escalated;
  that decision code was left untouched (logic), and the tier curve was tuned
  conservatively (28) to stay within its comfort zone instead.
