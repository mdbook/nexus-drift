import { TICK_MS } from "@/game/constants";
import { ECONOMY } from "@/game/balance";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";
import { clamp, pushLog } from "@/game/utils";

export function stepEconomy(state: GameState) {
  const derived = computeDerived(state);

  (Object.keys(state.resources) as Array<keyof GameState["resources"]>).forEach((key) => {
    state.resources[key] += derived.rates[key] * (TICK_MS / 1000);
  });

  state.xp +=
    (ECONOMY.xpRate.base +
      state.upgrades.reactor * ECONOMY.xpRate.perReactor +
      state.prestige * ECONOMY.xpRate.perPrestige +
      state.upgrades.turret * ECONOMY.xpRate.perTurret +
      state.upgrades.scout * ECONOMY.xpRate.perScout) *
    (TICK_MS / 1000) *
    ECONOMY.xpRate.scale;

  while (state.xp >= ECONOMY.levelXpBase + state.level * ECONOMY.levelXpPerLevel) {
    state.xp -= ECONOMY.levelXpBase + state.level * ECONOMY.levelXpPerLevel;
    state.level += 1;
    state.combo = clamp(state.combo + ECONOMY.levelComboBonus, 1, ECONOMY.comboMax);
    state.log = pushLog(state.log, `Sector level up -> ${state.level}`);
  }
}
