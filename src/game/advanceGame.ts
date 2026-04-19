import { TICK_WRAP } from "@/game/constants";
import { cloneGameState } from "@/game/factories";
import { stepAutobuy } from "@/game/subsystems/autobuy";
import { stepAchievements } from "@/game/subsystems/achievements";
import { stepCombat, resolveEnemyDeaths } from "@/game/subsystems/combat";
import { stepCorruption } from "@/game/subsystems/corruption";
import { stepEconomy } from "@/game/subsystems/economy";
import { stepEvents } from "@/game/subsystems/events";
import { stepMining } from "@/game/subsystems/mining";
import { stepEnemies, stepTourist, stepWorkers } from "@/game/subsystems/movement";
import { stepProjectiles } from "@/game/subsystems/projectiles";
import { stepScouts } from "@/game/subsystems/scouts";
import { stepSentinels } from "@/game/subsystems/sentinels";
import { stepSpawns } from "@/game/subsystems/spawns";
import { stepTurrets } from "@/game/subsystems/turrets";
import type { GameState } from "@/game/types";

export function advanceGame(prev: GameState): GameState {
  const state = cloneGameState(prev);
  state.timers.tick = (state.timers.tick + 1) % TICK_WRAP;
  state.timers.auto += 1;
  state.timers.event += 1;
  state.timers.enemy += 1;

  stepEconomy(state);
  stepSpawns(state);
  stepWorkers(state);
  stepTourist(state);
  stepEnemies(state);
  stepCorruption(state);
  stepTurrets(state);
  stepScouts(state);
  stepSentinels(state);
  resolveEnemyDeaths(state);
  stepCombat(state);
  resolveEnemyDeaths(state);
  stepMining(state);
  stepAutobuy(state);
  stepProjectiles(state);
  stepEvents(state);
  stepAchievements(state);

  return state;
}
