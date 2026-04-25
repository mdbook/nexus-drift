export const TICK_MS = 33;
export const WORLD_W = 1000;
export const WORLD_H = 620;
// 3.2.1: tightened from 40 → 20 so the live HUD shows only the recent moments.
// Archival categories (upgrade / event / achievement) are mirrored into
// state.archiveLog (capped at MAX_ARCHIVE_LOG) for long-form scroll-back.
export const MAX_LOG = 20;
export const MAX_ARCHIVE_LOG = 200;
export const ARCHIVE_LOG_CATEGORIES = ["upgrade", "event", "achievement"] as const;

export const EVADE_ENTER_RADIUS = 62;
export const EVADE_EXIT_RADIUS = 104;
// 2.4.2: trimmed so workers commit harder to resources and stop treating
// distant threats as immediate panic triggers. Multi-threat pressure still
// extends evasion via EVADE_BONUS_PER_THREAT.
export const EVADE_PERSIST_TICKS = 52;
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
