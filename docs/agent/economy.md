# Economy

**Source files:** `src/game/subsystems/economy.ts`, `src/game/subsystems/mining.ts`, `src/game/subsystems/autobuy.ts`, `src/game/purchases.ts`, `src/game/selectors.ts`, `src/game/balance.ts` (`ECONOMY`, `CORRUPTION`, `CITY*`)
**Tests:** `src/game/__tests__/advanceGame.test.ts`
**Key invariants:** `xpForLevel(level)` is the single XP threshold source; `ResourceNode.hp` only decreases through mining; idle nodes do not regenerate; city damage routes through `damageCity`.

## Resources

**Gold, Ore, Gems, Energy, Cores, Flux.**

- Gold anchors the early economy.
- Cores come from elite combat kills (brutes, phantoms).
- Flux comes from anti-corruption play (purges, corruptor kills).
- Upgrade costs can consume multiple resource types.

## Sector Level XP Curve

The sector-level XP threshold is `xpForLevel(level)` in `balance.ts` — the single source of truth used by both `stepEconomy` (level-up gate) and `computeDerived` (HUD `targetXp`). **Do not re-inline the formula in either place.**

Current curve: `floor(30 + L * 15 + L^1.7 * 1.4)`.

Sample thresholds: L0 30, L1 46, L2 64, L5 127, L10 250, L21 600. The first level-up arrives in ~2 minutes; the curve converges with the old linear curve around L~21 (the slot-2 unlock), so late-game pacing is unchanged.

## Starting Economy

Starting `gold` = 60, starting `ore` = 20 in `createInitialGameState`. Miner upgrade `baseCost` = 22, drill upgrade `baseCost` = 170. Growth factors (1.24, 1.27) are untouched, so by level 8+ the costs are within ~5% of historical curve — only the cheap early rungs are cheaper.

The first miner upgrade is affordable on tick 1 by design, so a fresh run has a clickable decision immediately.

## Mining

Workers harvest assigned nodes with kind-specific behavior and crit chances.

- Corrupted nodes yield less.
- Foundry upgrades increase per-haul yield (respawn timing is unchanged — nodes respawn immediately on exhaustion).
- Temporary cache nodes disappear on exhaustion instead of respawning.

### Node visuals must stay presentation-only

Recently worked, partially mined nodes use `workTicks` to render a fading mined-progress ghost segment and deterministic particles over the missing health-bar span. This is **presentation only** and must never restore `ResourceNode.hp` or regenerate resources.

Partially mined resource nodes may show fading recent-work visuals in `FieldSvg.tsx` based on `ResourceNode.workTicks`, but **idle nodes must not regenerate mined HP**. `ResourceNode.hp` only decreases through mining and resets through exhaustion/respawn (or temporary-node removal). If you add more progress or deterioration presentation, keep it visual-only.

## Purchase path (`src/game/purchases.ts`)

`purchaseUpgrade(state, key, opts?)` is the single shared buy path for **both** manual (the 4.0 UI) and automatic (`stepAutobuy`) purchases: cost-check → `deductUpgradeCost` → `state.upgrades[key] += 1` → `state.stats.spent +=` → `appendLog(..., "upgrade")`. Returns `{ ok: true }` or `{ ok: false, reason }` where reason is `"insufficient"` (can't afford), `"locked"` (below `minTier`), or `"maxed"` (hard cap — only Sentinel, capped by deployed slots). Reuses the helpers in `utils.ts` (`nextUpgradeCost` / `canAffordUpgrade` / `deductUpgradeCost` / `getUpgradeCostTotal`); it does not reimplement them.

`opts.enforceGates` (default `true`) toggles the tier/max gates; **autobuy passes `false`** because it applies its own candidate gating upstream and deliberately fast-tracks some emergency picks below their `minTier` — affordability is always checked regardless. `opts.log` overrides the default `Purchased <label> v<level>` line (the emergency path uses it for `Ops bot fast-tracked …`; the manual UI uses it for `Operator purchased …`).

`purchaseFailReason(state, key, opts?)` is the **read-only** twin of `purchaseUpgrade` — same gate order (`locked` → `maxed` → `insufficient`), returns the reason or `undefined` if the buy would succeed, mutates nothing. `purchaseUpgrade` is now defined in terms of it, and the manual-purchase UI uses it to decide whether an `UpgradeTile` is a live buy button or a disabled tile with a tone/tooltip reason (single source of truth so button state and the actual buy never disagree).

**Manual purchase UI (4.0 phase 1b).** `UpgradeTile` (`HudPrimitives.tsx`) is a clickable Buy button when `purchaseFailReason` is `undefined`, else disabled showing the reason in the existing tone vocabulary (emerald `ready` = buyable, amber `warn` = locked, cyan `calm` = maxed, muted white = insufficient/queue). Each tile also carries an always-settable per-upgrade **Auto** chip wired to `upgradeAutoFlags[key]` via `setUpgradeAutoFlag`, and the Sidebar upgrade-panel header has an **All / None / Custom** master switch wired to `upgradeAutoMaster` via `setUpgradeAutoMaster`. All three clicks route through App's `mutateGame` store closure (`onPurchase` / `onToggleAuto` / `onSetAutoMaster`) — the same dispatch the field interactions use; no parallel state system.

## Autobuy

Weighted upgrade prioritization with emergency paths (e.g. buy sentinel if 2+ brutes alive). Reads final resource totals after income and combat rewards. Multi-resource cost shapes are supported. Purchases execute through `purchaseUpgrade` (above).

**4.0 flag gating.** Before selecting a candidate, `stepAutobuy` filters upgrades through `isAutoEligible(state, key)`: `upgradeAutoMaster === "all"` → always auto (byte-identical to pre-4.0), `"none"` → never, `"custom"` → only when `upgradeAutoFlags[key] === true`. The filter runs **before** the trace emit so the traced `candidates`/`chosenKey` reflect only what was auto-eligible. The emergency path respects the same flags: an opted-out emergency pick falls through to the (also-filtered) ranking.

## Prestige

Auto-triggers when the colony is rich, stable, and clear enough — but **not when `upgradeAutoMaster === "none"`** (prestige is an autobuy behavior; a fully-manual player shouldn't have their run reset for them). Under `"all"` this guard is always true, so the pre-4.0 path is unchanged. Combo bonus stacks with Archive upgrades.

**4.1 prestige gates (`PRESTIGE` in `balance.ts`):** `goldGate = 10000` (was 60000; the 60k predated the 4.0 income cuts and put first prestige ~83 h out), `gemsGate = 380` (unchanged — gems accrue fast), `maxEnemies = 12` (was 3). The `enemies.length < maxEnemies` "clear enough" lull was the true blocker: at Tier 5 the field never falls below ~4 enemies, so at 3 auto-prestige could never fire regardless of gold. 12 (under half the Tier-5 enemyCap) makes it a genuine dominance lull that's actually reachable — first prestige ~5.5 h in the harness. The trigger code in `autobuy.ts` is unchanged; only the gate constants moved. See [balance-log.md](balance-log.md) for the BEFORE/AFTER measurements.

## City / Home District

The home district skyline evolves with progression and upgrade investment. Mature colonies attract a wandering tourist drone after 15+ real-time minutes at city stage 5.

The tourist tracks `passId`, `lastClickedPassId`, and `squishTicks` so repeated clicks can count toward separate-pass and total-click secrets without letting one pass spam the pass counter. Its click feedback is intentionally just the squish animation — the oversized white click/focus outline is suppressed in `FieldSvg.tsx`.

### City HP

`state.city` has a real HP pool: `hp`, `maxHp`, `damageTicks`, `lastHostileTick`. `CityState` starts at `CITY_HP.hpBase` (1000).

- Damage routes through `damageCity(state, amount)` in `combat.ts`; each damage call stamps `lastHostileTick`.
- `stepCity` (in `economy.ts`, wired into `advanceGame` right after `stepEconomy`) ticks the damage flash down, refreshes `lastHostileTick` whenever any combat enemy sits within `CITY_HP.hostileRadius` of the home center (500, 540), and heals `regenPerTick` per tick once it has been quiet for at least `regenIdleTicks` (180 ticks ≈ 6 s) — so ongoing sieges cannot heal through themselves.
- Selectors expose `cityIntegrity = hp / maxHp` and use it to modulate energy production: `rates.energy *= energyMinRatio + (1 - energyMinRatio) * cityIntegrity`. At full HP energy runs at 100%; at 0 HP it floors at `energyMinRatio` (0.25).
- Renderer draws a red flash wash over the home band while `damageTicks > 0` and a slim HP bar above the district whenever HP is below max.

Enemy→city contact damage funnels through `damageCity` as part of the non-worker contact loop in `stepCombat`, gated on `enemy.targetKind === "city"` and `ENEMY_CONTACT_RADIUS.city` proximity, scaled by `TARGET_ARMOR.cityArmor` (0.35).
