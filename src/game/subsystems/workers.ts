import { WORKER_SLOTS_BY_LEVEL, WORKER_SLOTS_BY_UPGRADE, WORKERS_AT_HOME } from "@/game/balance";
import type { GameState } from "@/game/types";

export function stepWorkerSlots(state: GameState) {
  const kinds = ["miner", "runner", "drone"] as const;
  for (const kind of kinds) {
    const upgradeLevel =
      kind === "miner" ? state.upgrades.miner : kind === "runner" ? state.upgrades.bot : state.upgrades.drill;
    const slots = WORKER_SLOTS_BY_UPGRADE[kind];
    const upgradeActiveCount = slots[Math.min(upgradeLevel, slots.length - 1)];
    const levelActiveCount = WORKER_SLOTS_BY_LEVEL[Math.min(state.level, WORKER_SLOTS_BY_LEVEL.length - 1)];
    const activeCount = Math.min(upgradeActiveCount, levelActiveCount);

    const kindAgents = state.agents.filter((a) => a.kind === kind);
    kindAgents.forEach((agent, slotIdx) => {
      const shouldBeActive = slotIdx < activeCount;
      if (!agent.active && shouldBeActive) {
        const home = WORKERS_AT_HOME[kind];
        const xOffset = (slotIdx - 1) * 28;
        agent.active = true;
        agent.x = home.x + xOffset;
        agent.y = home.y;
        agent.homeX = home.x + xOffset;
        agent.homeY = home.y;
        agent.tx = home.x + xOffset;
        agent.ty = home.y;
        agent.hp = agent.maxHp;
        agent.panic = 0;
        agent.evadeTicks = 0;
        agent.damageTicks = 0;
        agent.disabledTicks = 0;
        agent.target = null;
        agent.spawnTick = state.timers.tick;
        agent.task = "Deploying";
      }
    });
  }
}
