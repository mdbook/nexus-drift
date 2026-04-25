import { TICK_MS, TICK_WRAP } from "@/game/constants";
import { CITY_HP, ECONOMY, FLUX } from "@/game/balance";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";
import { clamp, dist, appendLog } from "@/game/utils";

const CITY_CENTER_X = 500;
const CITY_CENTER_Y = 540;

export function stepEconomy(state: GameState) {
  const derived = computeDerived(state);

  (Object.keys(state.resources) as Array<keyof GameState["resources"]>).forEach((key) => {
    state.resources[key] += derived.rates[key] * (TICK_MS / 1000);
  });

  let xpGain =
    (ECONOMY.xpRate.base +
      state.upgrades.reactor * ECONOMY.xpRate.perReactor +
      state.prestige * ECONOMY.xpRate.perPrestige +
      state.upgrades.turret * ECONOMY.xpRate.perTurret +
      state.upgrades.scout * ECONOMY.xpRate.perScout) *
    (TICK_MS / 1000) *
    ECONOMY.xpRate.scale;
  xpGain *= 1 + state.upgrades.archive * 0.08;
  state.xp += xpGain;

  if (state.resources.flux > FLUX.softCap) {
    state.resources.flux = Math.max(
      FLUX.softCap,
      state.resources.flux - (state.resources.flux - FLUX.softCap) * 0.002
    );
  }

  while (state.xp >= ECONOMY.levelXpBase + state.level * ECONOMY.levelXpPerLevel) {
    state.xp -= ECONOMY.levelXpBase + state.level * ECONOMY.levelXpPerLevel;
    state.level += 1;
    state.combo = clamp(state.combo + ECONOMY.levelComboBonus, 1, ECONOMY.comboMax);
    appendLog(state, `Sector level up -> ${state.level}`, "system");
  }
}

/**
 * 3.0.0 — city maintenance step.
 *
 * Ticks down the damage flash, refreshes `lastHostileTick` whenever any
 * combat enemy is inside `CITY_HP.hostileRadius` of the home district, and
 * regenerates HP toward maxHp when it has been quiet for at least
 * `CITY_HP.regenIdleTicks`. Damage itself is applied elsewhere via the
 * `damageCity` funnel in combat.ts.
 */
export function stepCity(state: GameState) {
  if (state.city.damageTicks > 0) state.city.damageTicks -= 1;

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.role !== "combat") continue;
    if (dist(enemy.x, enemy.y, CITY_CENTER_X, CITY_CENTER_Y) <= CITY_HP.hostileRadius) {
      state.city.lastHostileTick = state.timers.tick;
      break;
    }
  }

  // 3.1.0 — modulo-safe elapsed-tick delta. state.timers.tick wraps at
  // TICK_WRAP, so a naive subtract can go massively negative once the
  // counter rolls over, leaving the regen gate closed forever. We fold
  // back into [0, TICK_WRAP) before comparing to regenIdleTicks.
  const ticksSinceHostile = (state.timers.tick - state.city.lastHostileTick + TICK_WRAP) % TICK_WRAP;
  if (state.city.hp < state.city.maxHp && ticksSinceHostile >= CITY_HP.regenIdleTicks) {
    state.city.hp = Math.min(state.city.maxHp, state.city.hp + CITY_HP.regenPerTick);
  }
}
