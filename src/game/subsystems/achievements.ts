import { unlockAchievement } from "@/game/achievements";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";

export function stepAchievements(state: GameState) {
  const derived = computeDerived(state);

  if (state.prestige >= 1) unlockAchievement(state, "first_prestige");
  if (state.stats.totalEnemiesKilled >= 100) unlockAchievement(state, "kill_100_enemies");
  if (state.stats.brutesKilled >= 10) unlockAchievement(state, "kill_10_brutes");
  if (state.stats.eventsExperienced.length >= 7) unlockAchievement(state, "all_events");
  if (state.upgrades.foundry >= 10) unlockAchievement(state, "max_foundry");
  if (state.upgrades.archive >= 10) unlockAchievement(state, "max_archive");
  if (derived.progression.tier >= 5) unlockAchievement(state, "tier_5");
  if (derived.progression.tier >= 8) unlockAchievement(state, "tier_8");
  if (state.resources.cores >= 1) unlockAchievement(state, "first_core");
  if (state.stats.runtimeMs >= 3_600_000) unlockAchievement(state, "long_watch");

  if (
    state.touristWorker?.active &&
    state.touristWorker.x > 0 &&
    state.touristWorker.x < 1024
  ) {
    unlockAchievement(state, "tourist_spotted");
    state.touristWorker.spotted = true;
  }

  state.agents.forEach((agent) => {
    const kills = agent.killsNearby ?? 0;
    agent.veteranRank = kills >= 50 ? 3 : kills >= 20 ? 2 : kills >= 5 ? 1 : 0;
  });
}
