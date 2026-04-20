import { PROGRESSION } from "@/game/balance";
import { EVENT_TICK } from "@/game/constants";
import { activateEvent, EVENT_DEFS } from "@/game/events/eventDefs";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";
import { pushLog } from "@/game/utils";

const BIG_EVENT_TICK_MIN = 30 * 30;
const BIG_EVENT_TICK_MAX = 90 * 30;
const LOST_DRONE_SCORE_THRESHOLD = 9 * PROGRESSION.tiersPerScore;

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

  const expiredEvents: GameState["activeEvents"] = [];
  for (const active of state.activeEvents) {
    active.ticksRemaining -= 1;
    if (active.ticksRemaining <= 0) {
      expiredEvents.push(active);
    }
  }

  for (const active of expiredEvents) {
    const eventDef = EVENT_DEFS.find((def) => def.id === active.id);
    if (active.revertOnExpire) {
      eventDef?.revert(state);
      state.log = pushLog(state.log, `${eventDef?.label ?? active.id} has ended.`, "event", state.timers.tick);
    }
    state.activeEvents = state.activeEvents.filter((event) => event.id !== active.id);
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

  if (
    !state.lostWorkerFound &&
    !state.lostDrone &&
    derived.progression.score >= LOST_DRONE_SCORE_THRESHOLD &&
    state.rng.chance(0.01)
  ) {
    const baseY = state.rng.range(220, 360);
    state.lostDrone = {
      x: -42,
      y: baseY,
      baseY,
      angle: 0,
      vx: 0.2 + state.rng.next() * 0.09,
      wobblePhase: state.rng.next() * Math.PI * 2,
      spawnTick: state.timers.tick,
    };
    state.log = pushLog(
      state.log,
      "Outer zone telemetry caught a damaged drone drifting through the haze.",
      "event",
      state.timers.tick
    );
  }
}
