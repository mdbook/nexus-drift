import { makeWorker } from "@/game/factories";
import { EVENT_DEFS } from "@/game/events/eventDefs";
import type { EventId, GameState } from "@/game/types";
import { pushLog } from "@/game/utils";

// ─── Rarity & Category ────────────────────────────────────────────────────────

export type AchievementRarity = "common" | "uncommon" | "rare" | "legendary";
export type AchievementCategory =
  | "combat"
  | "corruption"
  | "mining"
  | "progression"
  | "survival"
  | "secret";

// ─── IDs ──────────────────────────────────────────────────────────────────────

export type AchievementId =
  // Progression
  | "first_prestige"
  | "prestige_3"
  | "prestige_5"
  | "level_10"
  | "level_20"
  | "level_30"
  | "tier_5"
  | "tier_8"
  | "tier_10"
  | "all_upgrades_1"
  | "all_upgrades_5"
  | "max_foundry"
  | "max_archive"
  | "first_core"
  | "cores_50"
  | "flux_100"
  // Combat
  | "kill_10_enemies"
  | "kill_100_enemies"
  | "kill_500_enemies"
  | "kill_1000_enemies"
  | "kill_10_brutes"
  | "kill_25_brutes"
  | "kill_phantoms_5"
  | "kill_leeches_3"
  | "kill_sappers_10"
  | "first_sentinel_kill"
  | "turret_ace"
  // Corruption
  | "first_purge"
  | "purge_50"
  | "purge_200"
  | "no_corruption"
  | "triple_rot"
  | "all_rot_types"
  // Mining
  | "first_crit"
  | "crits_25"
  | "crits_100"
  | "mined_1000"
  | "mined_10000"
  | "gold_hoarder"
  | "gem_collector"
  // Survival
  | "survived_15m"
  | "survived_30m"
  | "long_watch"
  | "long_watch_2h"
  | "stable_colony"
  | "full_health"
  // Secret
  | "drift_heard"
  | "tourist_spotted"
  | "tour_guide"
  | "tourist_clicks_50"
  | "lost_drone"
  | "synthwave"
  | "all_events"
  | "event_streak"
  | "field_report"
  | "stormwatch"
  | "last_look"
  | "signal_trace"
  | "warhead_whisperer"
  | "archivist"
  | "release_reader"
  | "manual_override";

// ─── Def ─────────────────────────────────────────────────────────────────────

export type AchievementDef = {
  id: AchievementId;
  label: string;
  description: string;
  rarity: AchievementRarity;
  category: AchievementCategory;
  /** Hidden achievements show ??? label until unlocked */
  hidden?: boolean;
};

export type SecretAchievementTrigger = "drift" | "synthwave";

const EVENT_IDS = EVENT_DEFS.map((def) => def.id);

// ─── Definitions (54 total) ───────────────────────────────────────────────────

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // ── Progression ─────────────────────────────────────────────────────────────
  {
    id: "first_prestige",
    label: "Clean Slate",
    description: "Complete your first prestige reset.",
    rarity: "uncommon",
    category: "progression",
  },
  {
    id: "prestige_3",
    label: "Three Lifetimes",
    description: "Reach prestige 3.",
    rarity: "rare",
    category: "progression",
  },
  {
    id: "prestige_5",
    label: "Endless Loop",
    description: "Reach prestige 5.",
    rarity: "legendary",
    category: "progression",
  },
  {
    id: "level_10",
    label: "First Decade",
    description: "Reach sector level 10.",
    rarity: "common",
    category: "progression",
  },
  {
    id: "level_20",
    label: "Seasoned Director",
    description: "Reach sector level 20.",
    rarity: "uncommon",
    category: "progression",
  },
  {
    id: "level_30",
    label: "Ancient Protocol",
    description: "Reach sector level 30.",
    rarity: "rare",
    category: "progression",
  },
  {
    id: "tier_5",
    label: "Pressure Front",
    description: "Reach threat tier 5.",
    rarity: "common",
    category: "progression",
  },
  {
    id: "tier_8",
    label: "Siege Protocol",
    description: "Reach threat tier 8.",
    rarity: "uncommon",
    category: "progression",
  },
  {
    id: "tier_10",
    label: "Apex Threat",
    description: "Reach threat tier 10.",
    rarity: "rare",
    category: "progression",
  },
  {
    id: "all_upgrades_1",
    label: "Diversified",
    description: "Unlock at least one level in every upgrade track.",
    rarity: "uncommon",
    category: "progression",
  },
  {
    id: "all_upgrades_5",
    label: "Full Doctrine",
    description: "Reach level 5 in every upgrade track.",
    rarity: "rare",
    category: "progression",
  },
  {
    id: "max_foundry",
    label: "Overclock",
    description: "Reach Foundry level 10.",
    rarity: "rare",
    category: "progression",
  },
  {
    id: "max_archive",
    label: "Deep Memory",
    description: "Reach Archive level 10.",
    rarity: "rare",
    category: "progression",
  },
  {
    id: "first_core",
    label: "Fragment Zero",
    description: "Recover your first Core fragment.",
    rarity: "common",
    category: "progression",
  },
  {
    id: "cores_50",
    label: "Core Hoard",
    description: "Accumulate 50 Cores.",
    rarity: "uncommon",
    category: "progression",
  },
  {
    id: "flux_100",
    label: "Resonant",
    description: "Accumulate 100 Flux.",
    rarity: "common",
    category: "corruption",
  },

  // ── Combat ───────────────────────────────────────────────────────────────────
  {
    id: "kill_10_enemies",
    label: "First Blood",
    description: "Destroy 10 enemies.",
    rarity: "common",
    category: "combat",
  },
  {
    id: "kill_100_enemies",
    label: "Century",
    description: "Destroy 100 enemies.",
    rarity: "common",
    category: "combat",
  },
  {
    id: "kill_500_enemies",
    label: "Veteran Grid",
    description: "Destroy 500 enemies.",
    rarity: "uncommon",
    category: "combat",
  },
  {
    id: "kill_1000_enemies",
    label: "Extinction Protocol",
    description: "Destroy 1,000 enemies.",
    rarity: "rare",
    category: "combat",
  },
  {
    id: "kill_10_brutes",
    label: "Heavy Lifting",
    description: "Destroy 10 Brutes.",
    rarity: "uncommon",
    category: "combat",
  },
  {
    id: "kill_25_brutes",
    label: "Titan Slayer",
    description: "Destroy 25 Brutes.",
    rarity: "rare",
    category: "combat",
  },
  {
    id: "kill_phantoms_5",
    label: "Ghost Protocol",
    description: "Destroy 5 Phantoms.",
    rarity: "uncommon",
    category: "combat",
  },
  {
    id: "kill_leeches_3",
    label: "Cutoff",
    description: "Destroy 3 Leeches before they drain the treasury.",
    rarity: "uncommon",
    category: "combat",
  },
  {
    id: "kill_sappers_10",
    label: "Defused",
    description: "Destroy 10 Sappers.",
    rarity: "uncommon",
    category: "combat",
  },
  {
    id: "first_sentinel_kill",
    label: "Iron Fist",
    description: "Record your first Sentinel kill.",
    rarity: "uncommon",
    category: "combat",
  },
  {
    id: "turret_ace",
    label: "Turret Ace",
    description: "Reach turret upgrade level 8.",
    rarity: "uncommon",
    category: "combat",
  },

  // ── Corruption ───────────────────────────────────────────────────────────────
  {
    id: "first_purge",
    label: "Clean Break",
    description: "Purge your first corrupted node.",
    rarity: "common",
    category: "corruption",
  },
  {
    id: "purge_50",
    label: "Purge Wing",
    description: "Complete 50 node purges.",
    rarity: "uncommon",
    category: "corruption",
  },
  {
    id: "purge_200",
    label: "Bleach Protocol",
    description: "Complete 200 node purges.",
    rarity: "rare",
    category: "corruption",
  },
  {
    id: "no_corruption",
    label: "Pristine",
    description: "Have no corrupted nodes while any corruptor is alive.",
    rarity: "rare",
    category: "corruption",
  },
  {
    id: "triple_rot",
    label: "Rot Garden",
    description: "Have 3 or more nodes fully corrupted at once.",
    rarity: "uncommon",
    category: "corruption",
  },
  {
    id: "all_rot_types",
    label: "Full Spectrum",
    description: "Have ore, gem, and energy nodes corrupted at the same time.",
    rarity: "rare",
    category: "corruption",
  },

  // ── Mining ────────────────────────────────────────────────────────────────────
  {
    id: "first_crit",
    label: "Lucky Strike",
    description: "Land your first critical haul.",
    rarity: "common",
    category: "mining",
  },
  {
    id: "crits_25",
    label: "Hot Seam",
    description: "Land 25 critical hauls.",
    rarity: "common",
    category: "mining",
  },
  {
    id: "crits_100",
    label: "Jackpot",
    description: "Land 100 critical hauls.",
    rarity: "uncommon",
    category: "mining",
  },
  {
    id: "mined_1000",
    label: "Good Yield",
    description: "Mine 1,000 total resources.",
    rarity: "common",
    category: "mining",
  },
  {
    id: "mined_10000",
    label: "Industrial Scale",
    description: "Mine 10,000 total resources.",
    rarity: "uncommon",
    category: "mining",
  },
  {
    id: "gold_hoarder",
    label: "Treasury",
    description: "Accumulate 5,000 gold at once.",
    rarity: "uncommon",
    category: "mining",
  },
  {
    id: "gem_collector",
    label: "Crystalline",
    description: "Accumulate 200 gems at once.",
    rarity: "uncommon",
    category: "mining",
  },

  // ── Survival ──────────────────────────────────────────────────────────────────
  {
    id: "survived_15m",
    label: "Holding Pattern",
    description: "Keep the colony alive for 15 minutes.",
    rarity: "common",
    category: "survival",
  },
  {
    id: "survived_30m",
    label: "Night Shift",
    description: "Keep the colony alive for 30 minutes.",
    rarity: "common",
    category: "survival",
  },
  {
    id: "long_watch",
    label: "Long Watch",
    description: "Keep the colony alive for 1 hour.",
    rarity: "uncommon",
    category: "survival",
  },
  {
    id: "long_watch_2h",
    label: "Vigil",
    description: "Keep the colony alive for 2 hours.",
    rarity: "rare",
    category: "survival",
  },
  {
    id: "stable_colony",
    label: "Equilibrium",
    description: "Reach 95% colony health while under hostile pressure.",
    rarity: "rare",
    category: "survival",
  },
  {
    id: "full_health",
    label: "Immaculate Grid",
    description: "Keep every active worker at full health while hostiles are on the field.",
    rarity: "uncommon",
    category: "survival",
  },

  // ── Secret ────────────────────────────────────────────────────────────────────
  {
    id: "drift_heard",
    label: "Residual Signal",
    description: "The drift remembers.",
    rarity: "rare",
    category: "secret",
    hidden: true,
  },
  {
    id: "tourist_spotted",
    label: "Taking Notes",
    description: "Spot the tourist drone on the field.",
    rarity: "rare",
    category: "secret",
    hidden: true,
  },
  {
    id: "tour_guide",
    label: "Tour Guide",
    description: "Click the tourist drone on 3 separate passes.",
    rarity: "uncommon",
    category: "secret",
    hidden: true,
  },
  {
    id: "tourist_clicks_50",
    label: "Public Curiosity",
    description: "Click the tourist drone 50 times in a run.",
    rarity: "legendary",
    category: "secret",
    hidden: true,
  },
  {
    id: "lost_drone",
    label: "Stray Signal",
    description: "Recover the damaged drone from the outer zone.",
    rarity: "rare",
    category: "secret",
    hidden: true,
  },
  {
    id: "synthwave",
    label: "Neon Protocol",
    description: "Engage the synthwave protocol.",
    rarity: "uncommon",
    category: "secret",
    hidden: true,
  },
  {
    id: "all_events",
    label: "Strange Tides",
    description: "Experience every current random event.",
    rarity: "uncommon",
    category: "secret",
  },
  {
    id: "event_streak",
    label: "Anomaly Witness",
    description: "Click the anomaly artifact while 3 event cards are active.",
    rarity: "legendary",
    category: "secret",
    hidden: true,
  },
  {
    id: "field_report",
    label: "Field Report",
    description: "Inspect every event card.",
    rarity: "uncommon",
    category: "secret",
  },
  {
    id: "stormwatch",
    label: "Stormwatch",
    description: "Inspect a Dust Storm or Solar Flare event card.",
    rarity: "common",
    category: "secret",
  },
  {
    id: "last_look",
    label: "Last Look",
    description: "Click an enemy during its fade-out.",
    rarity: "rare",
    category: "secret",
    hidden: true,
  },
  {
    id: "signal_trace",
    label: "Signal Trace",
    description: "Click a live zapper bolt.",
    rarity: "rare",
    category: "secret",
    hidden: true,
  },
  {
    id: "warhead_whisperer",
    label: "Warhead Whisperer",
    description: "Click an in-flight missile.",
    rarity: "legendary",
    category: "secret",
    hidden: true,
  },
  {
    id: "archivist",
    label: "Archivist",
    description: "Open the achievements archive after uncovering a hidden badge.",
    rarity: "common",
    category: "secret",
    hidden: true,
  },
  {
    id: "release_reader",
    label: "Patch Notes",
    description: "Open the release history from the version badge.",
    rarity: "common",
    category: "secret",
    hidden: true,
  },
  {
    id: "manual_override",
    label: "Manual Override",
    description: "Switch from 1x to 4x and back to 1x within the override window.",
    rarity: "uncommon",
    category: "secret",
    hidden: true,
  },
];

// ─── Unlock helper ────────────────────────────────────────────────────────────

export function unlockAchievement(state: GameState, id: AchievementId) {
  if (state.achievements[id]) return false;

  state.achievements[id] = true;
  const def = ACHIEVEMENT_DEFS.find((entry) => entry.id === id);
  if (def) {
    state.log = pushLog(
      state.log,
      `Achievement unlocked: ${def.label}`,
      "achievement",
      state.timers.tick
    );
  }
  return true;
}

export function spotTourist(state: GameState) {
  if (!state.touristWorker?.active) return false;

  const tourist = state.touristWorker;
  tourist.spotted = true;
  tourist.squishTicks = 9;
  state.stats.touristClicks += 1;

  if (tourist.lastClickedPassId !== tourist.passId) {
    tourist.lastClickedPassId = tourist.passId;
    state.stats.touristPassesClicked += 1;
  }

  let changed = unlockAchievement(state, "tourist_spotted");
  if (state.stats.touristPassesClicked >= 3) {
    changed = unlockAchievement(state, "tour_guide") || changed;
  }
  if (state.stats.touristClicks >= 50) {
    changed = unlockAchievement(state, "tourist_clicks_50") || changed;
  }
  return changed;
}

export function unlockSecretAchievement(state: GameState, trigger: SecretAchievementTrigger) {
  return unlockAchievement(state, trigger === "drift" ? "drift_heard" : "synthwave");
}

export function inspectEventTag(state: GameState, eventId: EventId) {
  if (!state.stats.eventTagsInspected.includes(eventId)) {
    state.stats.eventTagsInspected = [...state.stats.eventTagsInspected, eventId];
  }

  let changed = false;
  if (eventId === "dust_storm" || eventId === "solar_flare") {
    changed = unlockAchievement(state, "stormwatch") || changed;
  }
  if (state.stats.eventTagsInspected.length >= EVENT_IDS.length) {
    changed = unlockAchievement(state, "field_report") || changed;
  }
  return changed;
}

export function recoverLostDrone(state: GameState) {
  if (!state.lostDrone || state.lostWorkerFound) return false;

  const recovered = makeWorker("drone", state.agents.length + 1, state.timers.tick, 3, true);
  recovered.x = state.lostDrone.x;
  recovered.y = state.lostDrone.y;
  recovered.tx = recovered.homeX;
  recovered.ty = recovered.homeY;
  recovered.task = "Recovering";

  state.agents.push(recovered);
  state.lostDrone = null;
  state.lostWorkerFound = true;
  state.log = pushLog(state.log, "Recovered the damaged drone and folded it into the roster.", "event", state.timers.tick);
  return unlockAchievement(state, "lost_drone");
}

export function witnessAnomaly(state: GameState) {
  if (state.activeEvents.length < 3) return false;
  return unlockAchievement(state, "event_streak");
}

export function clickProjectile(state: GameState, projectileId: number) {
  const projectile = state.projectiles.find((candidate) => candidate.id === projectileId);
  if (!projectile || projectile.life <= 0) return false;

  if (projectile.tag === "zapper-bolt") {
    return unlockAchievement(state, "signal_trace");
  }
  if (projectile.tag === "turret-missile") {
    return unlockAchievement(state, "warhead_whisperer");
  }
  return false;
}

export function clickDyingEnemy(state: GameState, enemyId: number) {
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
  if (!enemy || enemy.hp > 0 || enemy.dyingTicks <= 0) return false;
  return unlockAchievement(state, "last_look");
}

export function recordAchievementsOpen(state: GameState) {
  const hiddenUnlocked = ACHIEVEMENT_DEFS.some((def) => def.hidden && state.achievements[def.id]);
  if (!hiddenUnlocked) return false;
  return unlockAchievement(state, "archivist");
}

export function recordChangelogOpen(state: GameState) {
  return unlockAchievement(state, "release_reader");
}

export function completeManualOverride(state: GameState) {
  return unlockAchievement(state, "manual_override");
}
