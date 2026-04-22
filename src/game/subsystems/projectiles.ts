import { TURRET, ZAPPER } from "@/game/balance";
import { damageEnemy, isCloaked } from "@/game/enemyUtils";
import type { GameState } from "@/game/types";

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  return Math.hypot(px - cx, py - cy);
}

export function stepProjectiles(state: GameState) {
  // Tick frozen missile; when it expires, spawn the gold explosion
  if (state.frozenMissile !== null) {
    state.frozenMissile.ticks -= 1;
    if (state.frozenMissile.ticks <= 0) {
      state.goldExplosion = { x: state.frozenMissile.x, y: state.frozenMissile.y, ticks: 24, maxTicks: 24 };
      state.projectiles = state.projectiles.filter((p) => p.id !== state.frozenMissile!.id);
      state.frozenMissile = null;
    }
  }

  // Tick gold explosion
  if (state.goldExplosion !== null) {
    state.goldExplosion.ticks -= 1;
    if (state.goldExplosion.ticks <= 0) state.goldExplosion = null;
  }

  // Tick missile click cooldown
  if (state.missileClickCooldown > 0) state.missileClickCooldown -= 1;

  const frozenId = state.frozenMissile?.id;

  for (const p of state.projectiles) {
    if (p.id === frozenId) continue; // frozen — don't move or decrement

    p.life -= 1;

    if (p.tag === "turret-missile" && p.vx !== undefined && p.vy !== undefined) {
      const originalTarget = state.enemies.find((e) => e.id === p.targetId);
      if (originalTarget && originalTarget.hp > 0 && !isCloaked(originalTarget)) {
        const dx = originalTarget.x - p.x1;
        const dy = originalTarget.y - p.y1;
        const d = Math.max(1, Math.hypot(dx, dy));
        const steer = p.steering ?? TURRET.missileSteering;
        let vx = p.vx * (1 - steer) + (dx / d) * steer;
        let vy = p.vy * (1 - steer) + (dy / d) * steer;
        const vl = Math.max(0.001, Math.hypot(vx, vy));
        vx /= vl;
        vy /= vl;
        p.vx = vx;
        p.vy = vy;
        const speed = p.speed ?? TURRET.missileSpeed;
        const nextX = p.x1 + p.vx * speed;
        const nextY = p.y1 + p.vy * speed;
        const stepDistance = distanceToSegment(originalTarget.x, originalTarget.y, p.x1, p.y1, nextX, nextY);
        if (d <= TURRET.missileHitRadius || stepDistance <= TURRET.missileGraceRadius) {
          damageEnemy(originalTarget, p.damage ?? 0);
          originalTarget.flash = 6;
          p.life = 0;
        }
      } else if (
        originalTarget &&
        originalTarget.hp <= 0 &&
        originalTarget.dyingTicks > 0 &&
        distanceToSegment(
          originalTarget.x,
          originalTarget.y,
          p.x1,
          p.y1,
          p.x1 + (p.vx ?? 0) * (p.speed ?? TURRET.missileSpeed),
          p.y1 + (p.vy ?? 0) * (p.speed ?? TURRET.missileSpeed)
        ) <= TURRET.missileCorpseGraceRadius
      ) {
        p.life = 0;
      } else {
        // Missiles remain locked to the original target. If that target is
        // gone, cloaked, or not close enough to the death-fade position, fizzle.
        p.life = 0;
      }
      if (p.life > 0) {
        p.x1 += (p.vx ?? 0) * (p.speed ?? TURRET.missileSpeed);
        p.y1 += (p.vy ?? 0) * (p.speed ?? TURRET.missileSpeed);
        p.x2 = p.x1;
        p.y2 = p.y1;
      }
    }

    if (p.life === 0 && p.tag === "zapper-bolt" && p.targetId !== undefined) {
      if (p.targetKind === "agent") {
        const agent = state.agents.find((a) => a.id === p.targetId);
        if (agent) {
          agent.disabledTicks = ZAPPER.disableDurationTicks;
          agent.task = "Disabled";
        }
      } else if (p.targetKind === "turret") {
        const turret = state.turrets.find((t) => t.id === p.targetId);
        if (turret) turret.disabledTicks = ZAPPER.disableDurationTicks;
      }
    }
  }

  state.projectiles = state.projectiles.filter((p) => p.life > 0);
}
