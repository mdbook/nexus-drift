import { ENEMY_AI } from "@/game/balance";
import { countThreats } from "@/game/subsystems/threatField";
import type { Agent, Enemy, GameState, ResourceNode } from "@/game/types";
import { dist } from "@/game/utils";

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
      const nearbyAllies = state.agents.filter(
        (other) =>
          other.active &&
          other.id !== worker.id &&
          dist(worker.x, worker.y, other.x, other.y) < ENEMY_AI.isolatedRadius
      ).length;
      score *= 1 + nearbyAllies * 0.18;
      if (worker.evadeTicks > 0) score *= 1.3; // already panicked = less surprise
    } else if (archetype === "skirmisher") {
      // Zappers prefer workers surrounded by fewest allies AND with fewest
      // hostile allies near them — an isolated worker isn't worth much if
      // another hostile is already attacking it.
      const nearbyAllies = state.agents.filter(
        (other) =>
          other.active &&
          other.id !== worker.id &&
          dist(worker.x, worker.y, other.x, other.y) < ENEMY_AI.isolatedRadius
      ).length;
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
