import { PRIORITY_MARK } from "@/game/balance";
import type { GameState } from "@/game/types";
import { dist, elapsedTicks } from "@/game/utils";

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
 * a unit that AI is actively keeping alive. Returns true when a worker was nudged.
 */
export function suggestWorkerToNode(
  state: GameState,
  nodeId: number,
  clickXY?: { x: number; y: number }
): boolean {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return false;

  const anchor = clickXY ?? { x: node.x, y: node.y };
  let best: GameState["agents"][number] | null = null;
  let bestDist = Infinity;
  for (const agent of state.agents) {
    if (!agent.active || agent.hp <= 0 || agent.corrupted) continue;
    if (agent.rebootTicks > 0 || agent.disabledTicks > 0) continue;
    if (agent.evadeTicks > 0) continue; // don't override an actively-fleeing worker
    const d = dist(anchor.x, anchor.y, agent.x, agent.y);
    if (d < bestDist) {
      bestDist = d;
      best = agent;
    }
  }
  if (!best) return false;

  best.suggestedTarget = {
    kind: "node",
    id: String(nodeId),
    createdAt: state.timers.tick,
  };
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

  agent.suggestedTarget = { kind: "home", createdAt: state.timers.tick };
  agent.target = null;
  return true;
}

/** True when this enemy carries an unexpired player defense-priority mark. */
export function isPriorityMarked(state: GameState, enemyId: number): boolean {
  return state.priorityMarks.some(
    (mark) =>
      mark.enemyId === enemyId && elapsedTicks(state.timers.tick, mark.createdAt) < PRIORITY_MARK.expiryTicks
  );
}
