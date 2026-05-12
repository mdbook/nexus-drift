# Defenses

**Source files:** `src/game/subsystems/turrets.ts`, `src/game/subsystems/sentinels.ts`, `src/game/subsystems/scouts.ts`, `src/game/subsystems/projectiles.ts`, `src/game/subsystems/combat.ts`, `src/game/balance.ts` (`TURRET*`, `TURRET_HP`, `MISSILE_SILO`, `SCOUT*`, `SENTINEL*`, `ZAPPER`)
**Tests:** `src/game/__tests__/advanceGame.test.ts`, `src/game/__tests__/aiBehavior.test.ts`
**Key invariants:** turrets never target corruptors or cloaked phantoms; turret range hard-clamped to `TURRET.rangeMax`; structural damage via `damageTurret` / `damageScout` / `damageSentinel`; `derived.activeTurrets` is single source of truth.

## Turrets

Static base defense. Target combat enemies only — never corruptors, never cloaked phantoms. Carry a `disabledTicks` counter; while > 0 the turret skips targeting and firing entirely.

### Activation

Turrets are Tier 3 "Raid" gated (`minTier: 3` on the `turret` upgrade in `data.ts`). The always-on first-turret floor is gone:

```
activeTurrets = state.upgrades.turret >= 1
  ? min(turrets.length, 1 + min(max(0, upgrades.turret - 1), TURRET_SLOTS_BY_LEVEL[level]))
  : 0
```

So no turret deploys until the player both reaches Tier 3 **and** buys the upgrade. The 2nd turret slot unlocks at sector level 2, the 3rd at level 8, both gated by upgrade level on top.

Subsystems must keep reading `derived.activeTurrets` rather than recomputing locally — `selectors.ts` is the single source of truth.

### Structural HP

Turrets have a structural HP pool so enemies can attrit them. `Turret.hp` / `maxHp` scale from `TURRET_HP` in `balance.ts` (`hpBase 120 + 20·turret + 10·shield`). `stepTurrets` recomputes `maxHp` every tick and scales current `hp` proportionally so mid-combat upgrades do not reset damage progress.

Any code that deals damage to a turret must go through **`damageTurret(state, turret, amount)`** in `combat.ts` — mirroring the `damageEnemy` single-funnel pattern. It sets `damageTicks` for the hit flash and, on hp reaching 0, kicks `brokenTicks` to `TURRET_HP.brokenDurationTicks` (2400 ticks ≈ 80 s) and bumps `state.stats.turretsBroken`.

Broken turrets take no further damage, skip all targeting and firing, and restore to `maxHp * brokenRecoverRatio` (0.5) when the break timer expires. The renderer shows a cracked-chassis variant + HP bar when hp is below maxHp (and the bar is hidden while broken because the state is already communicated by the darker sprite).

### Firing

Turrets always beam — no missile fallback. Every shot is an instant-hit beam within the turret's acquisition range.

- `focusedBeam` upgrade extends range by `FOCUSED_BEAM.rangePerLevel` (6 px/level).
- Turret range is hard-clamped to `TURRET.rangeMax` (270 px on a 1000 px field) regardless of upgrade stacking or `eventModifiers.turretRangeScale`.
- `damagePerTurret` = 5; `cooldownPerTurret` = 1.7.

### Coordination bonus

`getTurretTargetScore` in `turrets.ts` reduces the score (raises priority) by `TURRET_COORD_BONUS` (60) when the target enemy is actively chasing a worker within 200 px of the home district. This prevents turrets from tunnel-visioning on distant strays while a brute marches on the home pad.

## Missile Silos

`MissileSilo` entities (deployed via the `missileLauncher` upgrade track) are separate from turrets and **invulnerable** — they do not carry HP, are not in `ENEMY_TARGET_PRIORITY`, and take no contact damage.

- Silo count scales with upgrade level via `MISSILE_SILO.silosByLevel` — `[1, 1, 1, 2, 2, 3, 3, 3, 3, 4, 4]`. Index 0 is `1`, so a fresh game lands with one silo armed even before the upgrade is purchased.
- `missileLauncher` has no `minTier`; base cost `600` gold, growth `1.30`.
- Each active silo fires once per `fireIntervalTicks` (480 ≈ 16 s) at the highest-priority combat enemy within `rangeBase + level * rangePerLevel` (400 + 6 × level) — brutes first, then leeches, then everything else, wounded within tier.
- Target selection is a single-pass best scan, not a sort.
- Damage: `damageBase (48) + damagePerLevel (12) * level`.

`selectors.ts` adds `activeMissileSilos * CITY.developmentWeights.activeTurrets` to `homeDevelopment` so the player's silo investment fills the city-stage progression role.

Silo missiles differ from the legacy turret missiles: `missileSpeed` 4.0 (vs 3.5), `missileSteering` 0.12 (vs 0.18), `missileMaxLife` 180 (vs 90). Stored on the `Projectile` as `speed` and `steering`; `stepProjectiles` reads `p.steering ?? TURRET.missileSteering` so older turret beams (no steering field) are unaffected.

`stepMissileSilos` runs in `advanceGame` after `stepSentinels` and before `stepZapperFire`. Renderer: chunky orange pylons with a cooldown charge bar; range ring shown at low opacity when active; brief launch flash when a shot exits.

### Range invariant

Turrets are guaranteed to always sit well below missile silos in reach: turret range hard-clamps at 270 px, silo range is `400 + 6 × missileLauncher`. Turrets are the tight perimeter weapon; silos are the long-range answer.

## Scouts

Dedicated anti-corruption units. Priority: live corruptors → corrupted nodes → patrol home. Not mobile turrets.

- **Corruptor targeting** is rate-weighted: a corruptor's per-tick corruption rate (blights score higher than regular corruptors) is multiplied by the attached node's current corruption level, so a blight on a 95%-corrupt node outranks a fresh corruptor.
- **Node cleansing** alternates between a **finish-job bias** (nodes within `SCOUT_AI.finishNodeThreshold` of cleanse) and a **stop-bleed bias** (nodes with `corruptedBy != null`) based on which pile is larger.
- **Pair-up** routes the second live scout onto any node over `SCOUT_AI.pairUpCorruptionThreshold` once at least `SCOUT_AI.pairUpScoutCount` (2) scouts are live, so multi-scout synergy fires in standard mid-game play.
- Four physical scout slots in state; activation gated by upgrade level. The scout upgrade unlocks at tier 1 — players can buy intercept capability before the first corruptors arrive.

### Structural HP, retreat, reboot

`Scout.hp` / `maxHp` scale from `SCOUT_HP` (`hpBase 45 + 5·scout + 5·arsenal`). All incoming damage routes through `damageScout(state, scout, amount)` in `combat.ts`; damage while rebooting is a no-op.

- `hp < maxHp * retreatHpRatio` (0.5) → scout enters `retreating = true`, drops its current target, and sprints home at `retreatSpeedScale` (1.3×).
- Within `homeHealRadius` (40 px) of the home pad → heals `healRatePerTick` (0.25 HP/tick).
- Retreat exits at `exitRetreatHpRatio` (0.9).
- Non-retreating scouts near the pad also heal at half rate so light chip damage tops up between sweeps.
- `hp` → 0: scout destroyed, `rebootTicks = rebootDurationTicks` (600), parked at home. On the tick the counter hits 0, scout respawns at full HP.

Renderer hides scouts while rebooting, shows a warm-tinted hull + damage flash while retreating, and draws an HP bar once HP drops below max.

## Sentinels

Heavy late-game ground mechs. Target priority weights the threat's distance to its nearest worker (not just distance to the sentinel) plus a priority bonus for `leech > brute > sapper > general combat`. A brute near a worker outranks a closer brute drifting alone.

Active sentinels move to an **intercept point** between the threat and the worker the threat is targeting (lerp factor `SENTINEL_AI.interceptLerp`, predicting worker position forward by `interceptLeadTicks`) so they feel like bodyguards rather than chasers. Patrol position blends `homeX` with the active-worker centroid so off-center late-game deployments still get cover.

Two physical sentinel slots; activation gated by upgrade level.

### Structural HP, retreat, reboot (tuned tankier)

`Sentinel.hp` / `maxHp` scale from `SENTINEL_HP` (`hpBase 220 + 40·sentinel + 10·shield`). All incoming damage routes through `damageSentinel(state, sentinel, amount)` in `combat.ts`; damage while rebooting is a no-op.

- Retreat engages below 35% HP; exits at 90%.
- Healing on the home pad at `healRatePerTick` (0.6/tick — faster recovery than scouts since sentinels take worse hits).
- On death: reboot for `rebootDurationTicks` (1200 ≈ 40 s), respawn at full HP.

Renderer hides sentinels while rebooting, tints the chassis warmer while retreating, and draws an HP bar when HP is below max.

### Corrupted-worker cleanse duty

Before checking for enemy targets, each sentinel calls `pickCleanseTarget()` to find the nearest visible corrupted worker (`dist <= WARDEN.corruptionVisionRadius` or `spottedTicks > 0`). While a cleanse target exists, the sentinel repositions toward it, sets `task = "Cleansing"`, and fires a purple projectile beam on its normal cooldown. Cleanse damage is the standard sentinel `damageBase + sentinel * damagePerSentinel`. Cleanse targeting **takes full priority over combat targeting** so sentinels always address infested workers first. See [workers.md § Sentinel Cleanse](workers.md#sentinel-cleanse) for the kill-shot effects.

Scouts stay visually distinct from turrets and have first crack at corruption cleanup.

## Disable System

Workers, turrets, scouts, and sentinels all carry `disabledTicks: number`. While > 0:

- Worker task becomes `"Disabled"`; worker freezes.
- Turret skips its fire path.
- Scouts / sentinels early-return from their step (no movement, targeting, cleanse, or combat).

The counter decrements each tick. Worker reboot clears `disabledTicks`.

Source today: zapper-bolt impact sets `ZAPPER.disableDurationTicks = 210`. `stepZapperFire` picks the nearest eligible target across all four classes within `ZAPPER.firingRange` — scout/sentinel picks respect `rebootTicks > 0` (already-downed units are skipped).

Renderer shows disabled entities greyscale with a pulsing orange ring.
