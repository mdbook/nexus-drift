import {
  EVADE_BONUS_PER_THREAT,
  EVADE_ENTER_RADIUS,
  EVADE_EXIT_RADIUS,
  EVADE_PERSIST_TICKS,
  WORK_TASKS,
  WORLD_H,
  WORLD_W,
} from "@/game/constants";
import { CORRUPTION, ENEMY_MOVEMENT, ENEMY_SEPARATION, ENEMY_SPECIAL, WORKER, ZAPPER } from "@/game/balance";
import { chooseWorkerTarget } from "@/game/factories";
import { computeDerived } from "@/game/selectors";
import { findClosestAgent } from "@/game/targeting";
import type { GameState } from "@/game/types";
import { clamp, dist, normalize, pushLog } from "@/game/utils";

export function stepWorkers(state: GameState) {
  if (!state.nodes.length) return;
  const combatEnemies = state.enemies.filter((enemy) => enemy.role !== "corruptor");

  state.agents.forEach((agent, index) => {
    if (!agent.active) return;
    if (agent.disabledTicks > 0) {
      agent.disabledTicks -= 1;
      agent.task = "Disabled";
      return;
    }

    const needsTarget =
      agent.target == null ||
      !state.nodes.some((node) => node.id === agent.target) ||
      state.timers.tick % (210 + index * 30) === 0;

    if (needsTarget) {
      agent.target = chooseWorkerTarget(state, agent);
    }

    const node =
      state.nodes.find((candidate) => candidate.id === agent.target) ??
      state.nodes[index % state.nodes.length];

    const threatRadius = agent.evadeTicks > 0 ? EVADE_EXIT_RADIUS : EVADE_ENTER_RADIUS;
    const evadeThreats = combatEnemies
      .map((enemy) => {
        const d = dist(enemy.x, enemy.y, agent.x, agent.y);
        return d < threatRadius ? { enemy, d } : null;
      })
      .filter(Boolean) as Array<{ enemy: GameState["enemies"][number]; d: number }>;

    if (evadeThreats.length > 0) {
      let vx = 0;
      let vy = 0;

      evadeThreats.forEach(({ enemy, d }) => {
        const dx = agent.x - enemy.x;
        const dy = agent.y - enemy.y;
        const weight = 1 / Math.max(36, d * d);
        vx += dx * weight;
        vy += dy * weight;
      });

      const nextDirection = normalize(vx, vy, agent.evadeDx, agent.evadeDy);
      const blendedDirection = normalize(
        agent.evadeDx * 0.45 + nextDirection.x * 0.55,
        agent.evadeDy * 0.45 + nextDirection.y * 0.55,
        nextDirection.x,
        nextDirection.y
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

    const recovering = agent.damageTicks > 0 && agent.hp < agent.maxHp * WORKER.recoveryHpThreshold;
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
}

export function stepTourist(state: GameState) {
  const derived = computeDerived(state);
  const minutesAlive = state.stats.runtimeMs / 60_000;

  if (!state.touristWorker && derived.cityStage >= 5 && minutesAlive >= 15) {
    state.touristWorker = { x: -30, y: 300, angle: 0, active: true, spotted: false };
  }

  if (!state.touristWorker?.active) return;

  const tourist = state.touristWorker;
  tourist.x += 0.3;
  tourist.y = 300 + Math.sin(state.timers.tick / 45) * 80;
  tourist.angle = Math.atan2((Math.cos(state.timers.tick / 45) * 80) / 45, 0.3);

  if (tourist.x > 1050) {
    tourist.x = -30;
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

    const target = findClosestAgent(enemy, state.agents.filter((a) => a.active));

    if (!target) return;

    enemy.targetId = target.id;
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const d = Math.max(1, Math.hypot(dx, dy));

    if (enemy.kind === "zapper") {
      // Zappers hold at firing range rather than closing to contact.
      if (d > ZAPPER.holdDistance) {
        enemy.x += (dx / d) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
        enemy.y += (dy / d) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
      } else if (d < ZAPPER.holdDistance * 0.75) {
        // Back off if too close.
        enemy.x -= (dx / d) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
        enemy.y -= (dy / d) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
      }
      // Gentle lateral drift so they don't pile up.
      const drift = Math.sin((state.timers.tick + enemy.id * 17) / 20) * ENEMY_MOVEMENT.strafeAmplitude * speedScale;
      enemy.x += (-dy / d) * drift;
      enemy.y += (dx / d) * drift;
      return;
    }

    const crowdCount = state.enemies.filter(
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
      if (crowded) {
        // Blend pursuit with a tangential (orbit) component so enemies arrive at staggered angles.
        const tangentSign = enemy.id % 2 === 0 ? 1 : -1;
        const tx = (-dy / d) * tangentSign;
        const ty = (dx / d) * tangentSign;
        const blend = ENEMY_MOVEMENT.orbitBlend;
        const mx = moveX * (1 - blend) + tx * blend;
        const my = moveY * (1 - blend) + ty * blend;
        const ml = Math.max(0.001, Math.hypot(mx, my));
        moveX = mx / ml;
        moveY = my / ml;
      }
      enemy.x += moveX * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
      enemy.y += moveY * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale * speedScale;
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
