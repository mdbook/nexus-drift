import type { DerivedState, GameState } from "@/game/types";

export function computeDerived(state: GameState): DerivedState {
  const p = 1 + state.prestige * 0.12;
  const combatThreats = state.enemies.filter((enemy) => enemy.role !== "corruptor").length;
  const corruptorCount = state.enemies.filter((enemy) => enemy.role === "corruptor").length;
  const corruptedByType = { ore: 0, gems: 0, energy: 0 };

  state.nodes.forEach((node) => {
    if (node.corrupted && node.kind in corruptedByType) {
      corruptedByType[node.kind as keyof typeof corruptedByType] += 1;
    }
  });

  const threatPenalty = Math.max(0.6, 1 - combatThreats * 0.025 + state.upgrades.shield * 0.015);
  const corruptionPenalty = {
    ore: Math.max(0.25, 1 - corruptedByType.ore * 0.18),
    gems: Math.max(0.2, 1 - corruptedByType.gems * 0.22),
    energy: Math.max(0.2, 1 - corruptedByType.energy * 0.2),
  };

  const rates = {
    gold: (1 + state.upgrades.miner * 0.9 + state.upgrades.drill * 0.1) * p * threatPenalty,
    ore:
      (0.4 + state.upgrades.miner * 0.35 + state.upgrades.drill * 1.0) *
      p *
      threatPenalty *
      corruptionPenalty.ore,
    gems:
      (0.02 + state.upgrades.drill * 0.08 + state.upgrades.reactor * 0.02) *
      p *
      corruptionPenalty.gems,
    energy:
      (0.03 + state.upgrades.reactor * 0.25 + state.upgrades.shield * 0.04) *
      p *
      corruptionPenalty.energy,
  };

  const totalIncome = rates.gold + rates.ore * 2 + rates.gems * 18 + rates.energy * 12;
  const targetXp = 80 + state.level * 25;
  const defenseScore =
    state.upgrades.turret * 1.4 +
    state.upgrades.shield * 1.9 +
    state.upgrades.scout * 1.6 +
    state.upgrades.arsenal * 1.2;
  const threatScore =
    combatThreats + corruptorCount * 1.3 + corruptedByType.ore + corruptedByType.gems + corruptedByType.energy;
  const colonyHealth = state.agents.length
    ? state.agents.reduce((sum, agent) => sum + agent.hp, 0) / state.agents.length
    : 100;
  const corruptedNodes = state.nodes.filter((node) => node.corrupted).length;
  const activeTurrets = Math.max(1, Math.min(state.turrets.length, 1 + state.upgrades.turret));
  const activeScouts = Math.min(state.scouts.length, state.upgrades.scout);
  const hostilePressure = combatThreats >= 4 || colonyHealth < 72;
  const corruptionPressure = corruptorCount > 0 || corruptedNodes > 0;

  return {
    rates,
    totalIncome,
    targetXp,
    defenseScore,
    threatScore,
    colonyHealth,
    corruptedByType,
    corruptorCount,
    corruptedNodes,
    combatThreats,
    activeTurrets,
    activeScouts,
    hostilePressure,
    corruptionPressure,
  };
}

