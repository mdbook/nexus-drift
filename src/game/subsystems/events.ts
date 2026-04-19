import { EVENT_TICK } from "@/game/constants";
import { activateEvent, EVENT_DEFS } from "@/game/events/eventDefs";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";
import { pushLog } from "@/game/utils";

const BIG_EVENT_TICK_MIN = 30 * 30;
const BIG_EVENT_TICK_MAX = 90 * 30;

function rollBigEventInterval(state: GameState) {
  return Math.floor(BIG_EVENT_TICK_MIN + state.rng.next() * (BIG_EVENT_TICK_MAX - BIG_EVENT_TICK_MIN));
}

function stepAmbientMessages(state: GameState) {
  if (state.timers.event < EVENT_TICK) return;
  state.timers.event = 0;

  const derived = computeDerived(state);
  const ambientMessages = [
    "AI rerouted workers for better pathing.",
    "Bonus vein detected near lower ridge.",
    "Cache compression improved throughput.",
    "Support drone pretending to be useful.",
    "Energy bloom stabilized reactor output.",
    "Shield harmonics adjusted for worker safety.",
    "Scout wing reports purple sludge where it absolutely should not be.",
  ];

  if (derived.hostilePressure) {
    ambientMessages.push("Perimeter guns are cycling hot against the latest raiders.");
  } else {
    ambientMessages.push("Perimeter defense holding a lazy but confident posture.");
  }

  if (derived.corruptionPressure) {
    ambientMessages.push("Purge wing is tracing toxic residue over the outer nodes.");
  } else {
    ambientMessages.push("Corruption scan clean. For now.");
  }

  if (state.resources.gold > 2200) {
    ambientMessages.push("Treasury overflow routed into colony purchase heuristics.");
  }

  state.log = pushLog(state.log, state.rng.pick(ambientMessages));
}

export function stepEvents(state: GameState) {
  stepAmbientMessages(state);

  const expiredIds: string[] = [];
  for (const active of state.activeEvents) {
    active.ticksRemaining -= 1;
    if (active.ticksRemaining <= 0) {
      expiredIds.push(active.id);
    }
  }

  for (const id of expiredIds) {
    const eventDef = EVENT_DEFS.find((def) => def.id === id);
    eventDef?.revert(state);
    state.activeEvents = state.activeEvents.filter((event) => event.id !== id);
    state.log = pushLog(state.log, `${eventDef?.label ?? id} has ended.`);
  }

  state.nodes = state.nodes.filter((node) => {
    if (node.temporary && node.despawnAt !== undefined && state.timers.tick >= node.despawnAt) {
      return false;
    }
    return true;
  });

  state.timers.bigEvent += 1;
  if (state.timers.bigEvent < state.nextBigEventInterval) return;

  state.timers.bigEvent = 0;
  state.nextBigEventInterval = rollBigEventInterval(state);

  const derived = computeDerived(state);
  const activeIds = new Set(state.activeEvents.map((event) => event.id));
  const eligible = EVENT_DEFS.filter((def) => def.minTier <= derived.progression.tier && !activeIds.has(def.id));
  if (!eligible.length) return;

  const totalWeight = eligible.reduce((sum, def) => sum + def.weight, 0);
  let threshold = state.rng.next() * totalWeight;
  let chosen = eligible[eligible.length - 1];

  for (const eventDef of eligible) {
    threshold -= eventDef.weight;
    if (threshold <= 0) {
      chosen = eventDef;
      break;
    }
  }

  activateEvent(state, chosen);
}
