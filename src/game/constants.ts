export const TICK_MS = 33;
export const WORLD_W = 1000;
export const WORLD_H = 620;
export const MAX_LOG = 6;

export const EVADE_ENTER_RADIUS = 92;
export const EVADE_EXIT_RADIUS = 150;
export const EVADE_PERSIST_TICKS = 48;
export const EVADE_BONUS_PER_THREAT = 10;

export const MINING_TICK = 21;
export const COMBAT_TICK = 12;
export const AUTO_TICK = 39;
export const EVENT_TICK = 145;
export const TICK_WRAP = 10_000_000;

export const CORRUPTIBLE_KINDS = ["ore", "gems", "energy"] as const;

export const WORK_TASKS = {
  miner: "Mining",
  runner: "Collecting",
  drone: "Syncing",
} as const;

export const WORKER_KIND_PREFERENCES = {
  miner: ["gold", "ore", "ore", "gold"],
  runner: ["ore", "energy", "gold", "gems"],
  drone: ["gems", "energy", "ore", "energy"],
} as const;

