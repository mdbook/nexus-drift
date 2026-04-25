import { PROGRESSION } from "@/game/balance";
import { unlockAchievement } from "@/game/achievements";
import { EVENT_DEFS } from "@/game/events/eventDefs";
import { tickNotifications } from "@/game/notifications";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";

export function stepAchievements(state: GameState) {
  // 3.2.2 — decrement visible notifications (achievements, enemy
  // discoveries, …). Decay runs before the unlock checks below so a
  // notification enqueued this same tick still gets a full-duration hold.
  tickNotifications(state);

  const derived = computeDerived(state);
  const threatRank = Math.floor(derived.progression.score / PROGRESSION.tiersPerScore);

  // ── Progression ─────────────────────────────────────────────────────────────
  if (state.prestige >= 1) unlockAchievement(state, "first_prestige");
  if (state.prestige >= 3) unlockAchievement(state, "prestige_3");
  if (state.prestige >= 5) unlockAchievement(state, "prestige_5");

  if (state.level >= 10) unlockAchievement(state, "level_10");
  if (state.level >= 20) unlockAchievement(state, "level_20");
  if (state.level >= 30) unlockAchievement(state, "level_30");
  if (state.level >= 50) unlockAchievement(state, "level_50");
  if (state.level >= 75) unlockAchievement(state, "level_75");

  if (threatRank >= 5) unlockAchievement(state, "tier_5");
  if (threatRank >= 8) unlockAchievement(state, "tier_8");
  if (threatRank >= 10) unlockAchievement(state, "tier_10");

  // All upgrade tracks have at least 1 level
  const upgradeValues = Object.values(state.upgrades);
  if (upgradeValues.every((v) => v >= 1)) unlockAchievement(state, "all_upgrades_1");
  if (upgradeValues.every((v) => v >= 5)) unlockAchievement(state, "all_upgrades_5");

  if (state.upgrades.foundry >= 10) unlockAchievement(state, "max_foundry");
  if (state.upgrades.archive >= 10) unlockAchievement(state, "max_archive");
  if (state.upgrades.turret >= 8) unlockAchievement(state, "turret_ace");

  if (state.resources.cores >= 1) unlockAchievement(state, "first_core");
  if (state.resources.cores >= 50) unlockAchievement(state, "cores_50");
  if (state.resources.flux >= 100) unlockAchievement(state, "flux_100");

  // ── Combat ───────────────────────────────────────────────────────────────────
  if (state.stats.totalEnemiesKilled >= 10) unlockAchievement(state, "kill_10_enemies");
  if (state.stats.totalEnemiesKilled >= 100) unlockAchievement(state, "kill_100_enemies");
  if (state.stats.totalEnemiesKilled >= 500) unlockAchievement(state, "kill_500_enemies");
  if (state.stats.totalEnemiesKilled >= 1000) unlockAchievement(state, "kill_1000_enemies");

  if (state.stats.brutesKilled >= 10) unlockAchievement(state, "kill_10_brutes");
  if (state.stats.brutesKilled >= 25) unlockAchievement(state, "kill_25_brutes");
  if (state.stats.phantomsKilled >= 5) unlockAchievement(state, "kill_phantoms_5");
  if (state.stats.leechesKilled >= 3) unlockAchievement(state, "kill_leeches_3");
  if (state.stats.sappersKilled >= 10) unlockAchievement(state, "kill_sappers_10");
  if (state.stats.sentinelKills >= 1) unlockAchievement(state, "first_sentinel_kill");

  // ── Corruption ───────────────────────────────────────────────────────────────
  if (state.stats.corruptedPurified >= 1) unlockAchievement(state, "purify_first");
  if (state.stats.wardensKilled >= 1) unlockAchievement(state, "warden_killed");
  if (state.stats.corruptedPurified >= 5) unlockAchievement(state, "quarantine");

  // Void Outbreak: 3+ workers simultaneously corrupted for 30 continuous seconds.
  // The running-ticks counter increments each tick the threshold is met, resets otherwise.
  if (derived.corruptedWorkers >= 3) {
    state.stats.corruptedWorkerOutbreakTicks += 1;
    if (state.stats.corruptedWorkerOutbreakTicks >= 900) unlockAchievement(state, "void_outbreak");
  } else {
    state.stats.corruptedWorkerOutbreakTicks = 0;
  }

  if (state.stats.purges >= 1) unlockAchievement(state, "first_purge");
  if (state.stats.purges >= 50) unlockAchievement(state, "purge_50");
  if (state.stats.purges >= 200) unlockAchievement(state, "purge_200");

  // Pristine: corruptors are on field but no nodes are fully corrupted
  const hasCorruptors = state.enemies.some((e) => e.role === "corruptor" && e.hp > 0);
  if (hasCorruptors && derived.corruptedNodes === 0) {
    unlockAchievement(state, "no_corruption");
  }

  // Rot Garden: 3+ fully corrupted nodes at once
  if (derived.corruptedNodes >= 3) unlockAchievement(state, "triple_rot");

  // Full Spectrum: all three non-gold node types corrupted simultaneously
  if (
    derived.corruptedByType.ore >= 1 &&
    derived.corruptedByType.gems >= 1 &&
    derived.corruptedByType.energy >= 1
  ) {
    unlockAchievement(state, "all_rot_types");
  }

  // ── Mining ────────────────────────────────────────────────────────────────────
  if (state.stats.crits >= 1) unlockAchievement(state, "first_crit");
  if (state.stats.crits >= 25) unlockAchievement(state, "crits_25");
  if (state.stats.crits >= 100) unlockAchievement(state, "crits_100");

  if (state.stats.mined >= 1000) unlockAchievement(state, "mined_1000");
  if (state.stats.mined >= 10000) unlockAchievement(state, "mined_10000");

  if (state.resources.gold >= 5000) unlockAchievement(state, "gold_hoarder");
  if (state.resources.gems >= 200) unlockAchievement(state, "gem_collector");

  // ── Survival ──────────────────────────────────────────────────────────────────
  if (state.stats.runtimeMs >= 15 * 60_000) unlockAchievement(state, "survived_15m");
  if (state.stats.runtimeMs >= 30 * 60_000) unlockAchievement(state, "survived_30m");
  if (state.stats.runtimeMs >= 60 * 60_000) unlockAchievement(state, "long_watch");
  if (state.stats.runtimeMs >= 120 * 60_000) unlockAchievement(state, "long_watch_2h");
  if (state.stats.runtimeMs >= 240 * 60_000) unlockAchievement(state, "survived_4h");
  if (state.stats.runtimeMs >= 480 * 60_000) unlockAchievement(state, "survived_8h");
  if (state.stats.runtimeMs >= 1440 * 60_000) unlockAchievement(state, "survived_24h");

  // Equilibrium: 95%+ colony health while under hostile pressure
  if (derived.hostilePressure && derived.colonyHealth >= 95) {
    unlockAchievement(state, "stable_colony");
  }

  // Immaculate Grid: every active worker is fully repaired while hostiles are present.
  const activeAgents = state.agents.filter((agent) => agent.active);
  if (
    derived.hostilePressure &&
    activeAgents.length > 0 &&
    activeAgents.every((agent) => agent.hp >= agent.maxHp)
  ) {
    unlockAchievement(state, "full_health");
  }

  // ── Secret ────────────────────────────────────────────────────────────────────
  if (state.stats.eventsExperienced.length >= EVENT_DEFS.length) unlockAchievement(state, "all_events");
  if (state.stats.eventTagsInspected.length >= EVENT_DEFS.length) unlockAchievement(state, "field_report");
  if (state.stats.touristPassesClicked >= 3) unlockAchievement(state, "tour_guide");
  if (state.stats.touristClicks >= 50) unlockAchievement(state, "tourist_clicks_50");

  // Lost Drone: the lostWorkerFound flag (easter egg drone from outer zone)
  if (state.lostWorkerFound) unlockAchievement(state, "lost_drone");

  // ── Veteran rank updates ──────────────────────────────────────────────────────
  state.agents.forEach((agent) => {
    const kills = agent.killsNearby ?? 0;
    agent.veteranRank = kills >= 50 ? 3 : kills >= 20 ? 2 : kills >= 5 ? 1 : 0;
  });
}
