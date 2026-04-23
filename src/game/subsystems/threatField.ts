import { AI_THREAT } from "@/game/balance";
import type { Enemy } from "@/game/types";

/**
 * Threat field — pure on-demand samplers over the current enemy list.
 * Not a grid, not cached. Called from worker/sentinel/scout AI at a
 * handful of points per tick. O(n*samples) is cheap at our enemy counts.
 *
 * Corruptors and blights have weight 0 in AI_THREAT.weight so they do
 * not pull workers off mining duty. Dying enemies (hp <= 0) are skipped.
 */
export function threatAt(x: number, y: number, enemies: Enemy[]): number {
  let total = 0;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const weight = AI_THREAT.weight[enemy.kind];
    if (!weight) continue;
    const dx = x - enemy.x;
    const dy = y - enemy.y;
    const d2 = Math.max(AI_THREAT.falloffFloor, dx * dx + dy * dy);
    total += (weight / d2) * 1000;
  }
  return total;
}

/**
 * Sample threat along the straight-line path from (x1,y1) to (x2,y2) at
 * start / midpoint / destination, weighted so the destination matters
 * more than the origin (the worker already survived the origin).
 */
export function threatAlongPath(x1: number, y1: number, x2: number, y2: number, enemies: Enemy[]): number {
  const weights = AI_THREAT.weight;
  if (!enemies.length) return 0;
  // Weights intentionally inlined: [1, 1.4, 1.8] destination-biased. Tune here, not in balance.ts.
  const [w0, w1, w2] = [1, 1.4, 1.8];
  const mx = (x1 + x2) * 0.5;
  const my = (y1 + y2) * 0.5;
  // Inline to avoid three allocations per call.
  let total = 0;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const weight = weights[enemy.kind];
    if (!weight) continue;
    const dx0 = x1 - enemy.x,
      dy0 = y1 - enemy.y;
    const dx1 = mx - enemy.x,
      dy1 = my - enemy.y;
    const dx2 = x2 - enemy.x,
      dy2 = y2 - enemy.y;
    const d0 = Math.max(AI_THREAT.falloffFloor, dx0 * dx0 + dy0 * dy0);
    const d1 = Math.max(AI_THREAT.falloffFloor, dx1 * dx1 + dy1 * dy1);
    const d2 = Math.max(AI_THREAT.falloffFloor, dx2 * dx2 + dy2 * dy2);
    total += weight * 1000 * (w0 / d0 + w1 / d1 + w2 / d2);
  }
  return total;
}

/**
 * Count of hostile combat enemies (by AI_THREAT weight > 0) currently
 * within radius of a point. Used for isolation and crowding checks.
 */
export function countThreats(x: number, y: number, radius: number, enemies: Enemy[]): number {
  const r2 = radius * radius;
  let count = 0;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (!AI_THREAT.weight[enemy.kind]) continue;
    const dx = x - enemy.x;
    const dy = y - enemy.y;
    if (dx * dx + dy * dy <= r2) count += 1;
  }
  return count;
}
