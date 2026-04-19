import { PROGRESSION } from "@/game/balance";
import type { ProgressionDirector } from "@/game/types";
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

export function computeProgressionDirector(metrics: ProgressionMetrics): ProgressionDirector {
  const score =
    metrics.level * PROGRESSION.scoreCoeffs.level +
    metrics.prestige * PROGRESSION.scoreCoeffs.prestige +
    metrics.totalUpgrades * PROGRESSION.scoreCoeffs.totalUpgrades +
    metrics.weightedUpgradeScore * PROGRESSION.scoreCoeffs.weightedUpgrade +
    metrics.cityStage * PROGRESSION.scoreCoeffs.cityStage +
    metrics.totalIncome * PROGRESSION.scoreCoeffs.totalIncome;

  const tier = Math.min(THREAT_LABELS.length - 1, Math.floor(score / PROGRESSION.tiersPerScore));
  const powerBalance =
    metrics.defenseScore -
    (metrics.threatScore * PROGRESSION.powerBalance.threatWeight + metrics.activeCorruptionNodes * PROGRESSION.powerBalance.corruptionNodeWeight + metrics.corruptorCount * PROGRESSION.powerBalance.corruptorWeight);

  const pressure = Math.max(0, -powerBalance);
  const dominance = Math.max(0, powerBalance);
  const baselineInterval =
    PROGRESSION.spawn.baselineInterval - score * PROGRESSION.spawn.intervalPerScore - metrics.activeTurrets * PROGRESSION.spawn.intervalPerTurret - metrics.activeScouts * PROGRESSION.spawn.intervalPerScout - metrics.prestige * PROGRESSION.spawn.intervalPerPrestige;
  const recoveryPenalty =
    pressure * PROGRESSION.spawn.recoveryPressureMultiplier +
    Math.max(0, PROGRESSION.spawn.recoveryColonyHealthRef - metrics.colonyHealth) * PROGRESSION.spawn.recoveryColonyHealthMultiplier +
    Math.max(0, metrics.combatThreats - (metrics.activeTurrets + 2)) * PROGRESSION.spawn.recoveryThreatSurplusMultiplier +
    Math.max(0, metrics.corruptorCount + metrics.activeCorruptionNodes - (metrics.activeScouts + 1)) * PROGRESSION.spawn.recoveryCorruptionSurplusMultiplier;
  const momentumBonus = dominance * PROGRESSION.spawn.momentumDominanceBonus + Math.max(0, metrics.colonyHealth - PROGRESSION.spawn.momentumHealthRef) * PROGRESSION.spawn.momentumHealthBonus;
  const nominalIntervalTicks = Math.round(clamp(baselineInterval - momentumBonus, PROGRESSION.spawn.intervalMin, PROGRESSION.spawn.intervalMax));
  const spawnIntervalTicks = Math.round(clamp(baselineInterval + recoveryPenalty - momentumBonus, PROGRESSION.spawn.intervalMin, PROGRESSION.spawn.intervalMax));

  const waveBudget = clamp(
    PROGRESSION.wave.budgetBase +
      score * PROGRESSION.wave.budgetPerScore +
      tier * PROGRESSION.wave.budgetPerTier +
      dominance * PROGRESSION.wave.budgetPerDominance +
      pressure * PROGRESSION.wave.budgetPerPressure +
      Math.max(0, metrics.activeTurrets + metrics.activeScouts - 2) * PROGRESSION.wave.budgetPerExtraDefender,
    PROGRESSION.wave.budgetMin,
    PROGRESSION.wave.budgetMax
  );

  const enemyCap = Math.round(
    clamp(PROGRESSION.wave.capBase + tier * PROGRESSION.wave.capPerTier + metrics.level * PROGRESSION.wave.capPerLevel + metrics.activeTurrets + metrics.activeScouts, PROGRESSION.wave.capMin, PROGRESSION.wave.capMax)
  );

  return {
    score,
    tier,
    label: THREAT_LABELS[tier],
    spawnIntervalTicks,
    waveBudget,
    enemyCap,
    recoveryMode: spawnIntervalTicks > nominalIntervalTicks + PROGRESSION.spawn.recoveryThreshold,
    powerBalance,
  };
}

export function getCombatEnemyWeights(director: ProgressionDirector) {
  const dominance = Math.max(0, director.powerBalance);
  const pressure = Math.max(0, -director.powerBalance);
  const mw = PROGRESSION.combatWeights.mite;
  const ww = PROGRESSION.combatWeights.wisp;
  const rw = PROGRESSION.combatWeights.raider;

  return {
    mite: clamp(mw.base + director.tier * mw.tier + pressure * mw.pressure, mw.min, mw.max),
    wisp:
      director.tier >= ww.minTier
        ? clamp(ww.base + director.tier * ww.tier + dominance * ww.dominance + pressure * ww.pressure, ww.min, ww.max)
        : 0,
    raider:
      director.tier >= rw.minTier
        ? clamp(rw.base + (director.tier - 1) * rw.tier + dominance * rw.dominance + pressure * rw.pressure, rw.min, rw.max)
        : 0,
  };
}

export function getCorruptorSpawnChance(
  director: ProgressionDirector,
  activeCorruptionNodes: number,
  existingCorruptors: number,
  corruptibleNodeCount: number
) {
  const c = PROGRESSION.corruptor;
  if (director.tier < c.minTier || corruptibleNodeCount <= 0) return 0;

  const pressure = Math.max(0, -director.powerBalance);
  const dominance = Math.max(0, director.powerBalance);
  const cap = director.tier >= c.highTierThreshold ? c.capHighTier : director.tier >= c.minTier ? c.capLowTier : 1;
  if (existingCorruptors >= cap) return 0;

  return clamp(
    c.chanceBase +
      (director.tier - 1) * c.chancePerTier +
      activeCorruptionNodes * c.chancePerActiveNode +
      dominance * c.chancePerDominance -
      pressure * c.chancePerPressure,
    c.chanceMin,
    c.chanceMax
  );
}

export function getEnemyWavePower(level: number, prestige: number, director: ProgressionDirector) {
  const wp = PROGRESSION.wavePower;
  return level * wp.perLevel + prestige * wp.perPrestige + director.tier * wp.perTier + Math.max(0, director.powerBalance) * wp.perDominance;
}
