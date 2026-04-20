import { EVENT_TICK } from "@/game/constants";
import { activateEvent, EVENT_DEFS } from "@/game/events/eventDefs";
import { makeWorker } from "@/game/factories";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";
import { pushLog } from "@/game/utils";

const BIG_EVENT_TICK_MIN = 30 * 30;
const BIG_EVENT_TICK_MAX = 90 * 30;

function rollBigEventInterval(state: GameState) {
  return Math.floor(BIG_EVENT_TICK_MIN + state.rng.next() * (BIG_EVENT_TICK_MAX - BIG_EVENT_TICK_MIN));
}

function getNightFactor(runtimeMs: number) {
  const cycleMs = 30 * 60_000;
  const dayPhase = (runtimeMs % cycleMs) / cycleMs;
  return Math.sin(dayPhase * Math.PI * 2) * 0.5 + 0.5;
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

  state.log = pushLog(state.log, state.rng.pick(ambientMessages), "ambient", state.timers.tick);
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
    state.log = pushLog(state.log, `${eventDef?.label ?? id} has ended.`, "event", state.timers.tick);
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

  const isNight = getNightFactor(state.stats.runtimeMs) < 0.5;
  const adjustedWeight = (id: string, weight: number) => {
    if (isNight && (id === "xeno_bloom" || id === "dust_storm" || id === "null_surge")) return weight * 2.0;
    if (isNight && id === "core_breach") return weight * 1.4;
    return weight;
  };
  const totalWeight = eligible.reduce((sum, def) => sum + adjustedWeight(def.id, def.weight), 0);
  let threshold = state.rng.next() * totalWeight;
  let chosen = eligible[eligible.length - 1];

  for (const eventDef of eligible) {
    threshold -= adjustedWeight(eventDef.id, eventDef.weight);
    if (threshold <= 0) {
      chosen = eventDef;
      break;
    }
  }

  activateEvent(state, chosen);
  state.stats.eventsExperienced = [...new Set([...state.stats.eventsExperienced, chosen.id])];

  if (!state.lostWorkerFound && derived.progression.tier >= 9 && state.rng.chance(0.01)) {
    state.lostWorkerFound = true;
    const lostWorker = makeWorker("drone", state.agents.length + 1, state.timers.tick);
    lostWorker.x = -30;
    lostWorker.y = 300;
    lostWorker.tx = lostWorker.homeX;
    lostWorker.ty = lostWorker.homeY;
    lostWorker.task = "Traversing";
    state.agents.push(lostWorker);
    state.log = pushLog(state.log, "A damaged drone emerged from the outer zone - folded into the roster.", "event", state.timers.tick);
  }
}
