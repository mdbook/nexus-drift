/**
 * Worker corruption subsystem — 3.0.0 Step 7.
 *
 * Handles three related processes each tick:
 *  1. Warden attach — live wardens increment corruptingTicks on the nearest
 *     accessible worker; on reaching attachTicks, the worker converts and the
 *     warden despawns without going through the normal death/reward path.
 *  2. Corrupted worker tick — corrupted workers drain nearby resource nodes,
 *     accumulate corruptionTicks (for visual/drain ramp), and decay spottedTicks.
 *  3. Worker reporting — any healthy worker within workerReportRadius of a
 *     corrupted worker refreshes that agent's spottedTicks, making it visible
 *     to sentinels across the full map. Drones get 1.4× the report radius.
 */

import { WARDEN } from "@/game/balance";
import { respawnNode } from "@/game/factories";
import type { GameState } from "@/game/types";
import { dist, pushLog } from "@/game/utils";

function stepWardenAttach(state: GameState) {
  // Collect wardens that successfully attach this tick (to remove after the loop).
  const attachedWardenIndices: number[] = [];
  const activelyAttachedWorkerIds = new Set<number>();

  for (let ei = 0; ei < state.enemies.length; ei++) {
    const enemy = state.enemies[ei];
    if (enemy.kind !== "warden" || enemy.hp <= 0) continue;

    // Find the closest non-corrupted, non-rebooting active worker.
    let closest = null as typeof state.agents[0] | null;
    let closestDist = Infinity;
    for (const agent of state.agents) {
      if (!agent.active || agent.corrupted || agent.rebootTicks > 0) continue;
      const d = dist(enemy.x, enemy.y, agent.x, agent.y);
      if (d < closestDist) {
        closestDist = d;
        closest = agent;
      }
    }

    if (!closest) continue;

    if (closestDist <= WARDEN.attachRadius) {
      activelyAttachedWorkerIds.add(closest.id);
      closest.corruptingTicks += 1;
      if (closest.corruptingTicks >= WARDEN.attachTicks) {
        // Successful corruption. Worker converts; warden depletes itself.
        closest.corrupted = true;
        closest.corruptionTicks = 0;
        closest.corruptingTicks = 0;
        // Corruption boosts effective HP (tracked via corruptionTicks ramp — see FieldSvg).
        // We don't modify closest.hp here; the HP change is cosmetic / for the drain scale.
        attachedWardenIndices.push(ei);
        state.log = pushLog(
          state.log,
          `A void warden has corrupted a ${closest.kind} worker.`,
          "corruption",
          state.timers.tick
        );
      }
    }
  }

  // Not touching — slowly decay all stale attach progress. This intentionally
  // scans the workers that actually have progress rather than the nearest
  // worker to a warden this tick, because the nearest worker can change while
  // a previous target still has partial corruption banked.
  for (const agent of state.agents) {
    if (!agent.active || agent.corrupted) continue;
    if (activelyAttachedWorkerIds.has(agent.id)) continue;
    if (agent.corruptingTicks > 0) {
      agent.corruptingTicks = Math.max(0, agent.corruptingTicks - 0.5);
    }
  }

  // Remove successfully-attached wardens (reverse order to preserve indices).
  for (let i = attachedWardenIndices.length - 1; i >= 0; i--) {
    state.enemies.splice(attachedWardenIndices[i], 1);
  }
}

function stepCorruptedWorkers(state: GameState) {
  const drainedTempIds = new Set<number>();

  for (const agent of state.agents) {
    if (!agent.active || !agent.corrupted) continue;

    agent.corruptionTicks += 1;
    agent.task = "Corrupted";

    // Tick down spottedTicks (refreshed by worker reporting below).
    if (agent.spottedTicks > 0) agent.spottedTicks -= 1;

    // Node drain: bleeds nearby resource nodes at an increasing rate.
    const drainRate =
      WARDEN.drainRatePerTick * (1 + agent.corruptionTicks / WARDEN.drainRampDivisor);

    for (const node of state.nodes) {
      if (dist(agent.x, agent.y, node.x, node.y) > WARDEN.drainRadius) continue;

      node.hp -= drainRate;
      if (node.hp <= 0) {
        if (node.temporary) {
          drainedTempIds.add(node.id);
        } else {
          // Respawn the node without awarding resources.
          Object.assign(node, respawnNode(state.rng, node.id, state.nodes, state.timers.tick));
          state.log = pushLog(
            state.log,
            "Corruption consumed a resource node.",
            "corruption",
            state.timers.tick
          );
        }
      }
    }
  }

  if (drainedTempIds.size > 0) {
    state.nodes = state.nodes.filter((n) => !drainedTempIds.has(n.id));
  }
}

function stepWorkerReporting(state: GameState) {
  for (const corrupted of state.agents) {
    if (!corrupted.active || !corrupted.corrupted) continue;

    // 3.1.0 bug fix: previously this loop short-circuited on spottedTicks > 0,
    // which meant a corrupted worker that was *already* spotted never had its
    // timer refreshed — once the tick counter ran down (decayed by 1/tick in
    // stepCorruptedWorkers) it could lose visibility even with reporters still
    // standing right next to it. The scan now runs unconditionally so any
    // reporter in range keeps the timer pinned at max.
    for (const reporter of state.agents) {
      if (!reporter.active || reporter.corrupted || reporter.id === corrupted.id) continue;
      const reportRadius =
        WARDEN.workerReportRadius * (reporter.kind === "drone" ? WARDEN.workerDroneReportMult : 1);
      if (dist(reporter.x, reporter.y, corrupted.x, corrupted.y) <= reportRadius) {
        corrupted.spottedTicks = WARDEN.workerReportDuration;
        break; // one reporter is enough this tick
      }
    }
  }
}

export function stepWorkerCorruption(state: GameState) {
  stepWardenAttach(state);
  stepCorruptedWorkers(state);
  stepWorkerReporting(state);
}
