import { SENTINEL } from "@/game/balance";
import { addProjectile } from "@/game/factories";
import { findClosestEnemy } from "@/game/targeting";
import type { EnemyKind, GameState } from "@/game/types";

const PRIORITY_TARGETS: EnemyKind[] = ["leech", "brute", "sapper"];

export function stepSentinels(state: GameState) {
  const liveCount = Math.min(
    state.sentinels.length,
    state.upgrades.sentinel * SENTINEL.capPerUpgrade
  );

  state.sentinels.forEach((sentinel, index) => {
    const live = index < liveCount;
    sentinel.pulse = (sentinel.pulse + 0.05) % (Math.PI * 2);
    sentinel.cooldown = Math.max(0, sentinel.cooldown - 1);

    if (!live) {
      sentinel.targetId = null;
      sentinel.tx = sentinel.homeX;
      sentinel.ty = sentinel.homeY;
      const dx = sentinel.homeX - sentinel.x;
      const dy = sentinel.homeY - sentinel.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1) {
        const step = Math.min(distance, sentinel.speed * 0.7);
        sentinel.x += (dx / distance) * step;
        sentinel.y += (dy / distance) * step;
        sentinel.angle = Math.atan2(dy, dx);
      }
      sentinel.task = "Standby";
      return;
    }

    let target = null;
    for (const kind of PRIORITY_TARGETS) {
      target = findClosestEnemy(
        { x: sentinel.x, y: sentinel.y },
        state.enemies,
        (enemy) => enemy.kind === kind && enemy.hp > 0
      );
      if (target) break;
    }

    if (!target) {
      target = findClosestEnemy(
        { x: sentinel.x, y: sentinel.y },
        state.enemies,
        (enemy) => enemy.role === "combat" && enemy.hp > 0
      );
    }

    if (target) {
      sentinel.targetId = target.id;
      sentinel.tx = target.x;
      sentinel.ty = target.y;
      const dx = target.x - sentinel.x;
      const dy = target.y - sentinel.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      sentinel.angle = Math.atan2(dy, dx);

      if (distance > SENTINEL.rangeBase) {
        sentinel.x += (dx / distance) * sentinel.speed;
        sentinel.y += (dy / distance) * sentinel.speed;
        sentinel.task = "Pursuing";
      } else {
        sentinel.task = "Engaging";
      }

      if (distance <= SENTINEL.rangeBase && sentinel.cooldown <= 0) {
        target.hp -= SENTINEL.damageBase + state.upgrades.sentinel * SENTINEL.damagePerSentinel;
        target.flash = 7;
        sentinel.cooldown = Math.max(
          SENTINEL.cooldownFloor,
          Math.round(SENTINEL.cooldownBase - state.upgrades.sentinel * 2)
        );
        addProjectile(
          state,
          sentinel.x,
          sentinel.y,
          target.x,
          target.y,
          SENTINEL.projectileColor,
          SENTINEL.projectileWidth,
          SENTINEL.projectileLife
        );
      }
      return;
    }

    sentinel.targetId = null;
    sentinel.tx =
      sentinel.homeX +
      Math.cos((state.timers.tick + sentinel.id * 31) / 28) * SENTINEL.patrolRadius;
    sentinel.ty =
      SENTINEL.patrolY + Math.sin((state.timers.tick + sentinel.id * 23) / 32) * 30;
    const dx = sentinel.tx - sentinel.x;
    const dy = sentinel.ty - sentinel.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 1) {
      sentinel.x += (dx / distance) * sentinel.speed * 0.85;
      sentinel.y += (dy / distance) * sentinel.speed * 0.85;
      sentinel.angle = Math.atan2(dy, dx);
    }
    sentinel.task = "Patrolling";
  });
}
