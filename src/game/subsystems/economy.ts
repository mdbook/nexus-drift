import { TICK_MS } from "@/game/constants";
import { ECONOMY, FLUX } from "@/game/balance";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";
import { clamp, pushLog } from "@/game/utils";

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
    state.log = pushLog(state.log, `Sector level up -> ${state.level}`, "system", state.timers.tick);
  }
}
