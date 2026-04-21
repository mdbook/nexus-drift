import { AI_THREAT, WORKER_AI, WORKER_PERSONALITY, WORKER_REGIONS } from "@/game/balance";
import { WORLD_H, WORLD_W } from "@/game/constants";
import { threatAt } from "@/game/subsystems/threatField";
import type { Agent, Enemy } from "@/game/types";
import { clamp, dist } from "@/game/utils";

/** Penalty term for being near a world edge. Used by anti-corner evasion. */
export function wallPenalty(x: number, y: number): number {
  let penalty = 0;
  if (x < AI_THREAT.cornerWallBuffer) penalty += (AI_THREAT.cornerWallBuffer - x) * 0.002;
  if (x > WORLD_W - AI_THREAT.cornerWallBuffer) penalty += (x - (WORLD_W - AI_THREAT.cornerWallBuffer)) * 0.002;
  if (y < 50 + AI_THREAT.cornerWallBuffer) penalty += (50 + AI_THREAT.cornerWallBuffer - y) * 0.002;
  if (y > WORLD_H - AI_THREAT.cornerWallBuffer) penalty += (y - (WORLD_H - AI_THREAT.cornerWallBuffer)) * 0.002;
  return penalty;
}

/**
 * Centroid of non-evading, non-disabled active workers. Used as the
 * regroup target for panicked workers and the patrol anchor for sentinels.
 */
export function computeRegroupCentroid(agents: Agent[]): { x: number; y: number; count: number } {
  let x = 0, y = 0, count = 0;
  for (const agent of agents) {
    if (!agent.active || agent.evadeTicks > 0 || agent.disabledTicks > 0) continue;
    x += agent.x;
    y += agent.y;
    count += 1;
  }
  if (count > 0) { x /= count; y /= count; }
  return { x, y, count };
}

/** EMA update of threat-field sample at the worker's position. */
export function updateThreatMemory(agent: Agent, enemies: Enemy[]): void {
  const local = threatAt(agent.x, agent.y, enemies);
  agent.threatMemory =
    agent.threatMemory * WORKER_AI.threatMemoryDecay +
    local * WORKER_AI.threatMemoryGain;
}

/**
 * If the agent's current evasion direction projects into a wall, rotate
 * through candidate angles and return the lowest-threat heading that
 * stays in bounds. Returns the original direction unchanged if not near a wall.
 */
export function resolveAntiCornerEvasion(
  direction: { x: number; y: number },
  agent: Agent,
  enemies: Enemy[]
): { x: number; y: number } {
  const lookahead = AI_THREAT.cornerLookaheadTicks;
  const projX = agent.x + direction.x * agent.speed * lookahead;
  const projY = agent.y + direction.y * agent.speed * lookahead;
  const nearWall =
    projX < AI_THREAT.cornerWallBuffer ||
    projX > WORLD_W - AI_THREAT.cornerWallBuffer ||
    projY < 50 + AI_THREAT.cornerWallBuffer ||
    projY > WORLD_H - AI_THREAT.cornerWallBuffer;

  if (!nearWall) return direction;

  const baseAngle = Math.atan2(direction.y, direction.x);
  let bestAngle = baseAngle;
  let bestCost = threatAt(projX, projY, enemies) + wallPenalty(projX, projY);
  for (const offset of WORKER_AI.cornerRotationCandidates) {
    const a = baseAngle + offset;
    const cx = agent.x + Math.cos(a) * agent.speed * lookahead;
    const cy = agent.y + Math.sin(a) * agent.speed * lookahead;
    const cost = threatAt(cx, cy, enemies) + wallPenalty(cx, cy);
    if (cost < bestCost) { bestCost = cost; bestAngle = a; }
  }
  return { x: Math.cos(bestAngle), y: Math.sin(bestAngle) };
}

/**
 * Nudges a hurt-but-not-recovering worker toward their kind's home region.
 * Applied during normal traversal to keep wounded workers in safer territory.
 */
export function applyLowHpRegionPull(agent: Agent): void {
  const region = WORKER_REGIONS[agent.kind];
  const personality = WORKER_PERSONALITY[agent.kind];
  const rdx = region.cx - agent.x;
  const rdy = region.cy - agent.y;
  const rmag = Math.max(1, Math.hypot(rdx, rdy));
  agent.x += (rdx / rmag) * personality.lowHpPull;
  agent.y += (rdy / rmag) * personality.lowHpPull;
}

/**
 * Same-kind dispersal — prevents workers of the same kind from clustering.
 *
 * Two-phase design for consistency:
 *   Compute phase: reads post-movement positions, writes nothing.
 *     All agents see the same snapshot → no ordering artifacts.
 *   Apply phase: writes positions, no position reads.
 *     Clean seam: replace the inner loop with a spatial grid query
 *     here when agent counts justify it, without touching the apply phase.
 */
export function computeAndApplyGroupDispersal(agents: Agent[]): void {
  // Compute phase
  const impulses: Array<{ dx: number; dy: number }> = agents.map(() => ({ dx: 0, dy: 0 }));
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    if (!agent.active || agent.evadeTicks > 0) continue;
    const personality = WORKER_PERSONALITY[agent.kind];
    let pcx = 0, pcy = 0, count = 0;
    for (const other of agents) {
      if (!other.active || other.id === agent.id || other.kind !== agent.kind) continue;
      const d = dist(agent.x, agent.y, other.x, other.y);
      if (d < personality.groupRepelRadius) { pcx += other.x; pcy += other.y; count += 1; }
    }
    if (count >= personality.groupRepelMinCount) {
      pcx /= count;
      pcy /= count;
      const rdx = agent.x - pcx;
      const rdy = agent.y - pcy;
      const rmag = Math.max(1, Math.hypot(rdx, rdy));
      const strength = 0.5 + (count - personality.groupRepelMinCount) * 0.25;
      impulses[i] = { dx: (rdx / rmag) * strength, dy: (rdy / rmag) * strength };
    }
  }

  // Apply phase
  for (let i = 0; i < agents.length; i++) {
    const { dx, dy } = impulses[i];
    if (dx === 0 && dy === 0) continue;
    const agent = agents[i];
    agent.x = clamp(agent.x + dx, 20, WORLD_W - 20);
    agent.y = clamp(agent.y + dy, 50, WORLD_H - 32);
  }
}
