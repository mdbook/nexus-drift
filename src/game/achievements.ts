import type { GameState } from "@/game/types";
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
  | "lost_drone"
  | "synthwave"
  | "all_events"
  | "event_streak";

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

// ─── Definitions (44 total) ───────────────────────────────────────────────────

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
    id: "lost_drone",
    label: "Stray Signal",
    description: "A damaged drone emerged from the outer zone.",
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
    description: "Experience all 7 random events.",
    rarity: "uncommon",
    category: "secret",
  },
  {
    id: "event_streak",
    label: "Cascading Anomaly",
    description: "Have 3 or more events active simultaneously.",
    rarity: "legendary",
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

export function unlockSecretAchievement(state: GameState, trigger: SecretAchievementTrigger) {
  return unlockAchievement(state, trigger === "drift" ? "drift_heard" : "synthwave");
}
