import {
  EVADE_BONUS_PER_THREAT,
  EVADE_ENTER_RADIUS,
  EVADE_EXIT_RADIUS,
  EVADE_PERSIST_TICKS,
  WORK_TASKS,
  WORLD_H,
  WORLD_W,
} from "@/game/constants";
import {
  CORRUPTION,
  ENEMY_AI,
  ENEMY_MOVEMENT,
  ENEMY_SEPARATION,
  ENEMY_SPECIAL,
  WORKER,
  WORKER_AI,
  ZAPPER,
} from "@/game/balance";
import { chooseFleeDirectionTarget, chooseWorkerTarget } from "@/game/ai/workerTargeting";
import { computeDerived } from "@/game/selectors";
import { pickEnemyTarget } from "@/game/targeting";
import {
  applyLowHpRegionPull,
  computeAndApplyGroupDispersal,
  computeRegroupCentroid,
  resolveAntiCornerEvasion,
  updateThreatMemory,
} from "@/game/subsystems/workerAI";
import type { Agent, Enemy, GameState } from "@/game/types";
import { clamp, dist, normalize, pushLog } from "@/game/utils";

/**
 * Squad bearing bucketing helpers — squadmates sharing a target spread
 * across bearing slices so a group doesn't all approach from the same angle.
 */
function pickSquadBearingBucket(enemy: Enemy, state: GameState, target: Agent): number {
  const buckets = ENEMY_AI.squadBearingBuckets;
  const counts = new Array<number>(buckets).fill(0);
  for (const other of state.enemies) {
    if (other.id === enemy.id) continue;
    if (other.hp <= 0) continue;
    if (other.squadId !== enemy.squadId) continue;
    if (other.targetId !== target.id) continue;
    const bearing = Math.atan2(other.y - target.y, other.x - target.x);
    const idx = Math.floor(((bearing + Math.PI) / (Math.PI * 2)) * buckets) % buckets;
    counts[idx] += 1;
  }
  // Prefer bucket closest to own current bearing, weighted by scarcity.
  const ownBearing = Math.atan2(enemy.y - target.y, enemy.x - target.x);
  const ownBucket = Math.floor(((ownBearing + Math.PI) / (Math.PI * 2)) * buckets) % buckets;
  let best = ownBucket;
  let bestCost = counts[ownBucket];
  for (let i = 0; i < buckets; i++) {
    const angularDist = Math.min(Math.abs(i - ownBucket), buckets - Math.abs(i - ownBucket));
    const cost = counts[i] * 2 + angularDist * 0.5;
    if (cost < bestCost) { bestCost = cost; best = i; }
  }
  return best;
}

function pickSquadTangentSign(enemy: Enemy, squadmates: Enemy[], target: Agent): number {
  // Prefer the side with fewer squadmates already there.
  const ownBearing = Math.atan2(enemy.y - target.y, enemy.x - target.x);
  let leftCount = 0, rightCount = 0;
  for (const other of squadmates) {
    const b = Math.atan2(other.y - target.y, other.x - target.x);
    let delta = b - ownBearing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (delta > 0) leftCount += 1; else rightCount += 1;
  }
  if (leftCount === rightCount) return enemy.id % 2 === 0 ? 1 : -1;
  return leftCount > rightCount ? -1 : 1;
}

export function stepWorkers(state: GameState) {
  if (!state.nodes.length) return;
  const combatEnemies = state.enemies.filter((enemy) => enemy.role !== "corruptor" && enemy.hp > 0);

  // Decay node workTicks each tick; subsystems/mining.ts will bump nodes currently being mined.
  for (const node of state.nodes) {
    if (node.workTicks > 0) node.workTicks = Math.max(0, node.workTicks - 1);
  }

  const regroup = computeRegroupCentroid(state.agents);

  state.agents.forEach((agent, index) => {
    if (!agent.active) return;
    if (agent.disabledTicks > 0) {
      agent.disabledTicks -= 1;
      agent.task = "Disabled";
      return;
    }

    updateThreatMemory(agent, combatEnemies);

    const needsTarget =
      agent.target == null ||
      !state.nodes.some((node) => node.id === agent.target) ||
      state.timers.tick % (330 + index * 45) === 0;

    if (needsTarget) {
      agent.target = chooseWorkerTarget(state, agent);
    }

    const node =
      state.nodes.find((candidate) => candidate.id === agent.target) ??
      state.nodes[index % state.nodes.length];

    // Workers already at the node get a tighter evasion trigger so they can
    // finish a harvest before fleeing. Only applies when not already evading
    // or recovering — if they're mid-panic the normal exit radius persists.
    const recovering = agent.damageTicks > 0 && agent.hp < agent.maxHp * WORKER.recoveryHpThreshold;
    const nodeWorkRadius = clamp(node.size * 0.45, 16, 24);
    const atNode = !recovering && Math.hypot(node.x - agent.x, node.y - agent.y) <= nodeWorkRadius;
    const threatRadius = agent.evadeTicks > 0
      ? EVADE_EXIT_RADIUS
      : atNode ? WORKER_AI.harvestingEvasionRadius : EVADE_ENTER_RADIUS;
    const evadeThreats = combatEnemies
      .map((enemy) => {
        const d = dist(enemy.x, enemy.y, agent.x, agent.y);
        return d < threatRadius ? { enemy, d } : null;
      })
      .filter(Boolean) as Array<{ enemy: Enemy; d: number }>;
    const shouldHoldNodeUnderLightPressure =
      atNode &&
      agent.damageTicks <= 0 &&
      evadeThreats.length > 0 &&
      evadeThreats.length <= WORKER_AI.harvestingStubbornEnemyLimit;

    if (evadeThreats.length > 0 && !shouldHoldNodeUnderLightPressure) {
      let vx = 0;
      let vy = 0;

      evadeThreats.forEach(({ enemy, d }) => {
        const dx = agent.x - enemy.x;
        const dy = agent.y - enemy.y;
        const weight = 1 / Math.max(36, d * d);
        vx += dx * weight;
        vy += dy * weight;
      });

      // Regroup bias when the worker is genuinely panicked — pulls toward
      // centroid of non-evading workers so fugitives reconverge on home.
      if (regroup.count > 0 && agent.panic > WORKER_AI.regroupPanicThreshold) {
        const rdx = regroup.x - agent.x;
        const rdy = regroup.y - agent.y;
        const rmag = Math.max(1, Math.hypot(rdx, rdy));
        vx += (rdx / rmag) * WORKER_AI.regroupWeight;
        vy += (rdy / rmag) * WORKER_AI.regroupWeight;
      }

      const direction = resolveAntiCornerEvasion(
        normalize(vx, vy, agent.evadeDx, agent.evadeDy),
        agent,
        combatEnemies
      );

      const blendedDirection = normalize(
        agent.evadeDx * 0.70 + direction.x * 0.30,
        agent.evadeDy * 0.70 + direction.y * 0.30,
        direction.x,
        direction.y
      );

      agent.evadeDx = blendedDirection.x;
      agent.evadeDy = blendedDirection.y;
      agent.evadeTicks = Math.max(
        agent.evadeTicks,
        EVADE_PERSIST_TICKS + Math.max(0, evadeThreats.length - 1) * EVADE_BONUS_PER_THREAT
      );
    } else if (agent.evadeTicks > 0) {
      agent.evadeTicks -= 1;
    }

    if (agent.evadeTicks > 0) {
      if (
        !recovering &&
        evadeThreats.length === 0 &&
        state.timers.tick % WORKER_AI.fleeTargetScanTicks === index % WORKER_AI.fleeTargetScanTicks
      ) {
        const fleeTarget = chooseFleeDirectionTarget(state, agent);
        if (fleeTarget !== null) agent.target = fleeTarget;
      }

      const veteranBonus = 1 + agent.veteranRank * 0.05;
      const evadeSpeed =
        agent.speed *
        veteranBonus *
        (WORKER.evadeSpeedBase + Math.min(WORKER.evadeSpeedPanicCap, agent.panic / WORKER.evadePanicDivisor));
      agent.x = clamp(agent.x + agent.evadeDx * evadeSpeed, 20, WORLD_W - 20);
      agent.y = clamp(agent.y + agent.evadeDy * evadeSpeed, 50, WORLD_H - 32);
      agent.tx = clamp(agent.x + agent.evadeDx * 84, 20, WORLD_W - 20);
      agent.ty = clamp(agent.y + agent.evadeDy * 84, 50, WORLD_H - 32);
      agent.swing = 0;
      agent.task = "Evading";
      agent.panic = clamp(agent.panic + (evadeThreats.length > 0 ? WORKER.panicDelta.evadingWithThreat : WORKER.panicDelta.evadingPassive), 0, 100);
      agent.hp = clamp(agent.hp + WORKER.healRate.evading + state.upgrades.shield * WORKER.healRate.evadingShield, 0, agent.maxHp);
      agent.damageTicks = Math.max(0, agent.damageTicks - 1);
      return;
    }

    const destination = recovering ? { x: agent.homeX, y: agent.homeY, size: 18, corrupted: false } : node;

    const dx = destination.x - agent.x;
    const dy = destination.y - agent.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const workRadius = recovering ? 22 : clamp(destination.size * 0.45, 16, 24);

    if (d <= workRadius) {
      agent.tx = destination.x;
      agent.ty = destination.y;
      agent.swing = recovering ? 0 : (agent.swing + 1) % 24;
      agent.task = recovering
        ? "Recovering"
        : destination.corrupted
          ? "Purging residue"
          : WORK_TASKS[agent.kind] ?? "Working";
      agent.panic = clamp(agent.panic - (recovering ? WORKER.panicDelta.recovering : WORKER.panicDelta.working), 0, 100);
      agent.hp = clamp(
        agent.hp + (recovering ? WORKER.healRate.recovering : WORKER.healRate.working) + state.upgrades.shield * (recovering ? WORKER.healRate.recoveringShield : WORKER.healRate.workingShield),
        0,
        agent.maxHp
      );
      agent.damageTicks = Math.max(0, agent.damageTicks - 1);
      return;
    }

    const speedMultiplier = recovering ? WORKER.recoverySpeed : agent.damageTicks > 0 ? WORKER.damagedSpeed : WORKER.traversingSpeed;
    const veteranBonus = 1 + agent.veteranRank * 0.05;
    agent.x += (dx / d) * agent.speed * speedMultiplier * veteranBonus;
    agent.y += (dy / d) * agent.speed * speedMultiplier * veteranBonus;

    // Low-hp region pull: hurt but not yet in recovery mode → nudge toward
    // the worker's home territory so they drift to a safer part of the field.
    if (!recovering && agent.hp < agent.maxHp * 0.5) {
      applyLowHpRegionPull(agent);
    }
    agent.tx = destination.x;
    agent.ty = destination.y;
    agent.swing = 0;
    agent.task = recovering ? "Recovering" : "Traversing";
    agent.panic = clamp(agent.panic - (recovering ? WORKER.panicDelta.traversingRecovering : WORKER.panicDelta.traversing), 0, 100);
    agent.hp = clamp(agent.hp + WORKER.healRate.traversing + state.upgrades.shield * WORKER.healRate.traversingShield, 0, agent.maxHp);
    agent.damageTicks = Math.max(0, agent.damageTicks - 1);
  });

  // separate overlapping workers
  for (let i = 0; i < state.agents.length; i++) {
    for (let j = i + 1; j < state.agents.length; j++) {
      const a = state.agents[i];
      const b = state.agents[j];
      if (!a.active || !b.active) continue;
      const minDist = WORKER.separationMinDist;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < minDist && d > 0) {
        const push = (minDist - d) / 2;
        const nx = (dx / d) * push;
        const ny = (dy / d) * push;
        a.x -= nx;
        a.y -= ny;
        b.x += nx;
        b.y += ny;
      }
    }
  }

  computeAndApplyGroupDispersal(state.agents);
}

export function stepTourist(state: GameState) {
  const derived = computeDerived(state);
  const minutesAlive = state.stats.runtimeMs / 60_000;

  if (!state.touristWorker && derived.cityStage >= 5 && minutesAlive >= 15) {
    state.touristWorker = {
      x: -30,
      y: 300,
      angle: 0,
      active: true,
      spotted: false,
      passId: 1,
      lastClickedPassId: null,
      squishTicks: 0,
    };
  }

  if (!state.touristWorker?.active) return;

  const tourist = state.touristWorker;
  tourist.squishTicks = Math.max(0, tourist.squishTicks - 1);
  tourist.x += 0.3;
  tourist.y = 300 + Math.sin(state.timers.tick / 45) * 80;
  tourist.angle = Math.atan2((Math.cos(state.timers.tick / 45) * 80) / 45, 0.3);

  if (tourist.x > 1050) {
    tourist.x = -30;
    tourist.passId += 1;
  }
}

export function stepLostDrone(state: GameState) {
  if (!state.lostDrone) return;

  const lostDrone = state.lostDrone;
  lostDrone.wobblePhase += 0.07;
  lostDrone.x += lostDrone.vx;
  lostDrone.y =
    lostDrone.baseY +
    Math.sin(lostDrone.wobblePhase) * 18 +
    Math.sin(lostDrone.wobblePhase * 0.42 + state.timers.tick / 55) * 6;
  lostDrone.angle =
    Math.sin(lostDrone.wobblePhase * 0.9) * 0.22 +
    Math.sin(lostDrone.wobblePhase * 0.37) * 0.08;

  if (lostDrone.x > WORLD_W + 48) {
    lostDrone.x = -48;
    lostDrone.baseY = clamp(lostDrone.baseY + state.rng.range(-24, 25), 190, 390);
  }
}

export function stepEnemies(state: GameState) {
  state.enemies.forEach((enemy) => {
    // Skip enemies that are in the death fade-out — they no longer act.
    if (enemy.hp <= 0) return;

    enemy.flash = Math.max(0, enemy.flash - 1);
    const speedScale = state.eventModifiers.enemySpeedScale;

    if (enemy.role === "corruptor") {
      const targetableNodes = state.nodes.filter((node) => node.kind !== "gold");
      const currentNode = targetableNodes.find((node) => node.id === enemy.targetNodeId);
      const shouldRetarget =
        !currentNode ||
        (currentNode.corruption >= 100 &&
          targetableNodes.some((node) => node.id !== currentNode.id && node.corruption < 95));

      const preferredNode =
        (!shouldRetarget && currentNode) ||
        [...targetableNodes].sort((a, b) => {
          const corruptionDelta = a.corruption - b.corruption;
          if (corruptionDelta !== 0) return corruptionDelta;
          return dist(a.x, a.y, enemy.x, enemy.y) - dist(b.x, b.y, enemy.x, enemy.y);
        })[0];

      if (!preferredNode) return;

      enemy.targetNodeId = preferredNode.id;
      const dx = preferredNode.x - enemy.x;
      const dy = preferredNode.y - enemy.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const contactRadius = preferredNode.size + 8;

      if (d <= contactRadius) {
        enemy.corruptTicks += 1;
        const ratePerTick =
          enemy.kind === "blight" ? ENEMY_SPECIAL.blight.corruptionRatePerTick : CORRUPTION.ratePerTick;
        preferredNode.corruption = clamp(
          preferredNode.corruption +
            (ratePerTick + state.level * CORRUPTION.ratePerLevel) * state.eventModifiers.corruptionRate,
          0,
          100
        );
        preferredNode.corruptedBy = enemy.id;
        enemy.x += Math.cos((state.timers.tick + enemy.id * 11) / 12) * 0.12;
        enemy.y += Math.sin((state.timers.tick + enemy.id * 7) / 12) * 0.12;

        if (preferredNode.corruption >= 100 && !preferredNode.corrupted) {
          preferredNode.corrupted = true;
          state.stats.corruptions += 1;
          state.log = pushLog(state.log, `${preferredNode.kind} node fully corrupted. Gross.`, "corruption", state.timers.tick);
        }
        return;
      }

      enemy.x += (dx / d) * enemy.speed * ENEMY_MOVEMENT.corruptorApproachScale * speedScale;
      enemy.y += (dy / d) * enemy.speed * ENEMY_MOVEMENT.corruptorApproachScale * speedScale;
      return;
    }

    // Leeches bypass worker targeting — they head straight for the home district
    // to drain resources on arrival. They still push workers around if they
    // happen to be adjacent, but their movement goal is the home zone.
    if (enemy.kind === "leech") {
      const HOME_DISTRICT_X = 500;
      const HOME_DISTRICT_Y = 490;
      const dx = HOME_DISTRICT_X - enemy.x;
      const dy = HOME_DISTRICT_Y - enemy.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      if (d > ENEMY_MOVEMENT.approachMinDistance) {
        enemy.x += (dx / d) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
        enemy.y += (dy / d) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
        // Gentle weaving so multiple leeches don't stack on the same path.
        const drift = Math.sin((state.timers.tick + enemy.id * 13) / 18) * ENEMY_MOVEMENT.strafeAmplitude * speedScale;
        enemy.x += (-dy / d) * drift;
        enemy.y += (dx / d) * drift;
      }
      enemy.targetId = null;
      return;
    }

    const currentTankTarget =
      enemy.kind === "brute" && enemy.targetId !== null
        ? state.agents.find((agent) => agent.id === enemy.targetId && agent.active && agent.hp > 0) ?? null
        : null;
    const shouldRefreshTankTarget =
      enemy.kind !== "brute" || (state.timers.tick + enemy.id * 7) % ENEMY_AI.tankTargetRefreshTicks === 0;
    const target = currentTankTarget && !shouldRefreshTankTarget
      ? currentTankTarget
      : pickEnemyTarget(enemy, state);

    if (!target) return;

    enemy.targetId = target.id;

    // Squad bearing spread — squadmates pursuing the same worker pick the
    // bearing bucket (of N) with fewest same-squad competitors. Produces
    // emergent flanking without explicit coordinator state.
    let desiredX = target.x;
    let desiredY = target.y;
    const archetype = enemy.archetype;

    // Flanker lead: aim at predicted worker position assuming it continues
    // heading toward its current tx/ty at its current speed.
    if (archetype === "flanker") {
      const wdx = target.tx - target.x;
      const wdy = target.ty - target.y;
      const wmag = Math.hypot(wdx, wdy);
      if (wmag > 0.5) {
        const lead = ENEMY_AI.flankerLeadTicks * target.speed;
        desiredX = target.x + (wdx / wmag) * lead;
        desiredY = target.y + (wdy / wmag) * lead;
      }
    } else if (archetype === "ghost") {
      // Ghost: while cloaked, reposition behind worker's movement vector.
      const cloakPhase = (enemy.cloakTicks ?? 0) / ENEMY_SPECIAL.phantom.cycleTicks;
      if (cloakPhase > ENEMY_AI.ghostRepositionPhaseStart && cloakPhase < ENEMY_AI.ghostRepositionPhaseEnd) {
        const wdx = target.tx - target.x;
        const wdy = target.ty - target.y;
        const wmag = Math.hypot(wdx, wdy);
        if (wmag > 0.5) {
          desiredX = target.x - (wdx / wmag) * ENEMY_AI.ghostRepositionOffset;
          desiredY = target.y - (wdy / wmag) * ENEMY_AI.ghostRepositionOffset;
        }
      }
    }

    const dx = desiredX - enemy.x;
    const dy = desiredY - enemy.y;
    const d = Math.max(1, Math.hypot(dx, dy));

    if (enemy.kind === "zapper") {
      // Zappers hold at firing range rather than closing to contact.
      const dxRaw = target.x - enemy.x;
      const dyRaw = target.y - enemy.y;
      const dRaw = Math.max(1, Math.hypot(dxRaw, dyRaw));
      if (dRaw > ZAPPER.holdDistance) {
        enemy.x += (dxRaw / dRaw) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
        enemy.y += (dyRaw / dRaw) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
      } else if (dRaw < ZAPPER.holdDistance * 0.75) {
        enemy.x -= (dxRaw / dRaw) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
        enemy.y -= (dyRaw / dRaw) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
      }
      const drift = Math.sin((state.timers.tick + enemy.id * 17) / 20) * ENEMY_MOVEMENT.strafeAmplitude * speedScale;
      enemy.x += (-dyRaw / dRaw) * drift;
      enemy.y += (dxRaw / dRaw) * drift;
      return;
    }

    // Ambusher: approach slowly until the dash trigger, then burst for a
    // short dashTicks window. Uses raw distance to target, not leadpoint.
    let speedMultiplier = ENEMY_MOVEMENT.combatSpeedScale;
    if (archetype === "ambusher") {
      const dxRaw = target.x - enemy.x;
      const dyRaw = target.y - enemy.y;
      const dRaw = Math.hypot(dxRaw, dyRaw);
      if ((enemy.dashTicks ?? 0) > 0) {
        speedMultiplier *= ENEMY_AI.ambusherDashSpeedScale;
        enemy.dashTicks = (enemy.dashTicks ?? 0) - 1;
      } else if (dRaw < ENEMY_AI.ambusherDashTrigger) {
        enemy.dashTicks = ENEMY_AI.ambusherDashDuration;
        speedMultiplier *= ENEMY_AI.ambusherDashSpeedScale;
      } else {
        speedMultiplier *= ENEMY_AI.ambusherApproachScale;
      }
    }

    // Brutes anchor — they ignore crowding and march straight in. Everyone
    // else uses the crowd check for orbit-style approach stacking.
    const ignoresCrowd = enemy.kind === "brute";
    const crowdCount = ignoresCrowd
      ? 0
      : state.enemies.filter(
          (other) =>
            other.id !== enemy.id &&
            other.hp > 0 &&
            other.role === "combat" &&
            other.kind !== "corruptor" &&
            other.targetId === target.id &&
            dist(other.x, other.y, target.x, target.y) < ENEMY_MOVEMENT.personalSpaceRadius
        ).length;
    const crowded = crowdCount >= ENEMY_MOVEMENT.crowdingThreshold;
    const effectiveApproachMin = ENEMY_MOVEMENT.approachMinDistance + (crowded ? 10 : 0);

    if (d > effectiveApproachMin) {
      if (enemy.kind === "wisp") {
        enemy.trail.push([enemy.x, enemy.y]);
        if (enemy.trail.length > 5) enemy.trail.shift();
      }
      let moveX = dx / d;
      let moveY = dy / d;

      // Flanker tangent blend: mix in a tangential component so the arc
      // lands from the side, not head-on.
      if (archetype === "flanker") {
        const squadmates = state.enemies.filter(
          (other) =>
            other.id !== enemy.id &&
            other.hp > 0 &&
            other.squadId === enemy.squadId &&
            other.targetId === target.id
        );
        const tangentSign = pickSquadTangentSign(enemy, squadmates, target);
        const tx = (-dy / d) * tangentSign;
        const ty = (dx / d) * tangentSign;
        const blend = ENEMY_AI.flankerTangentBlend;
        const mx = moveX * (1 - blend) + tx * blend;
        const my = moveY * (1 - blend) + ty * blend;
        const ml = Math.max(0.001, Math.hypot(mx, my));
        moveX = mx / ml;
        moveY = my / ml;
      } else if (crowded) {
        // Intentional: small squads (below crowdingThreshold) approach directly
        // for a clean, readable attack. Bearing spread only activates for larger
        // packs so the visual distinction between lone and group attacks is clear.
        //
        // Convert bucket index to a world-space bearing (6 slices, 60° apart)
        // and use it as the desired approach direction, blended with pursuit.
        const bucket = pickSquadBearingBucket(enemy, state, target);
        const buckets = ENEMY_AI.squadBearingBuckets;
        const bucketAngle = (bucket / buckets) * Math.PI * 2 - Math.PI;
        const tx = Math.cos(bucketAngle);
        const ty = Math.sin(bucketAngle);
        const blend = ENEMY_MOVEMENT.orbitBlend;
        const mx = moveX * (1 - blend) + tx * blend;
        const my = moveY * (1 - blend) + ty * blend;
        const ml = Math.max(0.001, Math.hypot(mx, my));
        moveX = mx / ml;
        moveY = my / ml;
      }

      enemy.x += moveX * enemy.speed * speedMultiplier * speedScale;
      enemy.y += moveY * enemy.speed * speedMultiplier * speedScale;
      const strafe = Math.sin((state.timers.tick + enemy.id * 13) / 14) * ENEMY_MOVEMENT.strafeAmplitude * speedScale;
      enemy.x += (-dy / d) * strafe;
      enemy.y += (dx / d) * strafe;
    }

    if (enemy.kind === "phantom" && enemy.cloakTicks !== undefined) {
      enemy.cloakTicks = (enemy.cloakTicks + 1) % ENEMY_SPECIAL.phantom.cycleTicks;
    }
  });

  // separate overlapping enemies — two passes for stronger resolution
  for (let pass = 0; pass < ENEMY_SEPARATION.resolutionPasses; pass++) {
    for (let i = 0; i < state.enemies.length; i++) {
      for (let j = i + 1; j < state.enemies.length; j++) {
        const a = state.enemies[i];
        const b = state.enemies[j];
        if (a.hp <= 0 || b.hp <= 0) continue;
        const minDist = ENEMY_SEPARATION.minDist;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < minDist && d > 0) {
          const push = (minDist - d) / 2;
          const nx = (dx / d) * push;
          const ny = (dy / d) * push;
          a.x -= nx;
          a.y -= ny;
          b.x += nx;
          b.y += ny;
        }
      }
    }
  }
}
