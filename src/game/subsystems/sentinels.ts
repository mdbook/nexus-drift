import { FLUX, SENTINEL, SENTINEL_AI, SENTINEL_HP, WARDEN } from "@/game/balance";
import { addProjectile } from "@/game/factories";
import { damageEnemy, isCloaked } from "@/game/enemyUtils";
import { damageCorruptedWorker } from "@/game/subsystems/combat";
import type { Agent, Enemy, EnemyKind, GameState } from "@/game/types";
import { dist, pushLog } from "@/game/utils";

/** Purple cleanse-beam colour — distinct from the yellow combat projectile. */
const CLEANSE_PROJECTILE_COLOR = "rgba(192, 132, 252, 0.9)";

/**
 * Find the nearest visible corrupted worker for sentinel cleanse targeting.
 * A worker is "visible" if it is within corruptionVisionRadius of the sentinel
 * OR if a healthy worker nearby has spotted it (spottedTicks > 0).
 */
function pickCleanseTarget(sentinel: { x: number; y: number }, state: GameState): Agent | null {
  let best: Agent | null = null;
  let bestDist = Infinity;
  for (const agent of state.agents) {
    if (!agent.active || !agent.corrupted) continue;
    const d = dist(sentinel.x, sentinel.y, agent.x, agent.y);
    if (d <= WARDEN.corruptionVisionRadius || agent.spottedTicks > 0) {
      if (d < bestDist) {
        bestDist = d;
        best = agent;
      }
    }
  }
  return best;
}

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
    // 3.1.0 — sentinels can't acquire cloaked threats (phantoms mid-cycle,
    // wardens always). Phantoms become targetable when their cycle resurfaces.
    if (isCloaked(enemy)) continue;
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
    if (score < bestScore) {
      bestScore = score;
      best = enemy;
    }
  }
  return best;
}

export function stepSentinels(state: GameState) {
  const liveCount = Math.min(state.sentinels.length, state.upgrades.sentinel * SENTINEL.capPerUpgrade);

  // Precompute active-worker centroid for patrol placement.
  let centroidX = 0,
    centroidY = 0,
    centroidCount = 0;
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
    // 3.0.0: recompute maxHp every tick so sentinel/shield upgrades buff HP
    // live; scale current HP proportionally to avoid mid-fight resets.
    const nextMaxHp =
      SENTINEL_HP.hpBase +
      state.upgrades.sentinel * SENTINEL_HP.hpPerSentinelUpgrade +
      state.upgrades.shield * SENTINEL_HP.hpPerShieldUpgrade;
    if (sentinel.maxHp !== nextMaxHp && sentinel.maxHp > 0) {
      const ratio = sentinel.hp / sentinel.maxHp;
      sentinel.hp = nextMaxHp * ratio;
    }
    sentinel.maxHp = nextMaxHp;
    sentinel.hp = Math.min(sentinel.hp, sentinel.maxHp);

    if (sentinel.damageTicks > 0) sentinel.damageTicks -= 1;

    const live = index < liveCount;
    sentinel.pulse = (sentinel.pulse + 0.05) % (Math.PI * 2);
    sentinel.cooldown = Math.max(0, sentinel.cooldown - 1);

    // 3.2.0: zapper disruptor gate. A sentinel hit by a zapper bolt freezes
    // in place for ZAPPER.disableDurationTicks — no cleanse, no combat.
    if (sentinel.disabledTicks > 0) {
      sentinel.disabledTicks -= 1;
      sentinel.task = "Disabled";
      return;
    }

    // 3.0.0: reboot lifecycle — parked at home, fully offline, full-HP
    // respawn on the tick the counter reaches 0.
    if (sentinel.rebootTicks > 0) {
      sentinel.rebootTicks -= 1;
      sentinel.x = sentinel.homeX;
      sentinel.y = sentinel.homeY;
      sentinel.tx = sentinel.homeX;
      sentinel.ty = sentinel.homeY;
      sentinel.targetId = null;
      sentinel.task = "Rebooting";
      if (sentinel.rebootTicks === 0) {
        sentinel.hp = sentinel.maxHp;
        sentinel.retreating = false;
        state.log = pushLog(state.log, "Sentinel redeployed from home pad.", "combat", state.timers.tick);
      }
      return;
    }

    // 3.0.0: retreat state machine — enter at 35% HP, exit at 90%.
    if (!sentinel.retreating && sentinel.hp < sentinel.maxHp * SENTINEL_HP.retreatHpRatio) {
      sentinel.retreating = true;
      sentinel.targetId = null;
    } else if (sentinel.retreating && sentinel.hp >= sentinel.maxHp * SENTINEL_HP.exitRetreatHpRatio) {
      sentinel.retreating = false;
    }

    if (sentinel.retreating) {
      const dxHome = sentinel.homeX - sentinel.x;
      const dyHome = sentinel.homeY - sentinel.y;
      const dHome = Math.hypot(dxHome, dyHome);
      if (dHome > 1) {
        const spd = Math.min(dHome, sentinel.speed * SENTINEL_HP.retreatSpeedScale);
        sentinel.x += (dxHome / dHome) * spd;
        sentinel.y += (dyHome / dHome) * spd;
        sentinel.angle = Math.atan2(dyHome, dxHome);
      }
      if (dist(sentinel.x, sentinel.y, sentinel.homeX, sentinel.homeY) <= SENTINEL_HP.homeHealRadius) {
        sentinel.hp = Math.min(sentinel.maxHp, sentinel.hp + SENTINEL_HP.healRatePerTick);
      }
      sentinel.task = "Retreating";
      sentinel.tx = sentinel.homeX;
      sentinel.ty = sentinel.homeY;
      return;
    }

    // Passive home-pad top-off for lightly damaged sentinels that are not
    // below the retreat threshold. Half rate so it's not a free heal.
    if (
      sentinel.hp < sentinel.maxHp &&
      dist(sentinel.x, sentinel.y, sentinel.homeX, sentinel.homeY) <= SENTINEL_HP.homeHealRadius
    ) {
      sentinel.hp = Math.min(sentinel.maxHp, sentinel.hp + SENTINEL_HP.healRatePerTick * 0.5);
    }

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

    // 3.0.0 Step 7: Corrupted-worker cleanse — takes priority over enemy combat.
    // Sentinel moves to the visible corrupted worker and fires a purple cleanse
    // beam until its HP reaches 0, then fully purges the corruption.
    const cleanseTarget = pickCleanseTarget(sentinel, state);
    if (cleanseTarget) {
      sentinel.targetId = null;
      const dxC = cleanseTarget.x - sentinel.x;
      const dyC = cleanseTarget.y - sentinel.y;
      const distC = Math.max(1, Math.hypot(dxC, dyC));

      sentinel.tx = cleanseTarget.x;
      sentinel.ty = cleanseTarget.y;
      sentinel.angle = Math.atan2(dyC, dxC);

      if (distC > 6) {
        sentinel.x += (dxC / distC) * sentinel.speed;
        sentinel.y += (dyC / distC) * sentinel.speed;
      }
      sentinel.task = "Cleansing";

      if (distC <= SENTINEL.rangeBase && sentinel.cooldown <= 0) {
        const cleanseDamage = SENTINEL.damageBase + state.upgrades.sentinel * SENTINEL.damagePerSentinel;
        damageCorruptedWorker(cleanseTarget, cleanseDamage);

        sentinel.cooldown = Math.max(
          SENTINEL.cooldownFloor,
          Math.round(SENTINEL.cooldownBase - state.upgrades.sentinel * 2)
        );
        addProjectile(
          state,
          sentinel.x,
          sentinel.y,
          cleanseTarget.x,
          cleanseTarget.y,
          CLEANSE_PROJECTILE_COLOR,
          SENTINEL.projectileWidth,
          SENTINEL.projectileLife
        );

        if (cleanseTarget.hp <= 0) {
          // Cleanse complete — purge corruption, restore HP, enter reboot.
          cleanseTarget.corrupted = false;
          cleanseTarget.corruptionTicks = 0;
          cleanseTarget.corruptingTicks = 0;
          cleanseTarget.maxHp = WARDEN.workerBaseHp;
          cleanseTarget.hp = cleanseTarget.maxHp;
          cleanseTarget.rebootTicks = WARDEN.corruptionRebootTicks;
          state.resources.flux = Math.min(
            FLUX.softCap + FLUX.overCapBuffer,
            state.resources.flux + WARDEN.cleanseFluxReward
          );
          state.resources.cores += WARDEN.cleanseCoreReward;
          state.stats.corruptedPurified += 1;
          state.log = pushLog(
            state.log,
            `Sentinel cleanses a corrupted ${cleanseTarget.kind} worker. Reboot initiated.`,
            "corruption",
            state.timers.tick
          );
        }
      }
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
          target.shield !== undefined && target.shield > 0 ? target.hp : target.hp - damage;
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
    const patrolBaseX = centroidCount > 0 ? sentinel.homeX * 0.4 + centroidX * 0.6 : sentinel.homeX;
    sentinel.tx = patrolBaseX + Math.cos((state.timers.tick + sentinel.id * 31) / 28) * SENTINEL.patrolRadius;
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
