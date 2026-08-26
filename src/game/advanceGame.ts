import { PRIORITY_MARK } from "@/game/balance";
import { TICK_WRAP } from "@/game/constants";
import { cloneGameState } from "@/game/factories";
import { elapsedTicks } from "@/game/utils";
import { stepAutobuy } from "@/game/subsystems/autobuy";
import { stepAchievements } from "@/game/subsystems/achievements";
import { stepCombat, stepZapperFire, resolveEnemyDeaths, tickDeathFades } from "@/game/subsystems/combat";
import { stepCorruption } from "@/game/subsystems/corruption";
import { stepCity, stepEconomy } from "@/game/subsystems/economy";
import { stepEvents } from "@/game/subsystems/events";
import { stepMining } from "@/game/subsystems/mining";
import { stepMissileSilos } from "@/game/subsystems/missileSilos";
import { stepEnemies, stepLostDrone, stepTourist, stepWorkers } from "@/game/subsystems/movement";
import { stepProjectiles } from "@/game/subsystems/projectiles";
import { stepScouts } from "@/game/subsystems/scouts";
import { stepSentinels } from "@/game/subsystems/sentinels";
import { stepSpawns, stepWardenSpawn } from "@/game/subsystems/spawns";
import { stepWorkerCorruption } from "@/game/subsystems/workerCorruption";
import { stepTurrets } from "@/game/subsystems/turrets";
import { stepWorkerSlots } from "@/game/subsystems/workers";
import { stepEnemyShields } from "@/game/subsystems/enemyShields";
import type { SimTraceCtx } from "@/game/trace";
import type { GameState } from "@/game/types";

// ponytail: `ctx` is the opt-in decision-trace sink (Phase 2). It is forwarded ONLY
// to the two steps that reach an instrumented fn — stepWorkers + stepAutobuy — and
// is undefined on the production path (useGameLoop passes nothing), so behavior is
// byte-identical when tracing is off.
export function advanceGame(prev: GameState, ctx?: SimTraceCtx): GameState {
  const state = cloneGameState(prev);
  state.timers.tick = (state.timers.tick + 1) % TICK_WRAP;
  state.timers.auto += 1;
  state.timers.event += 1;
  state.timers.enemy += 1;

  // Order is load-bearing. Changing it without understanding the data-flow between
  // subsystems will introduce one-frame lag or missed interactions.
  //
  // 1. Economy — income applied before anything spends or reacts to resources.
  // 2. Spawns — wave decisions read the timers set above; new enemies have no target
  //    yet so they won't act until the following tick.
  // 3. Workers / Tourist / Lost Drone / Enemies — movement resolves against the
  //    freshly spawned enemy list so targeting is consistent within the tick.
  // 4. Corruption — runs after movement so corruptors act on their new position.
  // 5. Turrets / Scouts / Sentinels — defence reads post-movement positions and queues
  //    damage via hp reduction + flash markers. Damage flows through damageEnemy()
  //    which drains the shield layer first and only hits HP once the shield is gone.
  // 5b. MissileSilos — after sentinels so all defence fires in the same window;
  //     before ZapperFire so silo shot + zapper bolt land on the same frame.
  // 5c. ZapperFire — after movement so zappers aim at current positions; before
  //     resolveEnemyDeaths so freshly killed zappers don't fire.
  // 5d. EnemyShields — regen step runs after all damage for this tick has been applied
  //     so a shield that reaches 0 this tick cannot also regen this tick.
  // 6. resolveEnemyDeaths (first pass) — removes turret/scout kills before stepCombat
  //    so workers don't target already-dead enemies.
  // 7. Combat — workers deal melee damage; a second resolveEnemyDeaths follows so
  //    enemies killed this tick don't persist into mining or autobuy.
  // 8. Mining — after combat so a node destroyed by an enemy this tick doesn't also
  //    yield resources.
  // 9. Autobuy — reads final resource totals after income + combat rewards.
  // 10. Projectiles — zapper-bolt disables resolve here after all game logic runs.
  // 10b. tickDeathFades — runs exactly once per tick after resolveEnemyDeaths
  //      may have started new fade countdowns. Split from resolveEnemyDeaths
  //      so the two resolve-calls above don't double-decrement dyingTicks.
  // 11. Events / Achievements — read final state so unlock conditions are accurate.

  stepEconomy(state);
  // 3.0.0: stepCity runs right after economy so the damage flash ticks down
  // and idle regen flows in. damageCity writes set lastHostileTick, so the
  // regen gate is computed against the tick advanced at the top of this fn.
  stepCity(state);
  stepWorkerSlots(state);
  stepSpawns(state);
  stepWardenSpawn(state);
  stepWorkers(state, ctx);
  stepTourist(state);
  stepLostDrone(state);
  stepEnemies(state);
  stepCorruption(state);
  stepWorkerCorruption(state);
  // 4.0 — drop expired defense-priority marks before defense scoring reads them.
  // Guarded so the neutrality path (no marks ever created headlessly) is a no-op.
  if (state.priorityMarks.length > 0) {
    state.priorityMarks = state.priorityMarks.filter(
      (mark) => elapsedTicks(state.timers.tick, mark.createdAt) < PRIORITY_MARK.expiryTicks
    );
  }
  stepTurrets(state);
  stepScouts(state);
  stepSentinels(state);
  stepMissileSilos(state);
  stepZapperFire(state);
  stepEnemyShields(state);
  resolveEnemyDeaths(state);
  stepCombat(state);
  resolveEnemyDeaths(state);
  stepMining(state);
  stepAutobuy(state, ctx);
  stepProjectiles(state);
  tickDeathFades(state);
  stepEvents(state);
  stepAchievements(state);

  return state;
}
