import {
  EVADE_BONUS_PER_THREAT,
  EVADE_ENTER_RADIUS,
  EVADE_EXIT_RADIUS,
  EVADE_PERSIST_TICKS,
  WORK_TASKS,
  WORLD_H,
  WORLD_W,
} from "@/game/constants";
import { CORRUPTION, ENEMY_MOVEMENT, ENEMY_SEPARATION, WORKER } from "@/game/balance";
import { chooseWorkerTarget } from "@/game/factories";
import { findClosestAgent } from "@/game/targeting";
import type { GameState } from "@/game/types";
import { clamp, dist, normalize, pushLog } from "@/game/utils";

export function stepWorkers(state: GameState) {
  if (!state.nodes.length) return;
  const combatEnemies = state.enemies.filter((enemy) => enemy.role !== "corruptor");

  state.agents.forEach((agent, index) => {
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
      const evadeSpeed = agent.speed * (WORKER.evadeSpeedBase + Math.min(WORKER.evadeSpeedPanicCap, agent.panic / WORKER.evadePanicDivisor));
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
    agent.x += (dx / d) * agent.speed * speedMultiplier;
    agent.y += (dy / d) * agent.speed * speedMultiplier;
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

export function stepEnemies(state: GameState) {
  state.enemies.forEach((enemy) => {
    enemy.flash = Math.max(0, enemy.flash - 1);

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
        preferredNode.corruption = clamp(preferredNode.corruption + CORRUPTION.ratePerTick + state.level * CORRUPTION.ratePerLevel, 0, 100);
        preferredNode.corruptedBy = enemy.id;
        enemy.x += Math.cos((state.timers.tick + enemy.id * 11) / 12) * 0.12;
        enemy.y += Math.sin((state.timers.tick + enemy.id * 7) / 12) * 0.12;

        if (preferredNode.corruption >= 100 && !preferredNode.corrupted) {
          preferredNode.corrupted = true;
          state.stats.corruptions += 1;
          state.log = pushLog(state.log, `${preferredNode.kind} node fully corrupted. Gross.`);
        }
        return;
      }

      enemy.x += (dx / d) * enemy.speed * ENEMY_MOVEMENT.corruptorApproachScale;
      enemy.y += (dy / d) * enemy.speed * ENEMY_MOVEMENT.corruptorApproachScale;
      return;
    }

    const target = findClosestAgent(enemy, state.agents);

    if (!target) return;

    enemy.targetId = target.id;
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const d = Math.max(1, Math.hypot(dx, dy));

    if (d > ENEMY_MOVEMENT.approachMinDistance) {
      if (enemy.kind === "wisp") {
        enemy.trail.push([enemy.x, enemy.y]);
        if (enemy.trail.length > 5) enemy.trail.shift();
      }
      enemy.x += (dx / d) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale;
      enemy.y += (dy / d) * enemy.speed * ENEMY_MOVEMENT.combatSpeedScale;
      const strafe = Math.sin((state.timers.tick + enemy.id * 13) / 14) * ENEMY_MOVEMENT.strafeAmplitude;
      enemy.x += (-dy / d) * strafe;
      enemy.y += (dx / d) * strafe;
    }
  });

  // separate overlapping enemies — two passes for stronger resolution
  for (let pass = 0; pass < ENEMY_SEPARATION.resolutionPasses; pass++) {
    for (let i = 0; i < state.enemies.length; i++) {
      for (let j = i + 1; j < state.enemies.length; j++) {
        const a = state.enemies[i];
        const b = state.enemies[j];
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
