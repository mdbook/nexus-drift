import { MISSILE_SILO, OPERATOR_ACTIONS, PRIORITY_MARK, WORKER_AI } from "@/game/balance";
import { WORLD_H, WORLD_W } from "@/game/constants";
import { isCloaked } from "@/game/enemyUtils";
import { computeDerived } from "@/game/selectors";
import type { Agent, GameState } from "@/game/types";
import { clamp, dist, elapsedTicks } from "@/game/utils";

/**
 * 4.0 Phase 2 — soft click-to-suggest worker guidance and defense priority.
 *
 * These are the only writers of `Agent.suggestedTarget` and `state.priorityMarks`.
 * Both are deliberately soft nudges: the worker AI (`chooseWorkerTarget`) and the
 * turret target scorer (`getTurretTargetScore`) read them as preferences that
 * still defer to the existing safety/eligibility filters. Nothing here bypasses
 * path-threat, corruption, flee, cloak, range, or role rules.
 */

/**
 * Stamp a soft "go mine this node" nudge on the nearest eligible worker. Prefers
 * the worker closest to the click point (or the node when no click XY is given).
 * A fleeing / rebooting / disabled / corrupted worker is skipped so we never yank
 * a unit that AI is actively keeping alive. A non-miner is also skipped when the
 * node is heavily corrupted (`corruption > WORKER_AI.corruptionHardAvoidAbove`),
 * mirroring the sim's own corruption hard-block so we never stamp a worker the
 * sim would refuse to move (which would draw a dead "tasked" lead-line and waste
 * energy). Returns true when a worker was nudged; false (before charging energy)
 * when no eligible worker exists.
 */
export function suggestWorkerToNode(
  state: GameState,
  nodeId: number,
  clickXY?: { x: number; y: number }
): boolean {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return false;

  const anchor = clickXY ?? { x: node.x, y: node.y };
  // 4.4.1 — match the sim's corruption eligibility so the nudge lands on a worker
  // that can actually accept THIS node. `chooseWorkerTarget` (workerTargeting.ts)
  // hard-blocks a non-miner from a heavily-corrupted suggested node
  // (`corruptionBlocked = agent.kind !== "miner" && node.corruption > threshold`)
  // and, when blocked, RETAINS the nudge without applying it — so stamping the
  // nearest non-miner on a corrupted node draws the "tasked" lead-line while the
  // worker never switches (and energy was still spent). Gate selection on the same
  // rule: for a heavily-corrupted node only miners are eligible; for a clean node
  // every kind is eligible (nearest-any, unchanged). Same threshold constant as
  // the sim — never hardcoded. pathThreat is deliberately NOT mirrored: that
  // rejection is transient/enemy-based and the retained-retry path handles it.
  const nodeBlocksNonMiners = node.corruption > WORKER_AI.corruptionHardAvoidAbove;
  let best: GameState["agents"][number] | null = null;
  let bestDist = Infinity;
  for (const agent of state.agents) {
    if (!agent.active || agent.hp <= 0 || agent.corrupted) continue;
    if (agent.rebootTicks > 0 || agent.disabledTicks > 0) continue;
    if (agent.evadeTicks > 0) continue; // don't override an actively-fleeing worker
    if (nodeBlocksNonMiners && agent.kind !== "miner") continue; // corruption-blocked for this node
    const d = dist(anchor.x, anchor.y, agent.x, agent.y);
    if (d < bestDist) {
      bestDist = d;
      best = agent;
    }
  }
  if (!best) return false;

  // 4.4.0 — operator-action energy cost. Charged only when the action can
  // actually land (a nudge-able worker exists); refused when the reserve can't
  // cover it so the caller shows a "Not enough energy" cue. UI-path only — this
  // helper is never called on the sim/headless tick, so it is trace-neutral.
  if (state.resources.energy < OPERATOR_ACTIONS.nudgeWorkerCost) return false;
  state.resources.energy -= OPERATOR_ACTIONS.nudgeWorkerCost;

  // 4.5.0 single-owner: enforce ONE owner per node. Clear any OTHER worker whose
  // node-suggestion points at this same node before stamping the new owner, so a
  // re-click (which can pick a different nearest worker) never leaves two workers
  // tasked to one node with a stale "tasked" cue on the loser (A1).
  for (const agent of state.agents) {
    if (agent.id === best.id) continue;
    if (agent.suggestedTarget?.kind === "node" && Number(agent.suggestedTarget.id) === nodeId) {
      agent.suggestedTarget = undefined;
    }
  }

  best.suggestedTarget = {
    kind: "node",
    id: String(nodeId),
    createdAt: state.timers.tick,
  };
  return true;
}

/**
 * 4.5.0 — order toggle / cancel-at-node. If ANY worker already carries a
 * `kind:"node"` suggestion pointing at this node, clear it (return that worker to
 * normal AI) and report true — so clicking a tasked node TOGGLES the order off.
 * No energy is charged for a cancel (the caller checks this first, before
 * `suggestWorkerToNode`, so a re-click undoes rather than re-charges). UI-path
 * only; trace-neutral (never called on the headless/replay tick).
 */
export function cancelWorkerOrderToNode(state: GameState, nodeId: number): boolean {
  let cancelled = false;
  for (const agent of state.agents) {
    if (agent.suggestedTarget?.kind === "node" && Number(agent.suggestedTarget.id) === nodeId) {
      agent.suggestedTarget = undefined;
      cancelled = true;
    }
  }
  return cancelled;
}

/**
 * 4.5.0 — cancel a SPECIFIC worker's node order (the worker inspect popover's
 * "Cancel order" action). Clears the worker's `kind:"node"` suggestion and returns
 * it to normal AI. Returns false when the worker has no node order to cancel. No
 * energy charged. UI-path only; trace-neutral.
 */
export function cancelWorkerOrder(state: GameState, agentId: number): boolean {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent || agent.suggestedTarget?.kind !== "node") return false;
  agent.suggestedTarget = undefined;
  return true;
}

/**
 * Flag a live enemy as a defense priority. Refreshes the expiry if it is already
 * marked, otherwise pushes a new short-lived entry. The bias is applied by
 * `getTurretTargetScore`; a cloaked / dead enemy that never reaches scoring
 * simply never benefits from the mark. Returns true when a live enemy was marked.
 */
export function suggestDefensePriority(state: GameState, enemyId: number): boolean {
  const enemy = state.enemies.find((e) => e.id === enemyId && e.hp > 0);
  if (!enemy) return false;

  // 4.4.0 — operator-action energy cost (UI-path only; trace-neutral).
  if (state.resources.energy < OPERATOR_ACTIONS.markThreatCost) return false;
  state.resources.energy -= OPERATOR_ACTIONS.markThreatCost;

  const existing = state.priorityMarks.find((mark) => mark.enemyId === enemyId);
  if (existing) {
    existing.createdAt = state.timers.tick;
  } else {
    state.priorityMarks.push({ enemyId, createdAt: state.timers.tick });
  }
  return true;
}

/**
 * 4.1.0 — the worker popover's "Send home" command. Stamps a PERSISTENT
 * `suggestedTarget: { kind: "home" }` marker that `movement.ts` reads to route the
 * worker back to its home pad (`homeX/homeY`). Unlike the soft 4.0 send-home (which
 * just nulled `target` and let the AI immediately re-pick), this is a real forced
 * return: the marker does not time-expire and is cleared only when the worker
 * reaches home (within `WORKER_AI.suggestionArrivalRadius`), after which normal AI
 * resumes. It is NOT a hard override of survival — the worker still flee-dodges real
 * threats en route (movement's evade branch runs first). `chooseWorkerTarget` never
 * consumes a "home" marker, so node scoring keeps producing a harmless fall-through
 * `target` that the movement-layer home routing overrides. `target` is nulled so the
 * home leg starts clean. Returns true when a worker was found. A fleeing / rebooting
 * / disabled / corrupted worker is left alone.
 */
export function suggestWorkerHome(state: GameState, agentId: number): boolean {
  const agent = state.agents.find((a) => a.id === agentId && a.active);
  if (!agent || agent.hp <= 0 || agent.corrupted) return false;
  if (agent.rebootTicks > 0 || agent.disabledTicks > 0 || agent.evadeTicks > 0) return false;

  // 4.4.0 — operator-action energy cost (UI-path only; trace-neutral).
  if (state.resources.energy < OPERATOR_ACTIONS.sendHomeCost) return false;
  state.resources.energy -= OPERATOR_ACTIONS.sendHomeCost;

  agent.suggestedTarget = { kind: "home", createdAt: state.timers.tick };
  agent.target = null;
  return true;
}

/**
 * 4.3.0 — press-and-hold "lead your workers" gesture point. `setLeadPoint`
 * stamps the world-space point the operator is holding/dragging; `clearLeadPoint`
 * removes it on release. These are the ONLY writers of `state.leadPoint`, and
 * they are called only from the UI pointer handlers — never on the
 * headless/replay path — so the movement bias that reads `state.leadPoint`
 * (movement.ts) is a strict no-op in a headless run (trace-neutral, like
 * `suggestedTarget` / `priorityMarks`). The point is clamped into the field so a
 * drag off the edge still resolves to an in-bounds lead.
 */
export function setLeadPoint(state: GameState, x: number, y: number): void {
  state.leadPoint = {
    x: clamp(x, 0, WORLD_W),
    y: clamp(y, 0, WORLD_H),
  };
}

export function clearLeadPoint(state: GameState): void {
  state.leadPoint = undefined;
}

/** True when this enemy carries an unexpired player defense-priority mark. */
export function isPriorityMarked(state: GameState, enemyId: number): boolean {
  return state.priorityMarks.some(
    (mark) =>
      mark.enemyId === enemyId && elapsedTicks(state.timers.tick, mark.createdAt) < PRIORITY_MARK.expiryTicks
  );
}

/**
 * 4.x — "can any live weapon currently act on this enemy?" Drives the honest
 * "Mark priority" popover state so marking an enemy that no weapon can engage
 * (cloaked, out of every weapon's range, or pre-any-weapon) reports the truth
 * instead of silently no-op'ing after the popover said "marked". Mirrors the
 * exact eligibility every mark-consuming weapon applies:
 *   - corruptors are purge-wing targets — no turret / silo / sentinel scores them;
 *   - a cloaked enemy is filtered out of every weapon's candidate set;
 *   - sentinels chase any visible combat threat from ANYWHERE, so one live
 *     sentinel means the mark is actionable;
 *   - turrets fire from fixed emplacements up to their live per-tick `range`;
 *   - silos fire up to a level-scaled range (same formula as stepMissileSilos).
 * Pure read — no sim mutation.
 */
export function canWeaponActOnEnemy(state: GameState, enemyId: number): boolean {
  const enemy = state.enemies.find((e) => e.id === enemyId && e.hp > 0);
  if (!enemy) return false;
  if (enemy.role === "corruptor") return false;
  if (isCloaked(enemy)) return false;

  const derived = computeDerived(state);
  // Live sentinels acquire visible combat threats regardless of distance.
  if (derived.activeSentinels > 0) return true;

  // Turrets: fixed emplacements, live acquisition range stored on the entity.
  for (let i = 0; i < derived.activeTurrets; i++) {
    const t = state.turrets[i];
    if (t && dist(enemy.x, enemy.y, t.x, t.y) <= t.range) return true;
  }

  // Silos: range scales with missileLauncher level (mirrors stepMissileSilos).
  if (derived.activeMissileSilos > 0) {
    const siloRange = MISSILE_SILO.rangeBase + state.upgrades.missileLauncher * MISSILE_SILO.rangePerLevel;
    for (const silo of state.missileSilos) {
      if (silo.active && dist(enemy.x, enemy.y, silo.x, silo.y) <= siloRange) return true;
    }
  }
  return false;
}

/**
 * 4.x — a short, plain-English "why is this worker doing that" reason for the
 * inspect popover, derived purely from agent locals the sim already maintains
 * (no sim change). Priority mirrors the sim's own dominance order: an offline /
 * fleeing state wins over a standing operator command, which wins over a passive
 * spook. Returns null when the worker is just doing ordinary work (its `task`
 * label already says what).
 */
export function describeWorkerReason(agent: Agent): string | null {
  if (agent.corrupted) return "void-infested";
  if (agent.disabledTicks > 0) return "disabled";
  if (agent.rebootTicks > 0) return "rebooting";
  if (agent.evadeTicks > 0) return "fleeing";
  if (agent.suggestedTarget?.kind === "home") return "returning home";
  if (agent.corruptingTicks > 0) return "under corruption";
  if (agent.suggestedTarget?.kind === "node") return "tasked by you";
  if (agent.spookedTicks > 0) return "avoiding a threat lane";
  return null;
}

/**
 * 4.4.2 / 4.5.0 — UI honesty predicate for the "tasked" lead line. A worker's node
 * order draws the solid cyan lead line ONLY when the sim is actually routing the
 * worker to it — i.e. `agent.target` equals the ordered node id AND the worker is
 * neither fleeing nor being lead-dragged. Under 4.5.0 firm-commit `agent.target`
 * stays pinned to the ordered node even while the worker is dodging (evade branch)
 * or being pulled by a press-and-hold lead, so a bare `target === suggested` check
 * would draw a cyan line to a node the worker is actively moving AWAY from. The
 * two extra reads keep the line honest:
 *   - `agent.evadeTicks <= 0` — not currently evading a threat;
 *   - `!leadActive` — no active `state.leadPoint` pulling this worker (the caller
 *     passes `Boolean(state.leadPoint)`).
 * During evade / lead-drag the renderer shows the amber pending ring (or nothing)
 * instead. Pure read of existing fields — no sim mutation, trace-neutral, and no
 * new persisted state.
 */
export function isSuggestionHonored(agent: Agent, leadActive = false): boolean {
  return (
    agent.suggestedTarget?.kind === "node" &&
    agent.suggestedTarget.id != null &&
    agent.target === Number(agent.suggestedTarget.id) &&
    agent.evadeTicks <= 0 &&
    !leadActive
  );
}
