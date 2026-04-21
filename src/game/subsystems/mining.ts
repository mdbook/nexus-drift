import { MINING_TICK } from "@/game/constants";
import { CORRUPTION, MINING, WORKER_ABILITIES } from "@/game/balance";
import { respawnNode } from "@/game/factories";
import type { GameState } from "@/game/types";
import { dist, pushLog } from "@/game/utils";

export function stepMining(state: GameState) {
  if (state.timers.tick % MINING_TICK !== 0) return;

  const exhaustedTemporaryNodes = new Set<number>();

  state.nodes.forEach((node) => {
    if (exhaustedTemporaryNodes.has(node.id)) return;

    const workingAgents = state.agents.filter(
      (agent) =>
        agent.active &&
        agent.target === node.id &&
        dist(agent.x, agent.y, node.x, node.y) < Math.max(MINING.contactRadiusMin, node.size * MINING.contactRadiusRatio) &&
        agent.hp > MINING.workerActiveHpThreshold &&
        agent.evadeTicks <= 0
    );
    const workers = workingAgents.length;

    if (!workers) {
      node.pulse = (node.pulse + 0.12) % (Math.PI * 2);
      return;
    }

    // AI progress-bias signal: nodes currently being mined accumulate workTicks
    // (capped). stepWorkers decays it each tick. Multiple mining ticks per
    // contact are fine — the cap prevents a single persistent miner from
    // overpowering the bonus.
    node.workTicks = Math.min(120, node.workTicks + workers * MINING_TICK);

    const damage =
      workers *
      (MINING.damageBase + state.upgrades.miner * MINING.damagePerMiner + state.upgrades.drill * MINING.damagePerDrill) *
      (node.corrupted ? MINING.corruptedDamagePenalty : 1);

    node.hp -= damage;

    if (node.hp <= 0) {
      // Miner overclock: any miner that has been continuously at this node
      // without damage for overclockThresholdTicks earns an extra crit chance.
      const overclockActive = workingAgents.some(
        (w) => w.kind === "miner" && w.overclockTicks >= WORKER_ABILITIES.overclockThresholdTicks
      );
      const crit = state.rng.chance(
        MINING.critChanceBase + state.upgrades.bot * MINING.critChancePerBot +
        (overclockActive ? WORKER_ABILITIES.overclockCritBonus : 0)
      );
      const baseAmount = MINING.yield[node.kind];
      // 3.0.0: foundry per-level yield multiplier cut from +12% to +5% so
      // late-game foundry stacking doesn't outrun the new slower curve.
      const foundryBonus = 1 + state.upgrades.foundry * 0.05;
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
