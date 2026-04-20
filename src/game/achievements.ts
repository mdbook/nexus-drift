import type { GameState } from "@/game/types";
import { pushLog } from "@/game/utils";

export type AchievementId =
  | "first_prestige"
  | "kill_100_enemies"
  | "kill_10_brutes"
  | "all_events"
  | "max_foundry"
  | "max_archive"
  | "tier_5"
  | "tier_8"
  | "long_watch"
  | "drift_heard"
  | "first_core"
  | "tourist_spotted";

export type AchievementDef = {
  id: AchievementId;
  label: string;
  description: string;
};

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: "first_prestige", label: "Clean Slate", description: "Complete your first prestige reset." },
  { id: "kill_100_enemies", label: "Century", description: "Destroy 100 enemies." },
  { id: "kill_10_brutes", label: "Heavy Lifting", description: "Destroy 10 Brutes." },
  { id: "all_events", label: "Strange Tides", description: "Experience all 7 random events." },
  { id: "max_foundry", label: "Overclock", description: "Reach Foundry level 10." },
  { id: "max_archive", label: "Deep Memory", description: "Reach Archive level 10." },
  { id: "tier_5", label: "Pressure Front", description: "Reach threat tier 5." },
  { id: "tier_8", label: "Siege Protocol", description: "Reach threat tier 8." },
  { id: "long_watch", label: "Long Watch", description: "Keep the colony alive for 1 hour." },
  { id: "drift_heard", label: "Residual Signal", description: "The drift remembers." },
  { id: "first_core", label: "Fragment Zero", description: "Recover your first Core fragment." },
  { id: "tourist_spotted", label: "Taking Notes", description: "Spot the tourist drone." },
];

export function unlockAchievement(state: GameState, id: AchievementId) {
  if (state.achievements[id]) return false;

  state.achievements[id] = true;
  const def = ACHIEVEMENT_DEFS.find((entry) => entry.id === id);
  if (def) {
    state.log = pushLog(state.log, `Achievement unlocked: ${def.label}`, "achievement", state.timers.tick);
  }
  return true;
}
