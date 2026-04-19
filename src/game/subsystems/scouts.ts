import { SCOUT } from "@/game/balance";
import { addProjectile } from "@/game/factories";
import type { GameState } from "@/game/types";
import { clamp, dist } from "@/game/utils";

function scoutAvoidance(state: GameState, sx: number, sy: number): { ax: number; ay: number } {
  let ax = 0, ay = 0;
  for (const enemy of state.enemies) {
    if (enemy.role === "corruptor") continue;
    const dx = sx - enemy.x;
    const dy = sy - enemy.y;
    const d = Math.hypot(dx, dy);
    if (d < SCOUT.avoidRadius && d > 0) {
      const strength = (SCOUT.avoidRadius - d) / SCOUT.avoidRadius;
      ax += (dx / d) * strength;
      ay += (dy / d) * strength;
    }
  }
  return { ax, ay };
}

export function stepScouts(state: GameState) {
  const corruptors = state.enemies.filter((enemy) => enemy.role === "corruptor");
  const corruptedNodes = [...state.nodes]
    .filter((node) => node.corruption > 8 && node.kind !== "gold")
    .sort((a, b) => b.corruption - a.corruption || a.id - b.id);
  const liveScouts = Math.min(state.scouts.length, state.upgrades.scout, SCOUT.capBase + (state.upgrades.scout >= SCOUT.capBoostThreshold ? SCOUT.capBoostAmount : 0));

  state.scouts.forEach((scout, index) => {
    const live = index < liveScouts;
    scout.pulse = (scout.pulse + 0.08) % (Math.PI * 2);
    scout.cooldown = Math.max(0, scout.cooldown - 1);

    if (!live) {
      scout.targetId = null;
      scout.tx = scout.homeX;
      scout.ty = scout.homeY;
      const sdx = scout.homeX - scout.x;
      const sdy = scout.homeY - scout.y;
      const sd = Math.hypot(sdx, sdy);
      if (sd > 1) {
        const { ax, ay } = scoutAvoidance(state, scout.x, scout.y);
        const mx = sdx / sd + ax * 1.2;
        const my = sdy / sd + ay * 1.2;
        const ml = Math.max(1, Math.hypot(mx, my));
        const s = Math.min(sd, scout.speed * 0.8);
        scout.x += (mx / ml) * s;
        scout.y += (my / ml) * s;
        scout.angle = Math.atan2(my, mx);
      }
      scout.task = "Standby";
      return;
    }

    const currentTarget = corruptors.find((enemy) => enemy.id === scout.targetId);
    const interceptTarget =
      currentTarget ??
      [...corruptors].sort((a, b) => {
        const aDistance = dist(a.x, a.y, scout.x, scout.y);
        const bDistance = dist(b.x, b.y, scout.x, scout.y);
        return aDistance - bDistance;
      })[Math.min(index, Math.max(0, corruptors.length - 1))];

    if (interceptTarget) {
      scout.targetId = interceptTarget.id;
      scout.tx = interceptTarget.x;
      scout.ty = interceptTarget.y;

      const dx = interceptTarget.x - scout.x;
      const dy = interceptTarget.y - scout.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      scout.angle = Math.atan2(dy, dx);
      const preferredRange = SCOUT.preferredRangeBase + state.upgrades.scout * SCOUT.preferredRangePerScout + state.upgrades.arsenal * SCOUT.preferredRangePerArsenal;

      if (d > preferredRange) {
        scout.x += (dx / d) * (scout.speed + state.upgrades.scout * SCOUT.speedPerScout + state.upgrades.arsenal * SCOUT.speedPerArsenal);
        scout.y += (dy / d) * (scout.speed + state.upgrades.scout * SCOUT.speedPerScout + state.upgrades.arsenal * SCOUT.speedPerArsenal);
        scout.task = "Intercepting";
      } else {
        const orbit = Math.sin((state.timers.tick + scout.id * 19) / 14) * 0.9;
        scout.x += (-dy / d) * orbit;
        scout.y += (dx / d) * orbit;
        scout.task = "Purging";
      }

      if (d <= preferredRange + 10 && scout.cooldown <= 0) {
        const damage = SCOUT.damageBase + state.upgrades.scout * SCOUT.damagePerScout + state.upgrades.arsenal * SCOUT.damagePerArsenal;
        scout.cooldown = Math.max(SCOUT.cooldownFloor, Math.round(SCOUT.cooldownBase - state.upgrades.scout * SCOUT.cooldownPerScout - state.upgrades.arsenal * SCOUT.cooldownPerArsenal));
        addProjectile(
          state,
          scout.x,
          scout.y,
          interceptTarget.x,
          interceptTarget.y,
          "rgba(220, 170, 255, 0.95)",
          2.4,
          8
        );
        interceptTarget.hp -= damage;
        interceptTarget.flash = 7;
      }

      return;
    }

    const sweepNode = corruptedNodes[Math.min(index, Math.max(0, corruptedNodes.length - 1))];
    if (sweepNode) {
      scout.targetId = null;
      scout.tx = sweepNode.x;
      scout.ty = sweepNode.y;
      const dx = sweepNode.x - scout.x;
      const dy = sweepNode.y - scout.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      scout.angle = Math.atan2(dy, dx);

      if (d > 28) {
        scout.x += (dx / d) * (0.6 + scout.speed * 0.55);
        scout.y += (dy / d) * (0.6 + scout.speed * 0.55);
      } else {
        const cleanseRate = SCOUT.cleanseRateBase + state.upgrades.arsenal * SCOUT.cleanseRatePerArsenal;
        sweepNode.corruption = clamp(sweepNode.corruption - cleanseRate, 0, 100);
        if (sweepNode.corruption <= 3) {
          sweepNode.corrupted = false;
          sweepNode.corruptedBy = null;
        }
      }

      scout.task = "Sweeping";
      return;
    }

    const patrolX = scout.homeX + Math.cos((state.timers.tick + scout.id * 21) / 20) * 18;
    const patrolY = scout.homeY - 10 + Math.sin((state.timers.tick + scout.id * 15) / 24) * 12;
    scout.targetId = null;
    scout.tx = patrolX;
    scout.ty = patrolY;
    const pdx = patrolX - scout.x;
    const pdy = patrolY - scout.y;
    const pd = Math.hypot(pdx, pdy);
    if (pd > 1) {
      const { ax, ay } = scoutAvoidance(state, scout.x, scout.y);
      const mx = pdx / pd + ax * 1.2;
      const my = pdy / pd + ay * 1.2;
      const ml = Math.max(1, Math.hypot(mx, my));
      const s = Math.min(pd, scout.speed * 0.9);
      scout.x += (mx / ml) * s;
      scout.y += (my / ml) * s;
      scout.angle = Math.atan2(my, mx);
    }
    scout.task = "Patrolling";
  });
}
