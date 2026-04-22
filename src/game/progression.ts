import { PROGRESSION } from "@/game/balance";
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
  liveEnemyCount: number;
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

  // 3.1.3: enemyCap computed early so the field-fill factor can ride alongside
  // the existing nominal/recovery interval pair without erasing their delta.
  const enemyCap = Math.round(
    clamp(PROGRESSION.wave.capBase + tier * PROGRESSION.wave.capPerTier + metrics.level * PROGRESSION.wave.capPerLevel + metrics.activeTurrets + metrics.activeScouts, PROGRESSION.wave.capMin, PROGRESSION.wave.capMax)
  );
  const fillRatio = clamp(metrics.liveEnemyCount / Math.max(1, enemyCap), 0, 1);
  const fillFactor = 1 + fillRatio * PROGRESSION.spawn.intervalFillFactor;

  const baselineInterval =
    PROGRESSION.spawn.baselineInterval - score * PROGRESSION.spawn.intervalPerScore - metrics.activeTurrets * PROGRESSION.spawn.intervalPerTurret - metrics.activeScouts * PROGRESSION.spawn.intervalPerScout - metrics.prestige * PROGRESSION.spawn.intervalPerPrestige;
  const recoveryPenalty =
    pressure * PROGRESSION.spawn.recoveryPressureMultiplier +
    Math.max(0, PROGRESSION.spawn.recoveryColonyHealthRef - metrics.colonyHealth) * PROGRESSION.spawn.recoveryColonyHealthMultiplier +
    Math.max(0, metrics.combatThreats - (metrics.activeTurrets + 2)) * PROGRESSION.spawn.recoveryThreatSurplusMultiplier +
    Math.max(0, metrics.corruptorCount + metrics.activeCorruptionNodes - (metrics.activeScouts + 1)) * PROGRESSION.spawn.recoveryCorruptionSurplusMultiplier;
  const momentumBonus = dominance * PROGRESSION.spawn.momentumDominanceBonus + Math.max(0, metrics.colonyHealth - PROGRESSION.spawn.momentumHealthRef) * PROGRESSION.spawn.momentumHealthBonus;
  const nominalIntervalTicks = Math.round(clamp(baselineInterval - momentumBonus, PROGRESSION.spawn.intervalMin, PROGRESSION.spawn.intervalMax));
  const clampedSpawnInterval = clamp(baselineInterval + recoveryPenalty - momentumBonus, PROGRESSION.spawn.intervalMin, PROGRESSION.spawn.intervalMax);
  // 3.1.3: fillFactor is applied AFTER the clamp so a full field can stretch
  // spawn cadence past the cap without erasing the recovery vs nominal delta.
  const spawnIntervalTicks = Math.round(clampedSpawnInterval * fillFactor);

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

  // 3.1.3: derive a 0..1 strength scalar from the pre-fill interval surplus so
  // spawn budget lerps out of recovery instead of binary flipping. Computed
  // from the pre-fillFactor clamped value so the field-fill multiplier doesn't
  // skew the recovery signal. recoveryMode kept for callers (early-break gate,
  // log prefixes) that still want a boolean.
  const recoveryStrength = clamp(
    (clampedSpawnInterval - nominalIntervalTicks) / Math.max(1, PROGRESSION.spawn.recoveryThreshold * 2),
    0,
    1,
  );

  return {
    score,
    tier,
    label: THREAT_LABELS[tier],
    spawnIntervalTicks,
    waveBudget,
    enemyCap,
    recoveryMode: recoveryStrength > 0.4,
    recoveryStrength,
    powerBalance,
  };
}

export function getCombatEnemyWeights(director: ProgressionDirector) {
  const dominance = Math.max(0, director.powerBalance);
  const pressure = Math.max(0, -director.powerBalance);
  const weights = {} as Record<Exclude<EnemyKind, "corruptor" | "blight">, number>;

  (Object.entries(PROGRESSION.combatWeights) as Array<
    [
      Exclude<EnemyKind, "corruptor" | "blight">,
      {
        base: number;
        tier: number;
        dominance?: number;
        pressure?: number;
        min: number;
        max: number;
        minTier?: number;
      },
    ]
  >).forEach(([kind, config]) => {
    if (director.tier < (config.minTier ?? 0)) {
      weights[kind] = 0;
      return;
    }

    const tierFactor = kind === "raider" ? Math.max(0, director.tier - 1) : director.tier;
    weights[kind] = clamp(
      config.base +
        tierFactor * config.tier +
        dominance * (config.dominance ?? 0) +
        pressure * (config.pressure ?? 0),
      config.min,
      config.max
    );
  });

  return weights;
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
