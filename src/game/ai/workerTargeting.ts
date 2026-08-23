import { WORKER_ABILITIES, WORKER_AI, WORKER_PERSONALITY, WORKER_REGIONS } from "@/game/balance";
import { countThreats, threatAlongPath } from "@/game/subsystems/threatField";
import type { SimTraceCtx, WorkerTargetTraceCandidate } from "@/game/trace";
import type { Agent, Enemy, GameState, ResourceNode } from "@/game/types";
import { dist, elapsedTicks } from "@/game/utils";

/** The "why" fields a caller can ask `scoreWorkerNode` to surface (trace-only). */
type WorkerNodeScoreWhy = Omit<WorkerTargetTraceCandidate, "nodeId" | "score">;

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

function buildDroneCoveredNodes(agents: Agent[], nodes: ResourceNode[]): Set<number> {
  const covered = new Set<number>();
  for (const agent of agents) {
    if (!agent.active || agent.kind !== "drone") continue;
    for (const node of nodes) {
      if (dist(agent.x, agent.y, node.x, node.y) <= WORKER_ABILITIES.droneScanRadius) {
        covered.add(node.id);
      }
    }
  }
  return covered;
}

function scoreWorkerNode(
  agent: Agent,
  node: ResourceNode,
  enemies: Enemy[],
  contestedMap: Map<number, ContestEntry>,
  isCurrentTarget = false,
  droneCoveredNodes: Set<number> = new Set(),
  // ponytail: trace-only sink. When present it is filled with the already-computed
  // "why" locals (never recomputed); when undefined this fn behaves exactly as before.
  why?: WorkerNodeScoreWhy
): number {
  const d = dist(agent.x, agent.y, node.x, node.y);
  const hpFactor = node.hp / node.maxHp;

  // Base: distance + hp urgency (nodes with less remaining hp score lower = better,
  // but we still slightly prefer fresh nodes over mostly-depleted ones that will
  // respawn on us mid-trip).
  let score = d * 0.55 + hpFactor * 70;

  // Type preference — aggressive tiers with per-agent harvestBias nudge.
  // harvestBias ∈ [-0.15, 0.15]: positive values make tier-1 nodes more
  // attractive (lower score) and off-tier nodes less (higher score).
  if (WORKER_TIER1[agent.kind].includes(node.kind)) {
    score *= 0.45;
    score -= 20 * agent.harvestBias;
  } else if (WORKER_TIER2[agent.kind].includes(node.kind)) {
    score *= 0.78;
    score -= 8 * agent.harvestBias;
  } else {
    score *= 1.6;
    score += 15 * agent.harvestBias;
  }

  // Contested penalty + evading-worker penalty (a node attracting panic is bad).
  // Quadratic contested penalty — a second worker on the same node is fine,
  // but a third is a strong deterrent so workers spread across nodes.
  const { count: contested, evading: evadingContested } = contestedMap.get(node.id) ?? {
    count: 0,
    evading: 0,
  };
  score += contested * 90 + contested * contested * 55 + evadingContested * WORKER_AI.evadingContestedPenalty;

  // Corruption. Miners tolerate; others hard-avoid above threshold.
  // Drone scan reduces the hard-avoid multiplier when a drone covers this node.
  if (node.corruption > WORKER_AI.corruptionHardAvoidAbove && agent.kind !== "miner") {
    const scanDiscount = droneCoveredNodes.has(node.id) ? WORKER_ABILITIES.droneScanCorruptionDiscount : 0;
    score *= Math.max(1, WORKER_AI.corruptionSoftMultiplier - scanDiscount);
  } else if (node.corruption > 12) {
    score *= agent.kind === "miner" ? 1.05 : 0.88;
  }

  // Path safety — penalize routes that cross heavy threat. Miners are braver,
  // drones are more cautious, per WORKER_PERSONALITY.pathFearScale.
  // Per-agent fearMod further multiplies the penalty: >1 = more cautious, <1 = braver.
  // 3.2.1 — recently-spooked workers (just exited evasion) treat threat as
  // costlier, so they don't immediately path back through the same lane they
  // just fled from. See WORKER_AI.spookedDuration / spookedThreatMultiplier.
  // ponytail: hoisted so the trace can surface it below without recomputing. Stays 0
  // when there are no enemies — the same value the scoring math would have used.
  let pathThreat = 0;
  if (enemies.length > 0) {
    const spookMultiplier = agent.spookedTicks > 0 ? WORKER_AI.spookedThreatMultiplier : 1;
    pathThreat = threatAlongPath(agent.x, agent.y, node.x, node.y, enemies);
    score +=
      pathThreat *
      WORKER_AI.pathSafetyPenalty *
      WORKER_PERSONALITY[agent.kind].pathFearScale *
      agent.fearMod *
      spookMultiplier;

    const nodeThreats = countThreats(node.x, node.y, WORKER_AI.nodeThreatRadius, enemies);
    score +=
      (nodeThreats * WORKER_AI.nodeThreatCrowdPenalty +
        nodeThreats * nodeThreats * WORKER_AI.nodeThreatCrowdPenalty * 0.25) *
      spookMultiplier;
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
  score += (agent.id * 41 + node.id * 17) % 20;

  // ponytail: surface the decision inputs for the trace only when a sink asked.
  if (why) {
    why.harvestBias = agent.harvestBias;
    why.fearMod = agent.fearMod;
    why.spookedTicks = agent.spookedTicks;
    why.pathThreat = pathThreat;
    why.corruption = node.corruption;
  }
  return score;
}

export function chooseWorkerTarget(state: GameState, agent: Agent, ctx?: SimTraceCtx): number | null {
  if (!state.nodes.length) return null;
  const liveEnemies = state.enemies.filter((enemy) => enemy.hp > 0);

  // Precompute per-node contest counts once so scoreWorkerNode doesn't
  // iterate all agents for every node × every caller.
  const contestedMap = buildContestedMap(state, agent);

  // Precompute which nodes are within drone scan radius for the scan ability.
  const droneCoveredNodes = buildDroneCoveredNodes(state.agents, state.nodes);

  const ranked = state.nodes
    .map((node) => {
      // ponytail: only allocate the per-candidate "why" record when tracing is on.
      const why = ctx ? ({} as WorkerNodeScoreWhy) : undefined;
      const score = scoreWorkerNode(
        agent,
        node,
        liveEnemies,
        contestedMap,
        node.id === agent.target,
        droneCoveredNodes,
        why
      );
      return { id: node.id, score, why };
    })
    .sort((a, b) => a.score - b.score);

  const best = ranked[0];
  if (!best) return state.nodes[0].id;

  // Sticky retargeting — stay on current node unless a candidate is materially better.
  let chosenId = best.id;
  let stickyHeld = false;
  const current = agent.target != null ? state.nodes.find((n) => n.id === agent.target) : null;
  if (current) {
    const currentScore = scoreWorkerNode(agent, current, liveEnemies, contestedMap, true, droneCoveredNodes);
    if (best.score >= currentScore * WORKER_AI.stickyThreshold) {
      chosenId = current.id;
      stickyHeld = true;
    }
  }

  // 4.0/4.1.0 — soft player suggestion. Applied AFTER sticky so a live nudge
  // outranks sticky retarget, but it NEVER bypasses the safety filters: the
  // suggested node still has to survive the same path-threat and corruption
  // checks the scorer honors. Crucially this only overrides `chosenId` — it draws
  // no rng, adds no candidate, and still flows through the single emit below.
  //
  // 4.1.0 Fix 1(b): a node suggestion no longer silently expires unused. It is
  // cleared only on arrival, true time-expiry, or the node being gone. An unsafe
  // path/corruption is a TRANSIENT rejection — the nudge is RETAINED (this tick
  // falls back to normal scoring) and retried on the next retarget until the path
  // clears, the worker arrives, or it truly expires. `chooseWorkerTarget` only
  // ever consumes `kind: "node"`; a `"home"` command is handled in movement.ts,
  // so it falls through here to normal node scoring (and is left untouched).
  const suggestion = agent.suggestedTarget;
  if (suggestion && suggestion.kind === "node" && suggestion.id != null) {
    if (elapsedTicks(state.timers.tick, suggestion.createdAt) >= WORKER_AI.suggestionExpiryTicks) {
      agent.suggestedTarget = undefined; // expired — fall back to normal scoring
    } else {
      const suggestedId = Number(suggestion.id);
      const suggestedNode = state.nodes.find((n) => n.id === suggestedId);
      if (suggestedNode == null) {
        agent.suggestedTarget = undefined; // node gone — clear
      } else {
        const pathThreat =
          liveEnemies.length > 0
            ? threatAlongPath(agent.x, agent.y, suggestedNode.x, suggestedNode.y, liveEnemies)
            : 0;
        const corruptionBlocked =
          agent.kind !== "miner" && suggestedNode.corruption > WORKER_AI.corruptionHardAvoidAbove;
        const eligible = !corruptionBlocked && pathThreat <= WORKER_AI.suggestionMaxPathThreat;
        if (eligible) {
          chosenId = suggestedId;
          stickyHeld = false;
          if (dist(agent.x, agent.y, suggestedNode.x, suggestedNode.y) <= WORKER_AI.suggestionArrivalRadius) {
            agent.suggestedTarget = undefined; // arrived — hand back to normal AI
          }
        }
        // else: transient unsafe — retain the nudge and retry on the next retarget.
      }
    }
  }

  // ponytail: assemble + emit the trace record only when a sink is attached.
  // The suggested pick reaches this emit through `chosenId` above — there is no
  // early return that would skip the trace when a suggestion is honored.
  if (ctx) {
    ctx.recordWorkerTarget({
      tick: state.timers.tick,
      agentId: agent.id,
      candidates: ranked.map((r) => ({ nodeId: r.id, score: r.score, ...r.why! })),
      chosenId,
      stickyHeld,
    });
  }

  return chosenId;
}

export function chooseFleeDirectionTarget(state: GameState, agent: Agent, ctx?: SimTraceCtx): number | null {
  if (!state.nodes.length) return null;
  const mag = Math.hypot(agent.evadeDx, agent.evadeDy);
  if (mag < 0.001) return null;

  const dirX = agent.evadeDx / mag;
  const dirY = agent.evadeDy / mag;
  const contestedMap = buildContestedMap(state, agent);
  const liveEnemies = state.enemies.filter((enemy) => enemy.hp > 0);
  const droneCoveredNodes = buildDroneCoveredNodes(state.agents, state.nodes);

  let bestId: number | null = null;
  let bestScore = Infinity;
  // ponytail: only buffer flee candidates when a trace sink is attached.
  const traced: WorkerTargetTraceCandidate[] | undefined = ctx ? [] : undefined;

  for (const node of state.nodes) {
    const dx = node.x - agent.x;
    const dy = node.y - agent.y;
    const forward = dx * dirX + dy * dirY;
    if (forward < WORKER_AI.fleeTargetMinForward || forward > WORKER_AI.fleeTargetLookahead) continue;

    const lateral = Math.abs(dx * dirY - dy * dirX);
    if (lateral > WORKER_AI.fleeTargetLateralLimit) continue;

    const pathThreat =
      liveEnemies.length > 0 ? threatAlongPath(agent.x, agent.y, node.x, node.y, liveEnemies) : 0;
    if (pathThreat > WORKER_AI.fleeTargetMaxPathThreat) continue;

    const current = node.id === agent.target;
    const why = ctx ? ({} as WorkerNodeScoreWhy) : undefined;
    const baseScore = scoreWorkerNode(
      agent,
      node,
      liveEnemies,
      contestedMap,
      current,
      droneCoveredNodes,
      why
    );
    const alignmentScore = forward * 0.2 + lateral * 1.15 + pathThreat * WORKER_AI.pathSafetyPenalty * 3;
    const score = baseScore + alignmentScore;
    if (traced) traced.push({ nodeId: node.id, score, ...why! });
    if (score < bestScore) {
      bestScore = score;
      bestId = node.id;
    }
  }

  // ponytail: emit the flee retarget decision only when a sink is attached.
  if (traced) {
    ctx?.recordWorkerTarget({
      tick: state.timers.tick,
      agentId: agent.id,
      candidates: traced,
      chosenId: bestId,
      stickyHeld: false,
    });
  }

  return bestId;
}
