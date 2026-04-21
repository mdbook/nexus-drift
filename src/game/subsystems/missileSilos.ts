import { MISSILE_SILO } from "@/game/balance";
import { addMissile } from "@/game/factories";
import { isCloaked } from "@/game/enemyUtils";
import type { GameState } from "@/game/types";
import { dist, pushLog } from "@/game/utils";

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

    // Pick the most dangerous eligible enemy within range.
    const target = [...state.enemies]
      .filter(
        (e) =>
          e.hp > 0 &&
          e.role !== "corruptor" &&
          !isCloaked(e) &&
          dist(silo.x, silo.y, e.x, e.y) <= range
      )
      .sort((a, b) => {
        // Higher threat-tier first; wounded first within the same tier.
        const tierA = a.kind === "brute" ? 2 : a.kind === "leech" ? 1.5 : 1;
        const tierB = b.kind === "brute" ? 2 : b.kind === "leech" ? 1.5 : 1;
        if (tierA !== tierB) return tierB - tierA;
        return a.hp - b.hp; // wounded-first tiebreak
      })[0];

    if (!target) continue;

    silo.targetId = target.id;
    silo.angle = Math.atan2(target.y - silo.y, target.x - silo.x);

    const d = Math.max(1, Math.hypot(target.x - silo.x, target.y - silo.y));
    const vx = (target.x - silo.x) / d;
    const vy = (target.y - silo.y) / d;

    addMissile(state, silo.x, silo.y, vx, vy, target.id, damage, {
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
