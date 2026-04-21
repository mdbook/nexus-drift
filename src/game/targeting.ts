import { ENEMY_AI, ENEMY_TARGET_PRIORITY } from "@/game/balance";
import { countThreats } from "@/game/subsystems/threatField";
import type { Agent, Enemy, GameState, ResourceNode } from "@/game/types";
import { dist } from "@/game/utils";

// Home district centroid — matches combat.ts / economy.ts so "city target"
// coordinates line up with the rendered home band.
const CITY_TARGET_X = 500;
const CITY_TARGET_Y = 540;

export function findClosestAgent(
  from: { x: number; y: number },
  agents: Agent[]
): Agent | null {
  if (!agents.length) return null;
  let closest: Agent | null = null;
  let minDist = Infinity;
  for (const agent of agents) {
    const d = dist(from.x, from.y, agent.x, agent.y);
    if (d < minDist) { minDist = d; closest = agent; }
  }
  return closest;
}

export function findClosestEnemy(
  from: { x: number; y: number },
  enemies: Enemy[],
  filter?: (enemy: Enemy) => boolean
): Enemy | null {
  const candidates = filter ? enemies.filter(filter) : enemies;
  if (!candidates.length) return null;
  let closest: Enemy | null = null;
  let minDist = Infinity;
  for (const enemy of candidates) {
    const d = dist(from.x, from.y, enemy.x, enemy.y);
    if (d < minDist) { minDist = d; closest = enemy; }
  }
  return closest;
}

/**
 * Archetype-aware enemy target selection. Direct enemies favour wounded or
 * stationary workers; flankers and ambushers favour isolated workers that
 * aren't already panicking (surprise value). Falls back to plain distance
 * when no active workers match the preference.
 */
export function pickEnemyTarget(enemy: Enemy, state: GameState): Agent | null {
  const candidates = state.agents.filter((a) => a.active && a.hp > 0);
  if (!candidates.length) return null;

  const archetype = enemy.archetype;

  // Precompute nearby-ally counts per worker so archetype branches don't
  // each run an O(workers) filter inside the O(workers) candidate loop.
  // Still O(workers²) total, but runs once per call rather than once per
  // (enemy × worker) pair. Swap inner loop for spatial index when scaling.
  const nearbyAllyCounts = new Map<number, number>();
  if (archetype === "flanker" || archetype === "ambusher" || archetype === "ghost" || archetype === "skirmisher") {
    for (const worker of candidates) {
      let count = 0;
      for (const other of candidates) {
        if (other.id === worker.id) continue;
        if (dist(worker.x, worker.y, other.x, other.y) < ENEMY_AI.isolatedRadius) count += 1;
      }
      nearbyAllyCounts.set(worker.id, count);
    }
  }

  let best: Agent | null = null;
  let bestScore = Infinity;

  for (const worker of candidates) {
    const d = dist(enemy.x, enemy.y, worker.x, worker.y);
    let score = d;

    if (archetype === "direct") {
      // Wounded or at-work workers are more attractive.
      const hpRatio = worker.hp / worker.maxHp;
      if (hpRatio < ENEMY_AI.woundedHpRatio) score *= 0.7;
      if (worker.task === "Mining" || worker.task === "Collecting" || worker.task === "Syncing") {
        score *= 0.85;
      }
    } else if (archetype === "flanker" || archetype === "ambusher" || archetype === "ghost") {
      // Prefer isolated, unalert workers.
      const nearbyAllies = nearbyAllyCounts.get(worker.id) ?? 0;
      score *= 1 + nearbyAllies * 0.18;
      if (worker.evadeTicks > 0) score *= 1.3; // already panicked = less surprise
    } else if (archetype === "skirmisher") {
      // Zappers prefer workers surrounded by fewest allies AND with fewest
      // hostile allies near them — an isolated worker isn't worth much if
      // another hostile is already attacking it.
      const nearbyAllies = nearbyAllyCounts.get(worker.id) ?? 0;
      const nearbyHostiles = countThreats(worker.x, worker.y, ENEMY_AI.isolatedRadius, state.enemies);
      score *= 1 + nearbyAllies * 0.12 + Math.max(0, nearbyHostiles - 1) * 0.15;
    }

    if (score < bestScore) {
      bestScore = score;
      best = worker;
    }
  }

  return best;
}

/**
 * 3.0.0 Step 4 — multi-class target picker.
 *
 * Scores every eligible target (workers + turrets + scouts + sentinels +
 * city) against the enemy's per-kind ENEMY_TARGET_PRIORITY weights, scaled
 * by inverse distance. Highest weight/distance ratio wins. Non-combat roles
 * (corruptor/blight/leech) still have zeroed priorities and fall through.
 *
 * Agent selection delegates to pickEnemyTarget so the existing archetype
 * scoring (wounded/isolated/surrounded bias) is preserved for the worker
 * slice; we then score that one "best worker" against non-worker targets.
 * Non-agent target classes use plain center-to-center distance.
 *
 * Returns null when no class has a live, priority-weighted target available.
 */
export type EnemyTargetPick =
  | { kind: "agent"; id: number; x: number; y: number }
  | { kind: "turret"; id: number; x: number; y: number }
  | { kind: "scout"; id: number; x: number; y: number }
  | { kind: "sentinel"; id: number; x: number; y: number }
  | { kind: "city"; id: null; x: number; y: number };

export function pickEnemyTargetMulti(enemy: Enemy, state: GameState): EnemyTargetPick | null {
  const priority = ENEMY_TARGET_PRIORITY[enemy.kind];
  if (!priority) return null;

  // Scoring function: weight / (distance + floor). Higher = more attractive.
  // The floor prevents dividing by zero when the enemy is sitting on top of
  // a target, and damps the preference for point-blank targets so a brute at
  // zero range to a worker isn't always strictly better than a brute at
  // zero range to a turret.
  const FLOOR = 40;

  let bestScore = 0;
  let bestPick: EnemyTargetPick | null = null;

  if (priority.worker > 0) {
    const worker = pickEnemyTarget(enemy, state);
    if (worker) {
      const d = dist(enemy.x, enemy.y, worker.x, worker.y);
      const score = priority.worker / (d + FLOOR);
      if (score > bestScore) {
        bestScore = score;
        bestPick = { kind: "agent", id: worker.id, x: worker.x, y: worker.y };
      }
    }
  }

  if (priority.turret > 0) {
    for (const turret of state.turrets) {
      // Broken turrets still read as target candidates — visually the hull is
      // there, and it keeps enemies pushing the line instead of instantly
      // retargeting workers the moment a turret cracks.
      const d = dist(enemy.x, enemy.y, turret.x, turret.y);
      const score = priority.turret / (d + FLOOR);
      if (score > bestScore) {
        bestScore = score;
        bestPick = { kind: "turret", id: turret.id, x: turret.x, y: turret.y };
      }
    }
  }

  if (priority.scout > 0) {
    for (const scout of state.scouts) {
      if (scout.rebootTicks > 0) continue; // downed scouts are off-field
      const d = dist(enemy.x, enemy.y, scout.x, scout.y);
      const score = priority.scout / (d + FLOOR);
      if (score > bestScore) {
        bestScore = score;
        bestPick = { kind: "scout", id: scout.id, x: scout.x, y: scout.y };
      }
    }
  }

  if (priority.sentinel > 0) {
    for (const sentinel of state.sentinels) {
      if (sentinel.rebootTicks > 0) continue;
      const d = dist(enemy.x, enemy.y, sentinel.x, sentinel.y);
      const score = priority.sentinel / (d + FLOOR);
      if (score > bestScore) {
        bestScore = score;
        bestPick = { kind: "sentinel", id: sentinel.id, x: sentinel.x, y: sentinel.y };
      }
    }
  }

  if (priority.city > 0) {
    const d = dist(enemy.x, enemy.y, CITY_TARGET_X, CITY_TARGET_Y);
    const score = priority.city / (d + FLOOR);
    if (score > bestScore) {
      bestPick = { kind: "city", id: null, x: CITY_TARGET_X, y: CITY_TARGET_Y };
    }
  }

  return bestPick;
}

export function findClosestNode(
  from: { x: number; y: number },
  nodes: ResourceNode[],
  filter?: (node: ResourceNode) => boolean
): ResourceNode | null {
  const candidates = filter ? nodes.filter(filter) : nodes;
  if (!candidates.length) return null;
  let closest: ResourceNode | null = null;
  let minDist = Infinity;
  for (const node of candidates) {
    const d = dist(from.x, from.y, node.x, node.y);
    if (d < minDist) { minDist = d; closest = node; }
  }
  return closest;
}
