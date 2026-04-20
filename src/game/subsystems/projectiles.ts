import { TURRET, ZAPPER } from "@/game/balance";
import { isCloaked } from "@/game/enemyUtils";
import type { GameState } from "@/game/types";

export function stepProjectiles(state: GameState) {
  for (const p of state.projectiles) {
    p.life -= 1;

    if (p.tag === "turret-missile" && p.vx !== undefined && p.vy !== undefined) {
      const target = state.enemies.find((e) => e.id === p.targetId && e.hp > 0 && !isCloaked(e));
      if (target) {
        const dx = target.x - p.x1;
        const dy = target.y - p.y1;
        const d = Math.max(1, Math.hypot(dx, dy));
        const steer = TURRET.missileSteering;
        let vx = p.vx * (1 - steer) + (dx / d) * steer;
        let vy = p.vy * (1 - steer) + (dy / d) * steer;
        const vl = Math.max(0.001, Math.hypot(vx, vy));
        vx /= vl;
        vy /= vl;
        p.vx = vx;
        p.vy = vy;
        if (d <= TURRET.missileHitRadius) {
          target.hp -= p.damage ?? 0;
          target.flash = 6;
          p.life = 0;
        }
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
