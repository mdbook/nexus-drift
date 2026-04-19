import { spawnEnemy } from "@/game/factories";
import type { GameState } from "@/game/types";
import { dist, pushLog } from "@/game/utils";

export type EventDef = {
  id: string;
  label: string;
  description: string;
  durationTicks: number;
  weight: number;
  minTier: number;
  apply: (state: GameState) => void;
  revert: (state: GameState) => void;
};

const TICKS_PER_SEC = 30;
const HOME_X = 500;
const HOME_Y = 540;

function spawnTemporaryCacheNode(state: GameState) {
  let x = state.rng.range(100, 900);
  let y = state.rng.range(100, 450);
  let attempts = 0;

  while (attempts < 24 && dist(x, y, HOME_X, HOME_Y) < 160) {
    x = state.rng.range(100, 900);
    y = state.rng.range(100, 450);
    attempts += 1;
  }

  state.nodes.push({
    id: state.nextNodeId++,
    kind: "gems",
    x,
    y,
    hp: 80,
    maxHp: 80,
    size: 14,
    corruption: 0,
    corrupted: false,
    corruptedBy: null,
    pulse: 0,
    temporary: true,
    despawnAt: state.timers.tick + 180 * TICKS_PER_SEC,
  });
}

export const EVENT_DEFS: EventDef[] = [
  {
    id: "meteor_shower",
    label: "Meteor Shower",
    description: "Node yields boosted x1.6 for 60s.",
    durationTicks: 60 * TICKS_PER_SEC,
    weight: 1,
    minTier: 0,
    apply: (state) => {
      state.eventModifiers = { ...state.eventModifiers, yieldMultiplier: 1.6 };
    },
    revert: (state) => {
      state.eventModifiers = { ...state.eventModifiers, yieldMultiplier: 1 };
    },
  },
  {
    id: "solar_flare",
    label: "Solar Flare",
    description: "Energy x2 but turret cooldowns +20% for 45s.",
    durationTicks: 45 * TICKS_PER_SEC,
    weight: 0.9,
    minTier: 1,
    apply: (state) => {
      state.eventModifiers = {
        ...state.eventModifiers,
        energyRate: 2,
        turretCooldownScale: 1.2,
      };
    },
    revert: (state) => {
      state.eventModifiers = {
        ...state.eventModifiers,
        energyRate: 1,
        turretCooldownScale: 1,
      };
    },
  },
  {
    id: "cache_discovery",
    label: "Cache Discovery",
    description: "A bonus high-yield node appeared.",
    durationTicks: 0,
    weight: 0.8,
    minTier: 0,
    apply: (state) => {
      spawnTemporaryCacheNode(state);
    },
    revert: () => {},
  },
  {
    id: "pirate_caravan",
    label: "Pirate Caravan",
    description: "Off-schedule raider wave with bonus loot.",
    durationTicks: 0,
    weight: 0.7,
    minTier: 2,
    apply: (state) => {
      const count = 3 + Math.floor(state.rng.next() * 3);
      for (let i = 0; i < count; i += 1) {
        const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, "raider");
        enemy.goldRewardBonus = 2;
        state.enemies.push(enemy);
      }
      state.log = pushLog(state.log, "Pirate caravan inbound - raiders carrying bonus loot.");
    },
    revert: () => {},
  },
  {
    id: "xeno_bloom",
    label: "Xeno Bloom",
    description: "Corruption spreads faster while purge yields are amplified for 90s.",
    durationTicks: 90 * TICKS_PER_SEC,
    weight: 0.6,
    minTier: 3,
    apply: (state) => {
      state.eventModifiers = {
        ...state.eventModifiers,
        corruptionRate: 1.5,
        fluxPurgeMultiplier: 3,
      };
    },
    revert: (state) => {
      state.eventModifiers = {
        ...state.eventModifiers,
        corruptionRate: 1,
        fluxPurgeMultiplier: 1,
      };
    },
  },
  {
    id: "dust_storm",
    label: "Dust Storm",
    description: "Turret range -25%, enemy speed -20% for 60s.",
    durationTicks: 60 * TICKS_PER_SEC,
    weight: 0.7,
    minTier: 2,
    apply: (state) => {
      state.eventModifiers = {
        ...state.eventModifiers,
        turretRangeScale: 0.75,
        enemySpeedScale: 0.8,
      };
    },
    revert: (state) => {
      state.eventModifiers = {
        ...state.eventModifiers,
        turretRangeScale: 1,
        enemySpeedScale: 1,
      };
    },
  },
  {
    id: "echo_signal",
    label: "Echo Signal",
    description: "An elite signal emerges from the noise.",
    durationTicks: 0,
    weight: 0.2,
    minTier: 5,
    apply: (state) => {
      const elite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "brute");
      elite.hp *= 2;
      elite.maxHp = elite.hp;
      elite.coreDropOverride = 5;
      state.enemies.push(elite);
      state.log = pushLog(state.log, "Echo Signal: elite signature detected on approach.");
    },
    revert: () => {},
  },
];

export function activateEvent(state: GameState, eventDef: EventDef, announce = true) {
  const activeIndex = state.activeEvents.findIndex((event) => event.id === eventDef.id);

  if (activeIndex >= 0) {
    eventDef.revert(state);
    state.activeEvents.splice(activeIndex, 1);
  }

  eventDef.apply(state);

  if (announce) {
    state.log = pushLog(state.log, `Event: ${eventDef.label} - ${eventDef.description}`);
  }

  if (eventDef.durationTicks > 0) {
    state.activeEvents.push({
      id: eventDef.id,
      label: eventDef.label,
      ticksRemaining: eventDef.durationTicks,
    });
  }
}
