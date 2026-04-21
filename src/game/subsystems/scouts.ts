import { ENEMY_SPECIAL, FLUX, SCOUT, SCOUT_AI } from "@/game/balance";
import { addProjectile } from "@/game/factories";
import { damageEnemy } from "@/game/enemyUtils";
import type { GameState } from "@/game/types";
import { clamp, dist, pushLog } from "@/game/utils";

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
    .filter((node) => node.kind !== "gold" && (node.corrupted || node.corruption > 3));
  const liveScouts = Math.min(
    state.scouts.length,
    state.upgrades.scout,
    SCOUT.capBase + (state.upgrades.scout >= SCOUT.capBoostThreshold ? SCOUT.capBoostAmount : 0)
  );

  // Node scoring combines finish-job bias (close to cleanse threshold) with
  // stop-bleed bias (actively being corrupted). We alternate emphasis based
  // on which pile is larger so both priorities get airtime.
  const activelyCorrupting = corruptedNodes.filter(
    (node) => node.corruptedBy != null && node.corruption < 100
  ).length;
  const finishable = corruptedNodes.filter(
    (node) => node.corruption <= SCOUT_AI.finishNodeThreshold
  ).length;
  const preferFinish = finishable >= activelyCorrupting;
  const rankedNodes = [...corruptedNodes].sort((a, b) => {
    const aFinish = a.corruption <= SCOUT_AI.finishNodeThreshold ? SCOUT_AI.finishNodeBias : 0;
    const bFinish = b.corruption <= SCOUT_AI.finishNodeThreshold ? SCOUT_AI.finishNodeBias : 0;
    const aBleed = a.corruptedBy != null && a.corruption < 100 ? SCOUT_AI.stopBleedBias : 0;
    const bBleed = b.corruptedBy != null && b.corruption < 100 ? SCOUT_AI.stopBleedBias : 0;
    // Higher score = higher priority. preferFinish doubles the finish bias;
    // otherwise bleed gets the double. Raw corruption is a small tiebreaker
    // so ties between equally-biased nodes favour the dirtier one.
    const aScore =
      (preferFinish ? aFinish * 2 : aFinish) +
      (preferFinish ? aBleed : aBleed * 2) +
      a.corruption * 0.05;
    const bScore =
      (preferFinish ? bFinish * 2 : bFinish) +
      (preferFinish ? bBleed : bBleed * 2) +
      b.corruption * 0.05;
    return bScore - aScore || a.id - b.id;
  });

  // Pair-up: if we have enough scouts and a node is over the pair threshold,
  // let the second scout stack there instead of moving on.
  const pairUpEnabled = liveScouts >= SCOUT_AI.pairUpScoutCount;
  const pairUpNodeId = pairUpEnabled
    ? rankedNodes.find((node) => node.corruption >= SCOUT_AI.pairUpCorruptionThreshold)?.id ?? null
    : null;

  // Pre-pass: determine which corrupted node each active scout without a corruptor target would sweep.
  const nodeAssignCounts = new Map<number, number>(); // nodeId → number of scouts assigned
  if (corruptors.length === 0 && rankedNodes.length > 0) {
    for (let i = 0; i < liveScouts; i++) {
      let nodeIndex = Math.min(i, rankedNodes.length - 1);
      if (i === 1 && pairUpNodeId !== null) {
        nodeIndex = rankedNodes.findIndex((node) => node.id === pairUpNodeId);
      }
      const nodeId = rankedNodes[nodeIndex].id;
      nodeAssignCounts.set(nodeId, (nodeAssignCounts.get(nodeId) ?? 0) + 1);
    }
  }

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
    // Rate-weighted corruptor scoring: blights deal more corruption per tick
    // than regular corruptors, and corruptors near nodes that are close to
    // overflow are higher-leverage to kill. Distance still matters.
    const scoredCorruptors = corruptors
      .map((enemy) => {
        const rate =
          enemy.kind === "blight"
            ? ENEMY_SPECIAL.blight.corruptionRatePerTick
            : 0.12;
        const attachedNode = enemy.targetNodeId != null
          ? state.nodes.find((node) => node.id === enemy.targetNodeId)
          : undefined;
        const urgency = attachedNode ? 1 + attachedNode.corruption / 100 : 1;
        const d = dist(scout.x, scout.y, enemy.x, enemy.y);
        const score = d * SCOUT_AI.distanceScoreWeight - rate * urgency * SCOUT_AI.rateScoreWeight;
        return { enemy, score };
      })
      .sort((a, b) => a.score - b.score);
    const interceptTarget =
      currentTarget ??
      scoredCorruptors[Math.min(index, Math.max(0, scoredCorruptors.length - 1))]?.enemy;

    if (interceptTarget) {
      scout.targetId = interceptTarget.id;
      scout.tx = interceptTarget.x;
      scout.ty = interceptTarget.y;

      const dx = interceptTarget.x - scout.x;
      const dy = interceptTarget.y - scout.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      scout.angle = Math.atan2(dy, dx);
      const preferredRange =
        SCOUT.preferredRangeBase +
        state.upgrades.scout * SCOUT.preferredRangePerScout +
        state.upgrades.arsenal * SCOUT.preferredRangePerArsenal;

      if (d > preferredRange) {
        const spd = scout.speed + state.upgrades.scout * SCOUT.speedPerScout + state.upgrades.arsenal * SCOUT.speedPerArsenal;
        scout.x += (dx / d) * spd;
        scout.y += (dy / d) * spd;
        scout.task = "Intercepting";
      } else {
        const orbit = Math.sin((state.timers.tick + scout.id * 19) / 14) * 0.9;
        scout.x += (-dy / d) * orbit;
        scout.y += (dx / d) * orbit;
        scout.task = "Purging";
      }

      if (d <= preferredRange + 10 && scout.cooldown <= 0) {
        const damage =
          SCOUT.damageBase +
          state.upgrades.scout * SCOUT.damagePerScout +
          state.upgrades.arsenal * SCOUT.damagePerArsenal;
        scout.cooldown = Math.max(
          SCOUT.cooldownFloor,
          Math.round(
            SCOUT.cooldownBase -
            state.upgrades.scout * SCOUT.cooldownPerScout -
            state.upgrades.arsenal * SCOUT.cooldownPerArsenal
          )
        );
        addProjectile(state, scout.x, scout.y, interceptTarget.x, interceptTarget.y, "rgba(220, 170, 255, 0.95)", 2.4, 8);
        let effectiveDamage = damage;
        if (
          interceptTarget.kind === "blight" &&
          state.upgrades.arsenal < ENEMY_SPECIAL.blight.arsenalResistThreshold
        ) {
          effectiveDamage *= 1 - ENEMY_SPECIAL.blight.scoutDamageResistance;
        }
        damageEnemy(interceptTarget, effectiveDamage);
        interceptTarget.flash = 7;
      }

      return;
    }

    // Route to corrupted node. Pair-up logic routes the second live scout to
    // an over-threshold node; beyond that we spread across rankedNodes.
    let sweepNode = null;
    if (rankedNodes.length > 0) {
      if (index === 1 && pairUpNodeId !== null) {
        sweepNode = rankedNodes.find((node) => node.id === pairUpNodeId) ?? null;
      }
      if (!sweepNode) {
        sweepNode = rankedNodes[Math.min(index, rankedNodes.length - 1)];
      }
    }

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
        const tickFlux =
          FLUX.cleanseTickReward *
          (state.eventModifiers.fluxPurgeMultiplier ?? 1) *
          (1 + state.upgrades.arsenal * FLUX.arsenalTickBonus);
        state.resources.flux = Math.min(
          FLUX.softCap + FLUX.overCapBuffer,
          state.resources.flux + tickFlux
        );

        const baseCleanseRate = SCOUT.cleanseRateBase + state.upgrades.arsenal * SCOUT.cleanseRatePerArsenal;
        // Synergy: each additional scout on the same node adds 60% of base cleanse rate.
        const assignedCount = nodeAssignCounts.get(sweepNode.id) ?? 1;
        const synergy = 1 + (assignedCount - 1) * SCOUT.cleanseSynergyPerExtra;
        const wasActiveCorruption =
          sweepNode.corrupted || sweepNode.corruptedBy != null || sweepNode.corruption > 3;
        sweepNode.corruption = clamp(sweepNode.corruption - baseCleanseRate * synergy, 0, 100);
        if (wasActiveCorruption && sweepNode.corruption <= 3) {
          sweepNode.corrupted = false;
          sweepNode.corruptedBy = null;
          state.stats.purges += 1;
          state.resources.flux = Math.min(
            FLUX.softCap,
            state.resources.flux + FLUX.cleanseCompletionBonus * (state.eventModifiers.fluxPurgeMultiplier ?? 1)
          );
          state.log = pushLog(state.log, "Node cleansed. Flux recovered.", "corruption", state.timers.tick);
        }
      }

      scout.task = "Sweeping";
      return;
    }

    // Patrol — no threats, no corrupted nodes.
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
