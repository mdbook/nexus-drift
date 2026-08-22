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
  WORKER_ABILITIES,
  WORKER_BLOCKING,
  WORKER_AI,
  ZAPPER,
} from "@/game/balance";
import { chooseFleeDirectionTarget, chooseWorkerTarget } from "@/game/ai/workerTargeting";
import { computeDerived } from "@/game/selectors";
import type { SimTraceCtx } from "@/game/trace";
import { pickEnemyTargetMulti } from "@/game/targeting";
import {
  applyLowHpRegionPull,
  computeAndApplyGroupDispersal,
  computeRegroupCentroid,
  resolveAntiCornerEvasion,
  updateThreatMemory,
} from "@/game/subsystems/workerAI";
import type { Agent, Enemy, GameState } from "@/game/types";
import { clamp, dist, normalize, appendLog } from "@/game/utils";

// TODO(3.2.0): `movement.ts` is ~800 lines and houses three distinct concerns:
//   - worker movement + evasion (`stepWorkers`)
//   - enemy movement + squad bucketing (`stepEnemies`)
//   - ghost / phantom reposition helpers
// Split into `subsystems/workerMovement.ts`, `subsystems/enemyMovement.ts`,
// and a `ghostReposition.ts` helper so each file fits under the ~300 LOC
// project guideline. Deferred from 3.1.0 because the split needs careful
// attention to the shared liveEnemies/combatEnemies slicing and regroup
// centroid wiring — not worth mid-release destabilization.
//
// TODO(3.2.0): enemy and worker targeting do O(N·M) scans of the live-enemy
// list every tick (pickEnemyTargetMulti, measureWorkerEnemyBlocking, squad
// bucketing, separation, ghost reposition). At high admin speeds with 100+
// enemies this is measurable. Add a coarse grid spatial index (bucket size
// ~64 px) built once per tick at the top of advanceGame and reuse it across
// movement + combat + targeting. Do not try to hand-roll this in 3.1.0 — the
// index needs to track enemy HP changes mid-tick and invalidate cleanly.

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
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  return best;
}

function pickSquadTangentSign(enemy: Enemy, squadmates: Enemy[], target: Agent): number {
  // Prefer the side with fewer squadmates already there.
  const ownBearing = Math.atan2(enemy.y - target.y, enemy.x - target.x);
  let leftCount = 0,
    rightCount = 0;
  for (const other of squadmates) {
    const b = Math.atan2(other.y - target.y, other.x - target.x);
    let delta = b - ownBearing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (delta > 0) leftCount += 1;
    else rightCount += 1;
  }
  if (leftCount === rightCount) return enemy.id % 2 === 0 ? 1 : -1;
  return leftCount > rightCount ? -1 : 1;
}

type WorkerEnemyBlockingSample = {
  speedScale: number;
  blockers: number;
  touching: number;
};

function computeWorkerEnemyBlocking(agent: Agent, enemies: Enemy[]): WorkerEnemyBlockingSample {
  const workerRadius = WORKER_BLOCKING.workerRadius[agent.kind];
  let blockers = 0;
  let touching = 0;

  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;

    const enemyRadius = WORKER_BLOCKING.enemyRadius[enemy.kind];
    const dx = agent.x - enemy.x;
    const dy = agent.y - enemy.y;
    const d = Math.hypot(dx, dy);
    const contactRadius = workerRadius + enemyRadius;
    const influenceRadius = contactRadius + WORKER_BLOCKING.softBuffer;

    if (d >= influenceRadius) continue;

    blockers += 1;

    if (d < contactRadius) {
      touching += 1;
    }
  }

  const speedScale = Math.max(
    0.16,
    1 -
      Math.min(blockers * WORKER_BLOCKING.speedPenaltyPerEnemy, WORKER_BLOCKING.speedPenaltyCap) -
      Math.min(touching * WORKER_BLOCKING.touchingPenaltyPerEnemy, WORKER_BLOCKING.touchingPenaltyCap)
  );

  return { speedScale, blockers, touching };
}

export function measureWorkerEnemyBlocking(agent: Agent, enemies: Enemy[]): WorkerEnemyBlockingSample {
  return computeWorkerEnemyBlocking(agent, enemies);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function shouldScanFleeTarget(tick: number, agentId: number): boolean {
  const interval = WORKER_AI.fleeTargetScanTicks;
  // Fresh worker IDs start at 1, so id 1 keeps the original tick-0 scan.
  // Normalize the phase so legacy/manual id 0 workers never rely on JS's
  // negative remainder behavior.
  const phase = positiveModulo(-(agentId - 1) * 7, interval);
  return positiveModulo(tick, interval) === phase;
}

// ponytail: `ctx` is the opt-in decision-trace sink, forwarded to the worker-target
// picks below. Undefined on the production path → no instrumentation, no behavior change.
export function stepWorkers(state: GameState, ctx?: SimTraceCtx) {
  if (!state.nodes.length) return;
  const liveEnemies = state.enemies.filter((enemy) => enemy.hp > 0);
  const combatEnemies = liveEnemies.filter((enemy) => enemy.role !== "corruptor");

  // Decay node workTicks each tick; subsystems/mining.ts will bump nodes currently being mined.
  for (const node of state.nodes) {
    if (node.workTicks > 0) node.workTicks = Math.max(0, node.workTicks - 1);
  }

  const regroup = computeRegroupCentroid(state.agents);

  state.agents.forEach((agent) => {
    if (!agent.active) return;
    if (agent.disabledTicks > 0) {
      agent.disabledTicks -= 1;
      agent.task = "Disabled";
      return;
    }

    // 3.0.0 Step 7: corrupted workers freeze autonomous pathfinding.
    // Their position and state are managed by stepWorkerCorruption.
    if (agent.corrupted) {
      agent.task = "Corrupted";
      // Keep timers ticking down so state doesn't stale-freeze.
      if (agent.sprintCooldown > 0) agent.sprintCooldown -= 1;
      if (agent.sprintTicks > 0) agent.sprintTicks -= 1;
      if (agent.kind === "miner") agent.overclockTicks = 0;
      return;
    }

    // 3.0.0 / 3.1.2 — reboot: parks at home, regen HP, skips all logic.
    // Used for both corruption-cleanse reboot and combat-death reboot.
    if (agent.rebootTicks > 0) {
      agent.rebootTicks -= 1;
      agent.x = agent.homeX;
      agent.y = agent.homeY;
      agent.tx = agent.homeX;
      agent.ty = agent.homeY;
      agent.target = null;
      agent.task = "Rebooting";
      agent.hp = Math.min(agent.maxHp, agent.hp + agent.maxHp / WORKER.respawn.rebootDuration);
      if (agent.rebootTicks === 0) {
        agent.hp = agent.maxHp;
        agent.spawnTick = state.timers.tick;
        appendLog(state, `${agent.kind} worker redeployed.`, "combat");
      }
      return;
    }

    // Decrement per-agent sprint timers every tick (runner ability).
    if (agent.sprintCooldown > 0) agent.sprintCooldown -= 1;
    if (agent.sprintTicks > 0) agent.sprintTicks -= 1;

    updateThreatMemory(agent, combatEnemies);

    // 3.1.0: cadence offset is hashed from the stable `agent.id` instead of
    // the array index. When workers die, reboot, or are reordered the array
    // index shifts for survivors, which used to silently change their
    // retarget cadence mid-life. Using `agent.id` keeps each worker's
    // retarget window fixed for its lifetime.
    const needsTarget =
      agent.target == null ||
      !state.nodes.some((node) => node.id === agent.target) ||
      state.timers.tick % (330 + agent.id * 45) === 0;

    if (needsTarget) {
      agent.target = chooseWorkerTarget(state, agent, ctx);
    }

    const node =
      state.nodes.find((candidate) => candidate.id === agent.target) ??
      state.nodes[agent.id % state.nodes.length];
    // Sample blocking before movement for the current tick. If future nodes can
    // move, update node positions first and keep deriving worker velocity from
    // previous/current x/y; tx/ty below are only destination anchors.
    const blocking = measureWorkerEnemyBlocking(agent, liveEnemies);

    // Workers already at the node get a tighter evasion trigger so they can
    // finish a harvest before fleeing. Only applies when not already evading
    // or recovering — if they're mid-panic the normal exit radius persists.
    const recovering = agent.damageTicks > 0 && agent.hp < agent.maxHp * WORKER.recoveryHpThreshold;
    const nodeWorkRadius = clamp(node.size * 0.45, 16, 24);
    const atNode = !recovering && Math.hypot(node.x - agent.x, node.y - agent.y) <= nodeWorkRadius;
    const threatRadius =
      agent.evadeTicks > 0
        ? EVADE_EXIT_RADIUS
        : atNode
          ? WORKER_AI.harvestingEvasionRadius
          : EVADE_ENTER_RADIUS;
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
        agent.evadeDx * 0.7 + direction.x * 0.3,
        agent.evadeDy * 0.7 + direction.y * 0.3,
        direction.x,
        direction.y
      );

      agent.evadeDx = blendedDirection.x;
      agent.evadeDy = blendedDirection.y;
      // 3.0.0 Step 8: super-linear panic cascade. Single-enemy encounters barely
      // extend evasion; real surrounds (3-4+) compound hard so fleeing workers
      // don't casually walk back through a pile of bodies.
      const cascadeBonus = Math.round(
        Math.max(0, Math.pow(evadeThreats.length, 1.5) - 1) * EVADE_BONUS_PER_THREAT
      );
      agent.evadeTicks = Math.max(agent.evadeTicks, EVADE_PERSIST_TICKS + cascadeBonus);

      // Runner sprint: triggered when threatened with high enough panic and
      // the cooldown has elapsed. Gives a short speed burst during evasion.
      if (
        agent.kind === "runner" &&
        agent.sprintCooldown === 0 &&
        agent.panic > WORKER_ABILITIES.sprintPanicThreshold
      ) {
        agent.sprintTicks = WORKER_ABILITIES.sprintDurationTicks;
        agent.sprintCooldown = WORKER_ABILITIES.sprintCooldownTicks;
      }
    } else if (agent.evadeTicks > 0) {
      agent.evadeTicks -= 1;
      // 3.2.1 — at the moment evasion ends, mint a "spook" memory window and
      // force an immediate retarget. Sticky retargeting (stickyThreshold)
      // otherwise locked the worker right back onto whatever drew it into
      // the threat lane — see WORKER_AI.spookedDuration.
      if (agent.evadeTicks === 0) {
        agent.spookedTicks = WORKER_AI.spookedDuration;
        agent.target = chooseWorkerTarget(state, agent, ctx);
      }
    }

    // 3.2.1 — decay the spook window separately so it persists past the
    // evade-end tick (and across re-evasion cycles, capped at duration).
    if (agent.spookedTicks > 0 && agent.evadeTicks === 0) {
      agent.spookedTicks -= 1;
    }

    if (agent.evadeTicks > 0) {
      if (!recovering && evadeThreats.length === 0 && shouldScanFleeTarget(state.timers.tick, agent.id)) {
        const fleeTarget = chooseFleeDirectionTarget(state, agent, ctx);
        if (fleeTarget !== null) agent.target = fleeTarget;
      }

      const veteranBonus = 1 + agent.veteranRank * 0.05;
      const sprintMult =
        agent.kind === "runner" && agent.sprintTicks > 0 ? WORKER_ABILITIES.sprintSpeedMult : 1;
      const evadeSpeed =
        agent.speed *
        agent.speedMod *
        sprintMult *
        veteranBonus *
        (WORKER.evadeSpeedBase +
          Math.min(WORKER.evadeSpeedPanicCap, agent.panic / WORKER.evadePanicDivisor)) *
        blocking.speedScale;
      agent.x = clamp(agent.x + agent.evadeDx * evadeSpeed, 20, WORLD_W - 20);
      agent.y = clamp(agent.y + agent.evadeDy * evadeSpeed, 50, WORLD_H - 32);
      agent.tx = clamp(agent.x + agent.evadeDx * 84, 20, WORLD_W - 20);
      agent.ty = clamp(agent.y + agent.evadeDy * 84, 50, WORLD_H - 32);
      agent.swing = 0;
      agent.task = "Evading";
      agent.panic = clamp(
        agent.panic +
          (evadeThreats.length > 0 ? WORKER.panicDelta.evadingWithThreat : WORKER.panicDelta.evadingPassive),
        0,
        100
      );
      agent.hp = clamp(
        agent.hp + WORKER.healRate.evading + state.upgrades.shield * WORKER.healRate.evadingShield,
        0,
        agent.maxHp
      );
      agent.damageTicks = Math.max(0, agent.damageTicks - 1);
      // Miner overclock resets while evading (not at node).
      if (agent.kind === "miner") agent.overclockTicks = 0;
      return;
    }

    const destination = recovering ? { x: agent.homeX, y: agent.homeY, size: 18, corrupted: false } : node;

    const dx = destination.x - agent.x;
    const dy = destination.y - agent.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const workRadius = recovering ? 22 : clamp(destination.size * 0.45, 16, 24);

    if (d <= workRadius) {
      // tx/ty are render/intention anchors, not a movement delta source. If
      // nodes become mobile, recompute destination after node motion and use
      // actual x/y deltas for velocity-sensitive logic.
      agent.tx = destination.x;
      agent.ty = destination.y;
      agent.swing = recovering ? 0 : (agent.swing + 1) % 24;
      agent.task = recovering
        ? "Recovering"
        : destination.corrupted
          ? "Purging residue"
          : (WORK_TASKS[agent.kind] ?? "Working");
      agent.panic = clamp(
        agent.panic - (recovering ? WORKER.panicDelta.recovering : WORKER.panicDelta.working),
        0,
        100
      );
      agent.hp = clamp(
        agent.hp +
          (recovering ? WORKER.healRate.recovering : WORKER.healRate.working) +
          state.upgrades.shield *
            (recovering ? WORKER.healRate.recoveringShield : WORKER.healRate.workingShield),
        0,
        agent.maxHp
      );
      agent.damageTicks = Math.max(0, agent.damageTicks - 1);
      // Miner overclock: accumulate while undamaged at a node; reset on damage.
      if (agent.kind === "miner") {
        if (!recovering && agent.damageTicks === 0) {
          agent.overclockTicks = Math.min(WORKER_ABILITIES.overclockThresholdTicks, agent.overclockTicks + 1);
        } else {
          agent.overclockTicks = 0;
        }
      }
      return;
    }

    const speedMultiplier = recovering
      ? WORKER.recoverySpeed
      : agent.damageTicks > 0
        ? WORKER.damagedSpeed
        : WORKER.traversingSpeed;
    const veteranBonus = 1 + agent.veteranRank * 0.05;
    const blockingSpeed = blocking.speedScale;
    const traversalSprintMult =
      agent.kind === "runner" && agent.sprintTicks > 0 ? WORKER_ABILITIES.sprintSpeedMult : 1;
    agent.x +=
      (dx / d) *
      agent.speed *
      agent.speedMod *
      traversalSprintMult *
      speedMultiplier *
      veteranBonus *
      blockingSpeed;
    agent.y +=
      (dy / d) *
      agent.speed *
      agent.speedMod *
      traversalSprintMult *
      speedMultiplier *
      veteranBonus *
      blockingSpeed;
    // Miner overclock resets while traversing (not at node).
    if (agent.kind === "miner") agent.overclockTicks = 0;

    // Low-hp region pull: hurt but not yet in recovery mode → nudge toward
    // the worker's home territory so they drift to a safer part of the field.
    if (!recovering && agent.hp < agent.maxHp * 0.5) {
      applyLowHpRegionPull(agent);
    }
    // Keep tx/ty pinned to the intended destination for rendering. Do not use
    // these fields as proof of worker velocity if a future node type moves.
    agent.tx = destination.x;
    agent.ty = destination.y;
    agent.swing = 0;
    agent.task = recovering ? "Recovering" : "Traversing";
    agent.panic = clamp(
      agent.panic - (recovering ? WORKER.panicDelta.traversingRecovering : WORKER.panicDelta.traversing),
      0,
      100
    );
    agent.hp = clamp(
      agent.hp + WORKER.healRate.traversing + state.upgrades.shield * WORKER.healRate.traversingShield,
      0,
      agent.maxHp
    );
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
    Math.sin(lostDrone.wobblePhase * 0.9) * 0.22 + Math.sin(lostDrone.wobblePhase * 0.37) * 0.08;

  if (lostDrone.x > WORLD_W + 48) {
    lostDrone.x = -48;
    lostDrone.baseY = clamp(lostDrone.baseY + state.rng.range(-24, 25), 190, 390);
  }
}

export function stepEnemies(state: GameState) {
  const derived = computeDerived(state);
  state.enemies.forEach((enemy) => {
    // Skip enemies that are in the death fade-out — they no longer act.
    if (enemy.hp <= 0) return;

    enemy.flash = Math.max(0, enemy.flash - 1);
    const speedScale = state.eventModifiers.enemySpeedScale;

    // 3.1.5 — a latched warden is a parasite pinned to its host worker.
    // Its position is overwritten by stepWardenAttach each tick; skipping
    // movement here avoids the ghost-archetype reposition fighting the pin
    // and makes the stationary "feeding" window feel deliberate.
    if (enemy.kind === "warden" && enemy.latchedWorkerId != null) {
      enemy.targetId = null;
      enemy.targetKind = "agent";
      return;
    }

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
          appendLog(state, `${preferredNode.kind} node fully corrupted. Gross.`, "corruption");
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
        const drift =
          Math.sin((state.timers.tick + enemy.id * 13) / 18) * ENEMY_MOVEMENT.strafeAmplitude * speedScale;
        enemy.x += (-dy / d) * drift;
        enemy.y += (dx / d) * drift;
      }
      enemy.targetId = null;
      return;
    }

    // 3.0.0 Step 4 — multi-class target picker. For brutes we cache the agent
    // target across a refresh window the same way as before, so brute focus
    // doesn't jitter between workers every tick. All other enemies re-pick
    // every tick (cheap and keeps responsiveness on non-worker pivots).
    const currentTankTarget =
      enemy.kind === "brute" && enemy.targetKind === "agent" && enemy.targetId !== null
        ? (state.agents.find(
            (agent) =>
              agent.id === enemy.targetId &&
              agent.active &&
              agent.hp > 0 &&
              !agent.corrupted &&
              agent.rebootTicks <= 0
          ) ?? null)
        : null;
    const shouldRefreshTankTarget =
      enemy.kind !== "brute" || (state.timers.tick + enemy.id * 7) % ENEMY_AI.tankTargetRefreshTicks === 0;

    let targetKind: Enemy["targetKind"] = "agent";
    let target:
      | Agent
      | { x: number; y: number; tx?: number; ty?: number; speed?: number; id?: number }
      | null = null;

    if (currentTankTarget && !shouldRefreshTankTarget) {
      target = currentTankTarget;
      targetKind = "agent";
    } else {
      const pick = pickEnemyTargetMulti(enemy, state, derived);
      if (pick) {
        targetKind = pick.kind;
        if (pick.kind === "agent") {
          // Re-lookup so we get the full Agent (picker only returned id/x/y).
          const agent = state.agents.find((a) => a.id === pick.id) ?? null;
          target = agent;
        } else {
          target = { x: pick.x, y: pick.y, id: pick.id ?? undefined };
        }
      }
    }

    if (!target) {
      enemy.targetId = null;
      enemy.targetKind = "agent";
      return;
    }

    // agent-like: has tx/ty/speed fields we can use for flanker lead.
    const targetIsAgent = targetKind === "agent";
    if (targetIsAgent) {
      const agent = target as Agent;
      enemy.targetId = agent.id;
      enemy.targetKind = "agent";
    } else {
      enemy.targetId = (target as { id?: number }).id ?? null;
      enemy.targetKind = targetKind;
    }

    // Squad bearing spread — squadmates pursuing the same worker pick the
    // bearing bucket (of N) with fewest same-squad competitors. Produces
    // emergent flanking without explicit coordinator state.
    let desiredX = target.x;
    let desiredY = target.y;
    const archetype = enemy.archetype;

    // Flanker lead + ghost reposition both rely on the target's movement
    // vector (tx/ty + speed). Non-agent targets are stationary, so we skip
    // those adjustments and the archetype collapses to a direct pursuit —
    // same outcome as firing at a static structure.
    if (targetIsAgent) {
      const agentTarget = target as Agent;
      if (archetype === "flanker") {
        const wdx = agentTarget.tx - agentTarget.x;
        const wdy = agentTarget.ty - agentTarget.y;
        const wmag = Math.hypot(wdx, wdy);
        if (wmag > 0.5) {
          const lead = ENEMY_AI.flankerLeadTicks * agentTarget.speed;
          desiredX = agentTarget.x + (wdx / wmag) * lead;
          desiredY = agentTarget.y + (wdy / wmag) * lead;
        }
      } else if (archetype === "ghost") {
        // 3.1.0 — permanentCloak enemies (wardens) have no cycle to gate on,
        // so they're always in the reposition phase.
        const alwaysReposition = enemy.permanentCloak === true;
        const cloakPhase = alwaysReposition
          ? (ENEMY_AI.ghostRepositionPhaseStart + ENEMY_AI.ghostRepositionPhaseEnd) / 2
          : (enemy.cloakTicks ?? 0) / ENEMY_SPECIAL.phantom.cycleTicks;
        if (
          alwaysReposition ||
          (cloakPhase > ENEMY_AI.ghostRepositionPhaseStart && cloakPhase < ENEMY_AI.ghostRepositionPhaseEnd)
        ) {
          const wdx = agentTarget.tx - agentTarget.x;
          const wdy = agentTarget.ty - agentTarget.y;
          const wmag = Math.hypot(wdx, wdy);
          if (wmag > 0.5) {
            desiredX = agentTarget.x - (wdx / wmag) * ENEMY_AI.ghostRepositionOffset;
            desiredY = agentTarget.y - (wdy / wmag) * ENEMY_AI.ghostRepositionOffset;
          }
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
      const drift =
        Math.sin((state.timers.tick + enemy.id * 17) / 20) * ENEMY_MOVEMENT.strafeAmplitude * speedScale;
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
    //
    // Crowd-check matches on (targetKind, targetId) so enemies swarming the
    // same turret/sentinel also orbit instead of stacking on one tile. For
    // the city (targetId=null, targetKind="city") we still group-orbit on
    // any enemy that also targets the city.
    const ignoresCrowd = enemy.kind === "brute";
    const crowdCount = ignoresCrowd
      ? 0
      : state.enemies.filter(
          (other) =>
            other.id !== enemy.id &&
            other.hp > 0 &&
            other.role === "combat" &&
            other.kind !== "corruptor" &&
            other.targetKind === enemy.targetKind &&
            other.targetId === enemy.targetId &&
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
      // lands from the side, not head-on. Only applies for agent targets
      // because the squadmate filter + tangent helpers are worker-specific.
      if (archetype === "flanker" && targetIsAgent) {
        const agentTarget = target as Agent;
        const squadmates = state.enemies.filter(
          (other) =>
            other.id !== enemy.id &&
            other.hp > 0 &&
            other.squadId === enemy.squadId &&
            other.targetKind === "agent" &&
            other.targetId === agentTarget.id
        );
        const tangentSign = pickSquadTangentSign(enemy, squadmates, agentTarget);
        const tx = (-dy / d) * tangentSign;
        const ty = (dx / d) * tangentSign;
        const blend = ENEMY_AI.flankerTangentBlend;
        const mx = moveX * (1 - blend) + tx * blend;
        const my = moveY * (1 - blend) + ty * blend;
        const ml = Math.max(0.001, Math.hypot(mx, my));
        moveX = mx / ml;
        moveY = my / ml;
      } else if (crowded && targetIsAgent) {
        // Intentional: small squads (below crowdingThreshold) approach directly
        // for a clean, readable attack. Bearing spread only activates for larger
        // packs so the visual distinction between lone and group attacks is clear.
        //
        // Non-agent targets skip bearing spread — grouping around a turret /
        // city is fine visually and the bucket helper expects an Agent.
        const bucket = pickSquadBearingBucket(enemy, state, target as Agent);
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
      const strafe =
        Math.sin((state.timers.tick + enemy.id * 13) / 14) * ENEMY_MOVEMENT.strafeAmplitude * speedScale;
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
