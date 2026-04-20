import { ZAPPER } from "@/game/balance";
import type { GameState } from "@/game/types";

export function stepProjectiles(state: GameState) {
  const next = state.projectiles.map((p) => ({ ...p, life: p.life - 1 }));

  for (const p of next) {
    if (p.life > 0 || p.tag !== "zapper-bolt" || p.targetId === undefined) continue;
    if (p.targetKind === "agent") {
      const agent = state.agents.find((a) => a.id === p.targetId);
      if (agent) {
        agent.disabledTicks = ZAPPER.disableDurationTicks;
        agent.task = "Disabled";
      }
    } else if (p.targetKind === "turret") {
      const turret = state.turrets.find((t) => t.id === p.targetId);
      if (turret) turret.disabledTicks = ZAPPER.disableDurationTicks;
    }
  }

  state.projectiles = next.filter((p) => p.life > 0);
}
