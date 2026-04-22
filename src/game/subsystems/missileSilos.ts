import { MISSILE_SILO } from "@/game/balance";
import { addMissile } from "@/game/factories";
import { isCloaked } from "@/game/enemyUtils";
import type { GameState } from "@/game/types";
import { dist, pushLog } from "@/game/utils";

function siloTargetTier(kind: GameState["enemies"][number]["kind"]): number {
  if (kind === "brute") return 2;
  if (kind === "leech") return 1.5;
  return 1;
}

/**
 * 3.0.0 Step 5 — missile silo fire step.
 *
 * Each active silo selects the highest-priority combat enemy within
 * `MISSILE_SILO.rangeBase` and launches a homing missile on a slow
 * `fireIntervalTicks` cadence. Priority: brutes > leeches > everything else,
 * then wounded first within each tier.
 *
 * Silo count scales with the `missileLauncher` upgrade level via
 * `MISSILE_SILO.silosByLevel`. Inactive silo slots have `active: false`.
 *
 * Missile flight uses `MISSILE_SILO.missileSpeed` and `missileSteering`
 * (stored on the projectile for `stepProjectiles` to pick up), so silo shots
 * arc in more slowly than turret shots and are harder to kite.
 */
export function stepMissileSilos(state: GameState) {
  const level = state.upgrades.missileLauncher;
  const maxLevel = MISSILE_SILO.silosByLevel.length - 1;
  const activeSiloCount = MISSILE_SILO.silosByLevel[Math.min(level, maxLevel)];

  // Update active flags first so the renderer can react immediately.
  for (let i = 0; i < state.missileSilos.length; i++) {
    state.missileSilos[i].active = i < activeSiloCount;
  }

  if (activeSiloCount === 0) return;

  const range = MISSILE_SILO.rangeBase;
  const damage = MISSILE_SILO.damageBase + level * MISSILE_SILO.damagePerLevel;

  for (let i = 0; i < activeSiloCount; i++) {
    const silo = state.missileSilos[i];
    if (!silo) continue;

    silo.cooldown = Math.max(0, silo.cooldown - 1);
    if (silo.cooldown > 0) continue;

    // Pick the most dangerous eligible enemy within range in one pass. Higher
    // threat-tier wins; wounded first within the same tier. This preserves the
    // previous stable-sort winner by keeping the first candidate on exact ties.
    let bestTarget: GameState["enemies"][number] | null = null;
    let bestTargetTier = -Infinity;
    let bestTargetHp = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      if (enemy.role === "corruptor") continue;
      if (isCloaked(enemy)) continue;
      if (dist(silo.x, silo.y, enemy.x, enemy.y) > range) continue;

      const tier = siloTargetTier(enemy.kind);
      if (tier > bestTargetTier || (tier === bestTargetTier && enemy.hp < bestTargetHp)) {
        bestTarget = enemy;
        bestTargetTier = tier;
        bestTargetHp = enemy.hp;
      }
    }

    if (!bestTarget) continue;

    silo.targetId = bestTarget.id;
    silo.angle = Math.atan2(bestTarget.y - silo.y, bestTarget.x - silo.x);

    const d = Math.max(1, Math.hypot(bestTarget.x - silo.x, bestTarget.y - silo.y));
    const vx = (bestTarget.x - silo.x) / d;
    const vy = (bestTarget.y - silo.y) / d;

    addMissile(state, silo.x, silo.y, vx, vy, bestTarget.id, damage, {
      speed: MISSILE_SILO.missileSpeed,
      maxLife: MISSILE_SILO.missileMaxLife,
      steering: MISSILE_SILO.missileSteering,
      color: "rgba(255, 100, 0, 0.98)",
    });

    silo.cooldown = MISSILE_SILO.fireIntervalTicks;
    state.log = pushLog(
      state.log,
      "Missile silo: long-range strike on target.",
      "combat",
      state.timers.tick
    );
  }
}
