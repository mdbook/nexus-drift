import type { EnemyKind, ProgressionDirector } from "@/game/types";
import { clamp } from "@/game/utils";

type ProgressionMetrics = {
  level: number;
  prestige: number;
  totalUpgrades: number;
  weightedUpgradeScore: number;
  totalIncome: number;
  defenseScore: number;
  threatScore: number;
  colonyHealth: number;
  combatThreats: number;
  corruptorCount: number;
  activeCorruptionNodes: number;
  activeTurrets: number;
  activeScouts: number;
  cityStage: number;
};

const THREAT_LABELS = ["Settling", "Probe", "Skirmish", "Raid", "Siege", "Cataclysm"] as const;

export const ENEMY_BUDGET_COST: Record<EnemyKind, number> = {
  mite: 1,
  wisp: 1.25,
  raider: 2.35,
  corruptor: 2.7,
};

export const ENEMY_CONTACT_DAMAGE: Record<EnemyKind, number> = {
  mite: 3.4,
  wisp: 2.6,
  raider: 6.8,
  corruptor: 0,
};

export function computeProgressionDirector(metrics: ProgressionMetrics): ProgressionDirector {
  const score =
    metrics.level * 1.35 +
    metrics.prestige * 8 +
    metrics.totalUpgrades * 0.95 +
    metrics.weightedUpgradeScore * 0.9 +
    metrics.cityStage * 3.5 +
    metrics.totalIncome * 0.035;

  const tier = Math.min(THREAT_LABELS.length - 1, Math.floor(score / 11));
  const powerBalance =
    metrics.defenseScore -
    (metrics.threatScore * 1.08 + metrics.activeCorruptionNodes * 0.75 + metrics.corruptorCount * 0.4);

  const pressure = Math.max(0, -powerBalance);
  const dominance = Math.max(0, powerBalance);
  const baselineInterval =
    232 - score * 3.4 - metrics.activeTurrets * 4 - metrics.activeScouts * 3 - metrics.prestige * 4;
  const recoveryPenalty =
    pressure * 8 +
    Math.max(0, 74 - metrics.colonyHealth) * 1.1 +
    Math.max(0, metrics.combatThreats - (metrics.activeTurrets + 2)) * 11 +
    Math.max(0, metrics.corruptorCount + metrics.activeCorruptionNodes - (metrics.activeScouts + 1)) * 9;
  const momentumBonus = dominance * 6 + Math.max(0, metrics.colonyHealth - 88) * 0.65;
  const nominalIntervalTicks = Math.round(clamp(baselineInterval - momentumBonus, 72, 260));
  const spawnIntervalTicks = Math.round(clamp(baselineInterval + recoveryPenalty - momentumBonus, 72, 260));

  const waveBudget = clamp(
    1.15 +
      score * 0.058 +
      tier * 0.33 +
      dominance * 0.11 -
      pressure * 0.07 +
      Math.max(0, metrics.activeTurrets + metrics.activeScouts - 2) * 0.08,
    1.1,
    7.2
  );

  const enemyCap = Math.round(
    clamp(6 + tier * 2.1 + metrics.level * 0.16 + metrics.activeTurrets + metrics.activeScouts, 6, 24)
  );

  return {
    score,
    tier,
    label: THREAT_LABELS[tier],
    spawnIntervalTicks,
    waveBudget,
    enemyCap,
    recoveryMode: spawnIntervalTicks > nominalIntervalTicks + 16,
    powerBalance,
  };
}

export function getCombatEnemyWeights(director: ProgressionDirector) {
  const dominance = Math.max(0, director.powerBalance);
  const pressure = Math.max(0, -director.powerBalance);

  return {
    mite: clamp(2.2 - director.tier * 0.26 + pressure * 0.08, 0.45, 2.4),
    wisp:
      director.tier >= 1
        ? clamp(0.6 + director.tier * 0.32 + dominance * 0.08 - pressure * 0.02, 0.35, 3.2)
        : 0,
    raider:
      director.tier >= 2
        ? clamp(0.28 + (director.tier - 1) * 0.36 + dominance * 0.12 - pressure * 0.1, 0.15, 2.8)
        : 0,
  };
}

export function getCorruptorSpawnChance(
  director: ProgressionDirector,
  activeCorruptionNodes: number,
  existingCorruptors: number,
  corruptibleNodeCount: number
) {
  if (director.tier < 2 || corruptibleNodeCount <= 0) return 0;

  const pressure = Math.max(0, -director.powerBalance);
  const dominance = Math.max(0, director.powerBalance);
  const cap = director.tier >= 4 ? 3 : director.tier >= 2 ? 2 : 1;
  if (existingCorruptors >= cap) return 0;

  return clamp(
    0.05 +
      (director.tier - 1) * 0.07 +
      activeCorruptionNodes * 0.06 +
      dominance * 0.02 -
      pressure * 0.03,
    0.04,
    0.6
  );
}

export function getEnemyWavePower(level: number, prestige: number, director: ProgressionDirector) {
  return level / 3 + prestige * 1.5 + director.tier * 0.65 + Math.max(0, director.powerBalance) * 0.18;
}
