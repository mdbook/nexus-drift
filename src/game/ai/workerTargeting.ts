import { WORKER_AI, WORKER_PERSONALITY, WORKER_REGIONS } from "@/game/balance";
import { threatAlongPath } from "@/game/subsystems/threatField";
import type { Agent, Enemy, GameState, ResourceNode } from "@/game/types";
import { dist } from "@/game/utils";

// Tier 1 = strongly preferred, Tier 2 = acceptable, anything else = avoided
const WORKER_TIER1: Record<Agent["kind"], string[]> = {
  miner: ["gold"],
  runner: ["ore", "energy"],
  drone: ["gems", "energy"],
};
const WORKER_TIER2: Record<Agent["kind"], string[]> = {
  miner: ["ore"],
  runner: ["gold"],
  drone: [],
};

type ContestEntry = { count: number; evading: number };

function buildContestedMap(state: GameState, agent: Agent): Map<number, ContestEntry> {
  const contestedMap = new Map<number, ContestEntry>();
  for (const other of state.agents) {
    if (!other.active || other.id === agent.id || other.target == null) continue;
    const entry = contestedMap.get(other.target) ?? { count: 0, evading: 0 };
    entry.count += 1;
    if (other.evadeTicks > 0) entry.evading += 1;
    contestedMap.set(other.target, entry);
  }
  return contestedMap;
}

function scoreWorkerNode(
  agent: Agent,
  node: ResourceNode,
  enemies: Enemy[],
  contestedMap: Map<number, ContestEntry>,
  isCurrentTarget = false
): number {
  const d = dist(agent.x, agent.y, node.x, node.y);
  const hpFactor = node.hp / node.maxHp;

  // Base: distance + hp urgency (nodes with less remaining hp score lower = better,
  // but we still slightly prefer fresh nodes over mostly-depleted ones that will
  // respawn on us mid-trip).
  let score = d * 0.55 + hpFactor * 70;

  // Type preference — aggressive tiers
  if (WORKER_TIER1[agent.kind].includes(node.kind)) {
    score *= 0.45;
  } else if (WORKER_TIER2[agent.kind].includes(node.kind)) {
    score *= 0.78;
  } else {
    score *= 1.6;
  }

  // Contested penalty + evading-worker penalty (a node attracting panic is bad).
  // Quadratic contested penalty — a second worker on the same node is fine,
  // but a third is a strong deterrent so workers spread across nodes.
  const { count: contested, evading: evadingContested } = contestedMap.get(node.id) ?? { count: 0, evading: 0 };
  score += contested * 90 + contested * contested * 55 + evadingContested * WORKER_AI.evadingContestedPenalty;

  // Corruption. Miners tolerate; others hard-avoid above threshold.
  if (node.corruption > WORKER_AI.corruptionHardAvoidAbove && agent.kind !== "miner") {
    score *= WORKER_AI.corruptionSoftMultiplier;
  } else if (node.corruption > 12) {
    score *= agent.kind === "miner" ? 1.05 : 0.88;
  }

  // Path safety — penalize routes that cross heavy threat. Miners are braver,
  // drones are more cautious, per WORKER_PERSONALITY.pathFearScale.
  if (enemies.length > 0) {
    const pathThreat = threatAlongPath(agent.x, agent.y, node.x, node.y, enemies);
    score += pathThreat * WORKER_AI.pathSafetyPenalty * WORKER_PERSONALITY[agent.kind].pathFearScale;
  }

  // Region bias — prefer nodes inside this worker kind's home territory.
  const region = WORKER_REGIONS[agent.kind];
  const regionDist = dist(node.x, node.y, region.cx, region.cy);
  score += regionDist * WORKER_PERSONALITY[agent.kind].regionBias;

  // Progress bias: only a tiny nudge for partially-mined nodes when they are
  // also uncontested — avoid encouraging pile-on.
  if (node.workTicks > WORKER_AI.progressActiveThreshold && contested === 0) {
    score += WORKER_AI.progressActiveBonus;
  }
  if (isCurrentTarget && hpFactor < 0.95) {
    score += WORKER_AI.currentTargetProgressBonus * (1 - hpFactor);
  }
  if (hpFactor > 0.95) {
    score += WORKER_AI.progressFreshBonus;
  }

  // Deterministic jitter to break ties.
  score += ((agent.id * 41 + node.id * 17) % 20);
  return score;
}

export function chooseWorkerTarget(state: GameState, agent: Agent): number | null {
  if (!state.nodes.length) return null;
  const enemies = state.enemies;

  // Precompute per-node contest counts once so scoreWorkerNode doesn't
  // iterate all agents for every node × every caller.
  const contestedMap = buildContestedMap(state, agent);

  const ranked = state.nodes
    .map((node) => ({
      id: node.id,
      score: scoreWorkerNode(agent, node, enemies, contestedMap, node.id === agent.target),
    }))
    .sort((a, b) => a.score - b.score);

  const best = ranked[0];
  if (!best) return state.nodes[0].id;

  // Sticky retargeting — stay on current node unless a candidate is materially better.
  const current = agent.target != null ? state.nodes.find((n) => n.id === agent.target) : null;
  if (current) {
    const currentScore = scoreWorkerNode(agent, current, enemies, contestedMap, true);
    if (best.score >= currentScore * WORKER_AI.stickyThreshold) {
      return current.id;
    }
  }

  return best.id;
}

export function chooseFleeDirectionTarget(state: GameState, agent: Agent): number | null {
  if (!state.nodes.length) return null;
  const mag = Math.hypot(agent.evadeDx, agent.evadeDy);
  if (mag < 0.001) return null;

  const dirX = agent.evadeDx / mag;
  const dirY = agent.evadeDy / mag;
  const contestedMap = buildContestedMap(state, agent);
  const enemies = state.enemies;

  let bestId: number | null = null;
  let bestScore = Infinity;

  for (const node of state.nodes) {
    const dx = node.x - agent.x;
    const dy = node.y - agent.y;
    const forward = dx * dirX + dy * dirY;
    if (forward < WORKER_AI.fleeTargetMinForward || forward > WORKER_AI.fleeTargetLookahead) continue;

    const lateral = Math.abs(dx * dirY - dy * dirX);
    if (lateral > WORKER_AI.fleeTargetLateralLimit) continue;

    const pathThreat = enemies.length > 0
      ? threatAlongPath(agent.x, agent.y, node.x, node.y, enemies)
      : 0;
    if (pathThreat > WORKER_AI.fleeTargetMaxPathThreat) continue;

    const current = node.id === agent.target;
    const baseScore = scoreWorkerNode(agent, node, enemies, contestedMap, current);
    const alignmentScore = forward * 0.2 + lateral * 1.15 + pathThreat * WORKER_AI.pathSafetyPenalty * 3;
    const score = baseScore + alignmentScore;
    if (score < bestScore) {
      bestScore = score;
      bestId = node.id;
    }
  }

  return bestId;
}
