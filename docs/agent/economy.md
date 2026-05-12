# Economy

**Source files:** `src/game/subsystems/economy.ts`, `src/game/subsystems/mining.ts`, `src/game/subsystems/autobuy.ts`, `src/game/selectors.ts`, `src/game/balance.ts` (`ECONOMY`, `CORRUPTION`, `CITY*`)
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

## Autobuy

Weighted upgrade prioritization with emergency paths (e.g. buy sentinel if 2+ brutes alive). Reads final resource totals after income and combat rewards. Multi-resource cost shapes are supported.

## Prestige

Auto-triggers when the colony is rich, stable, and clear enough. Combo bonus stacks with Archive upgrades.

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
