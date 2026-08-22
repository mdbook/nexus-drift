# Enemies

**Source files:** `src/game/subsystems/spawns.ts`, `src/game/subsystems/movement.ts`, `src/game/subsystems/combat.ts`, `src/game/targeting.ts`, `src/game/enemyUtils.ts`, `src/game/balance.ts` (`ENEMY_*`, `PROGRESSION`, `WARDEN`)
**Tests:** `src/game/__tests__/aiBehavior.test.ts`, `src/game/__tests__/advanceGame.test.ts`
**Key invariants:** corruptors never attack workers and never target gold; turrets never target corruptors and ignore cloaked phantoms; all damage routes through `damageEnemy`; cloak checks via `isCloaked(enemy)`.

## Combat Kinds

`mite`, `raider`, `wisp`, `rusher`, `brute`, `sapper`, `leech`, `phantom`, `zapper`, `warden`.

- **Workers / structures**: combat enemies pursue workers, apply pressure, get targeted by turrets.
- **Phantoms** cycle cloak and disappear from turret targeting while hidden.
- **Sappers** detonate near workers.
- **Brutes and phantoms** yield Core fragments on death.
- **Zappers** (tier 6+) hold at firing range and fire energy bolts (`tag: "zapper-bolt"`) that disable the struck target for `ZAPPER.disableDurationTicks` (210, ≈7 s). See [defenses.md](defenses.md) for the disable system.
- **Leeches** (tier 5+) bypass worker targeting entirely and drive directly for the home district. Their movement goal is a hardcoded home anchor (`HOME_DISTRICT_X = 500`, `HOME_DISTRICT_Y = 490`) in `movement.ts`.

Enemy variety by tier (from `PROGRESSION.combatWeights` in `balance.ts`):

- wisps from tier 0 (no `minTier` gate)
- raiders from tier 1
- rushers from tier 2
- brutes from tier 3
- sappers from tier 4
- leech from tier 5
- phantom / zapper from tier 6
- corruptors gate at tier 1; blights are a corruptor variant that replaces the corruptor slot 35% of the time at tier 5+

Note that `derived.progression.tier` is a capped display tier (max 5). Any late-game gate that talks about tier 8/9/10 must use `derived.progression.score / PROGRESSION.tiersPerScore` instead of the capped tier field — for example, the threat-rank achievements and the lost-drone event roll.

## Spawn Director

`computeProgressionDirector` in `progression.ts`:

- `intervalPerTurret` 1.5 and `intervalPerScout` 1.0 — a healthy turret/scout line eases spawn interval without starving the field.
- `fillRatio = liveEnemyCount / enemyCap` drives a 1×–1.85× `fillFactor` that multiplies the clamped spawn interval (so a truly full field can stretch cadence past `intervalMax`). Decays smoothly back as kills clear the field.
- `recoveryStrength` lerps the wave-budget ceiling from 1.3 → 1.05 in `spawns.ts`. Boolean `recoveryMode` is preserved (threshold 0.4) for log prefixes and the early-break gate at `spawns.ts:102`.

## Archetypes

Every enemy carries an `archetype` field derived from `ENEMY_ARCHETYPE` in `balance.ts`, plus a `squadId` bucketed by `spawnTick / ENEMY_AI.squadBucketTicks` used for emergent group flanking. Target selection in `targeting.ts` (`pickEnemyTarget`) is archetype-aware:

- **direct** (mite, rusher, brute) — straight-line pursuit; prefer wounded or stationary workers; brute ignores crowding so it anchors through groups. Brutes also reuse a valid target for short `ENEMY_AI.tankTargetRefreshTicks` windows to prevent slow tank movement from jittering.
- **flanker** (raider, wisp) — aim at the worker's predicted position (`target + workerVelocity * ENEMY_AI.flankerLeadTicks`) with a tangent blend so the arrival arcs in; prefer isolated, unalert workers.
- **ambusher** (sapper) — approach at `ambusherApproachScale`; once inside `ambusherDashTrigger`, flip on `dashTicks` for a `ambusherDashDuration`-tick burst at `ambusherDashSpeedScale` (1.8×).
- **ghost** (phantom) — while cloaked, reposition behind the worker's movement vector by `ghostRepositionOffset` px so it uncloaks behind the victim.
- **skirmisher** (zapper) — keeps the existing hold-distance logic; picks targets with fewest nearby allies AND fewest nearby hostiles (avoid dogpiling).
- **driver** (leech) — home-district rush, unchanged.
- **infester** (corruptor, blight) — node-attach behaviour, unchanged.

Squadmates sharing a target spread across `ENEMY_AI.squadBearingBuckets` (6) bearing slices; each enemy prefers the bucket with fewest same-squad competitors, producing emergent flanking without an explicit coordinator.

## Multi-Class Targeting

Combat enemies can pivot between workers, turrets, scouts, sentinels, and the city via `ENEMY_TARGET_PRIORITY[kind]` in `balance.ts` (shape `{ worker, turret, sentinel, scout, city }`). `pickEnemyTargetMulti` in `targeting.ts` scores each deployed/live class as `priority / (distance + 40)` and returns `{ kind, id, x, y }` — id is `null` for the city.

Eligibility rules — **only consider deployed/live targets**:

- Use `derived.activeTurrets`, `derived.activeScouts`, `derived.activeSentinels`. Do not iterate raw turret/scout/sentinel arrays for target eligibility.
- Broken-but-deployed turrets remain valid (the hull is visible in the field).
- Rebooting scouts/sentinels are not valid picks.
- Workers are valid only when `active`, `hp > 0`, not `corrupted`, and `rebootTicks <= 0`. Keep cached target reuse and contact-damage paths aligned with those same rules so enemies do not chase or damage immune/off-field workers.

`stepEnemies` in `movement.ts` writes both `Enemy.targetKind` and `Enemy.targetId` so the rest of the sim can look up whatever the enemy is chasing. Archetype-specific refinements (flanker lead, ghost reposition, squad bearing spread) only run when `targetKind === "agent"`; non-worker targets use plain direct pursuit because structures don't have movement vectors.

Corruptor / blight / leech keep zeroed priorities and their existing flows. Most kinds still strongly prefer workers, but a few specialize:

- **brute**: turret 0.85 / city 0.4 — pivots to the line when close.
- **sapper**: turret 1.2 (higher than workers) so it arcs toward defences to detonate.
- **rusher**: scout 0.9 — chases the softer mobile unit.
- **raider / wisp**: scout 0.7, city 0. (Mite, wisp, and raider have `city: 0` so early-game enemies idle instead of city-camping when no workers are nearby. Do not raise this back above 0 without intentional design.)
- **phantom**: sentinel 0.6 — assassinates tanks.
- **zapper**: scout 0.8 — bolts scouts at range.

### Contact damage

At the end of `stepCombat`, enemies with `targetKind ∈ {turret, scout, sentinel, city}` inside `ENEMY_CONTACT_RADIUS.<kind>` apply `ENEMY_CONTACT_DAMAGE[enemy.kind] * TARGET_ARMOR.<kindArmor>` through the existing `damageTurret / damageScout / damageSentinel / damageCity` funnels. Target-class armor (`turretArmor 0.55`, `scoutArmor 0.80`, `sentinelArmor 0.25`, `cityArmor 0.35`) lets you tune per target type once instead of re-tuning every enemy's damage row.

## Warden (Late-Game Infiltrator)

Spawns separately from the normal wave budget — see [workers.md § Warden Spawning](workers.md#warden-spawning). Wardens do not fight workers directly; they attach and corrupt. See [workers.md § Worker Corruption](workers.md#worker-corruption-warden-system) for the attach/cleanse cycle.

Wardens carry `permanentCloak: true` and are treated as fully cloaked by every system that calls `isCloaked()` (sentinels, scouts, cloak-aware rendering). A warden with a non-null `latchedWorkerId` **uncloaks for the duration of the parasite attach** so defenses can shoot it off. Kill credit still reaches `warden_killed` because worker retaliation during the attach attempt is not filtered by cloak — unit target selection is.

**Cloak rule**: cloak checks go through `isCloaked(enemy)` in `enemyUtils.ts`. Unit target-selection paths must keep calling `isCloaked(enemy)` (do not reimplement the check against `permanentCloak` directly, or latched wardens will stay invisible). Retaliation paths (worker contact during warden attach) intentionally do not consult cloak — do not add a cloak filter there or warden kill credit regresses.

**4.0 defense priority marks do not override this filter.** The player's "mark priority" nudge (`state.priorityMarks`, applied in `getTurretTargetScore`) is a weight bias only; `stepTurrets` still runs the `!isCloaked(enemy)` eligibility filter _before_ scoring, so a marked cloaked enemy is never targetable. See [defenses.md § Defense priority marks](defenses.md).

## Corruptors / Blight

`corruptor`, `blight`:

- **Never attack workers.**
- **Never target gold nodes.**
- Prefer ore/gems/energy.
- Attach while corrupting and reduce economic output.
- Blight is the heavier variant with early scout resistance.

Passive residue cleanup is deliberately slow (`CORRUPTION.purgeBase = 0.12`, `purgePerArsenal = 0.025`) so corruption effects stay visible after corruptors detach. Scout cleansing rates are the active cleanup path and should not be conflated with passive fade.

`state.stats.purges` counts completed node cleanses only. It increments in `stepScouts()` when a node crosses back under the corruption threshold and **must not be incremented for corruptor or blight deaths**.

## Enemy Shield Layer

Three enemy kinds carry a regenerating shield layer on top of normal HP: `leech` (50 HP shield), `phantom` (10 HP shield), `zapper` (20 HP shield). Amounts declared once in `ENEMY_SHIELD.shieldMax` in `balance.ts`.

Fields on `Enemy` (all optional — `undefined` means "no shield mechanic"): `shield`, `shieldMax`, `shieldRegenCooldown`. `spawnEnemy()` in `factories.ts` sets all three for enemies whose kind is in `ENEMY_SHIELD.shieldMax`; migration populates them with full-shield defaults for existing saves.

### Damage routing

All hostile damage paths (turret beam, sentinel shot, scout shot) go through **`damageEnemy(enemy, amount)`** in `enemyUtils.ts` rather than subtracting from `enemy.hp` directly. `damageEnemy`:

- Deducts from the shield first.
- **Does not spill overflow into HP in the same hit.** If a shielded enemy takes a hit larger than its remaining shield, the excess is discarded until a later hit lands.
- Resets `shieldRegenCooldown` to `ENEMY_SHIELD.regenDelayTicks` (90).

Any new damage source must use this helper, not raw `enemy.hp -=`.

### Regeneration

`stepEnemyShields()` runs after `stepZapperFire()` and before `resolveEnemyDeaths()`. While `shieldRegenCooldown > 0` it decrements by 1; otherwise, if `shield < shieldMax`, shield recovers by `ENEMY_SHIELD.regenRatePerTick` (0.25). Dying enemies (`hp <= 0`) skip regen.

### Render

`FieldSvg.tsx` computes `hasShield`, `shieldPct`, and pulsing state once per enemy and injects a dashed cyan ring + soft glow + thin shield bar **stacked above the HP bar** into render blocks for shielded kinds. Because leech and phantom share the fallback render block, the shield overlay is embedded there too.

### Sentinel kill credit

`sentinels.ts` credits only HP-lethal sentinel hits after shield routing. Because shield overflow does not spill into HP, any target with positive shield remaining before the shot is treated as non-lethal for sentinel-kill achievements; once shield is gone, the normal `target.hp - damage <= 0` check applies.

### Turret missile behavior (legacy missiles)

Homing missiles steer only toward their original live target. Launched missiles have a small terminal grace radius (`missileGraceRadius`) so a shot that arrives just behind a moving target can still connect. If the original target dies right before impact, a missile close to that enemy's death-fade position can resolve there and disappear without dealing splash. Missiles never retarget; if the original target cloaks, disappears, or dies outside corpse grace, the missile fizzles.
