import { SENTINEL, SENTINEL_AI } from "@/game/balance";
import { addProjectile } from "@/game/factories";
import { damageEnemy } from "@/game/enemyUtils";
import type { Enemy, EnemyKind, GameState } from "@/game/types";
import { dist } from "@/game/utils";

const PRIORITY_BONUS: Partial<Record<EnemyKind, number>> = {
  leech: 240,
  brute: 180,
  sapper: 120,
};

/**
 * Pick the sentinel's best threat target — weighted by how close the enemy
 * is to its own worker victim, not just to the sentinel. A brute mid-field
 * between a sentinel and a worker outranks a closer brute that's drifting
 * away from anyone. Priority kinds (leech > brute > sapper) get bonus mass.
 */
function pickSentinelTarget(sentinel: { x: number; y: number }, state: GameState): Enemy | null {
  let best: Enemy | null = null;
  let bestScore = Infinity;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.role !== "combat") continue;
    let nearestWorkerDist = Infinity;
    for (const worker of state.agents) {
      if (!worker.active) continue;
      const d = dist(enemy.x, enemy.y, worker.x, worker.y);
      if (d < nearestWorkerDist) nearestWorkerDist = d;
    }
    if (!Number.isFinite(nearestWorkerDist)) nearestWorkerDist = SENTINEL_AI.threatWorkerRadiusBias;
    const selfDist = dist(sentinel.x, sentinel.y, enemy.x, enemy.y);
    const priorityBonus = PRIORITY_BONUS[enemy.kind] ?? 0;
    const score = nearestWorkerDist + selfDist * 0.4 - priorityBonus;
    if (score < bestScore) { bestScore = score; best = enemy; }
  }
  return best;
}

export function stepSentinels(state: GameState) {
  const liveCount = Math.min(
    state.sentinels.length,
    state.upgrades.sentinel * SENTINEL.capPerUpgrade
  );

  // Precompute active-worker centroid for patrol placement.
  let centroidX = 0, centroidY = 0, centroidCount = 0;
  for (const agent of state.agents) {
    if (!agent.active) continue;
    centroidX += agent.x;
    centroidY += agent.y;
    centroidCount += 1;
  }
  if (centroidCount > 0) {
    centroidX /= centroidCount;
    centroidY /= centroidCount;
  }

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

    const target = pickSentinelTarget(sentinel, state);

    if (target) {
      sentinel.targetId = target.id;

      // Intercept positioning — if the threat has a worker target, aim for
      // a point between them (predicting the worker's near-future position)
      // so we get between enemy and victim.
      let aimX = target.x;
      let aimY = target.y;
      if (target.targetId !== null && target.targetId !== undefined) {
        const worker = state.agents.find((agent) => agent.id === target.targetId && agent.active);
        if (worker) {
          const wdx = worker.tx - worker.x;
          const wdy = worker.ty - worker.y;
          const wmag = Math.hypot(wdx, wdy);
          let leadX = worker.x;
          let leadY = worker.y;
          if (wmag > 0.5) {
            const lead = SENTINEL_AI.interceptLeadTicks * worker.speed;
            leadX = worker.x + (wdx / wmag) * lead;
            leadY = worker.y + (wdy / wmag) * lead;
          }
          aimX = target.x + (leadX - target.x) * SENTINEL_AI.interceptLerp;
          aimY = target.y + (leadY - target.y) * SENTINEL_AI.interceptLerp;
        }
      }

      sentinel.tx = aimX;
      sentinel.ty = aimY;

      const dxAim = aimX - sentinel.x;
      const dyAim = aimY - sentinel.y;
      const distAim = Math.max(1, Math.hypot(dxAim, dyAim));

      // Always face the actual threat, even when moving toward the intercept point.
      const dxTarget = target.x - sentinel.x;
      const dyTarget = target.y - sentinel.y;
      const distTarget = Math.max(1, Math.hypot(dxTarget, dyTarget));
      sentinel.angle = Math.atan2(dyTarget, dxTarget);

      if (distAim > 6) {
        sentinel.x += (dxAim / distAim) * sentinel.speed;
        sentinel.y += (dyAim / distAim) * sentinel.speed;
        sentinel.task = "Intercepting";
      } else {
        sentinel.task = "Engaging";
      }

      if (distTarget <= SENTINEL.rangeBase && sentinel.cooldown <= 0) {
        const damage = SENTINEL.damageBase + state.upgrades.sentinel * SENTINEL.damagePerSentinel;
        const effectiveHpAfter =
          target.shield !== undefined && target.shield > 0
            ? target.hp
            : target.hp - damage;
        if (effectiveHpAfter <= 0) {
          state.stats.sentinelKills += 1;
        }
        damageEnemy(target, damage);
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
    // Patrol: blend fixed patrolY with active-worker centroid so late-game
    // off-center worker deployments still get cover.
    const patrolBaseY =
      centroidCount > 0
        ? SENTINEL.patrolY * (1 - SENTINEL_AI.workerCentroidPatrolWeight) +
          centroidY * SENTINEL_AI.workerCentroidPatrolWeight
        : SENTINEL.patrolY;
    const patrolBaseX =
      centroidCount > 0
        ? sentinel.homeX * 0.4 + centroidX * 0.6
        : sentinel.homeX;
    sentinel.tx =
      patrolBaseX +
      Math.cos((state.timers.tick + sentinel.id * 31) / 28) * SENTINEL.patrolRadius;
    sentinel.ty = patrolBaseY + Math.sin((state.timers.tick + sentinel.id * 23) / 32) * 30;
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
