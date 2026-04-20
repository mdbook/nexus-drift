import { MINING_TICK } from "@/game/constants";
import { CORRUPTION, MINING } from "@/game/balance";
import { respawnNode } from "@/game/factories";
import type { GameState } from "@/game/types";
import { dist, pushLog } from "@/game/utils";

export function stepMining(state: GameState) {
  if (state.timers.tick % MINING_TICK !== 0) return;

  const exhaustedTemporaryNodes = new Set<number>();

  state.nodes.forEach((node) => {
    if (exhaustedTemporaryNodes.has(node.id)) return;

    const workers = state.agents.filter(
      (agent) =>
        agent.target === node.id &&
        dist(agent.x, agent.y, node.x, node.y) < Math.max(MINING.contactRadiusMin, node.size * MINING.contactRadiusRatio) &&
        agent.hp > MINING.workerActiveHpThreshold &&
        agent.evadeTicks <= 0
    ).length;

    if (!workers) {
      node.pulse = (node.pulse + 0.12) % (Math.PI * 2);
      return;
    }

    const damage =
      workers *
      (MINING.damageBase + state.upgrades.miner * MINING.damagePerMiner + state.upgrades.drill * MINING.damagePerDrill) *
      (node.corrupted ? MINING.corruptedDamagePenalty : 1);

    node.hp -= damage;

    if (node.hp <= 0) {
      const crit = state.rng.chance(MINING.critChanceBase + state.upgrades.bot * MINING.critChancePerBot);
      const baseAmount = MINING.yield[node.kind];
      const foundryBonus = 1 + state.upgrades.foundry * 0.12;
      const amount =
        baseAmount *
        foundryBonus *
        state.eventModifiers.yieldMultiplier *
        Math.max(CORRUPTION.yieldFloor, 1 - node.corruption / CORRUPTION.yieldDivisor);

      state.resources[node.kind] += amount * state.combo * (crit ? 2 : 1);
      state.stats.mined += amount;
      if (crit) {
        state.stats.crits += 1;
        state.log = pushLog(state.log, `Critical haul on ${node.kind} node.`, "mining", state.timers.tick);
      }

      if (node.temporary) {
        exhaustedTemporaryNodes.add(node.id);
      } else {
        Object.assign(node, respawnNode(state.rng, node.id, state.nodes, state.timers.tick));
      }
    } else {
      node.pulse = (node.pulse + 0.2 + node.corruption * 0.003) % (Math.PI * 2);
    }
  });

  if (exhaustedTemporaryNodes.size > 0) {
    state.nodes = state.nodes.filter((node) => !exhaustedTemporaryNodes.has(node.id));
  }
}
