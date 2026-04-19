import type { Agent, Enemy, ResourceNode } from "@/game/types";
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
