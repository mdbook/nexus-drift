import type { EnemyKind, UpgradeKey, VisibleResourceKey, WorkerKind } from "@/game/types";

export const UPGRADES: Record<UpgradeKey, { baseCost: number; growth: number }> = {
  miner: { baseCost: 10, growth: 1.20 },
  drill: { baseCost: 80, growth: 1.24 },
  reactor: { baseCost: 200, growth: 1.27 },
  bot: { baseCost: 1100, growth: 1.32 },
  turret: { baseCost: 180, growth: 1.25 },
  shield: { baseCost: 420, growth: 1.28 },
  scout: { baseCost: 280, growth: 1.26 },
  arsenal: { baseCost: 540, growth: 1.29 },
  foundry: { baseCost: 200, growth: 1.26 },
  sentinel: { baseCost: 800, growth: 1.35 },
  archive: { baseCost: 0, growth: 1.30 },
  focusedBeam: { baseCost: 600, growth: 1.35 },
};

export const WORKER = {
  evadeSpeedBase: 1.1,
  evadeSpeedPanicCap: 0.18,
  evadePanicDivisor: 180,
  panicDelta: {
    evadingWithThreat: 1.8,
    evadingPassive: 0.75,
    working: -2.1,
    recovering: -3.2,
    traversing: -1.2,
    traversingRecovering: -1.8,
    damagedBurst: 6,
  },
  healRate: {
    evading: 0.006,
    evadingShield: 0.004,
    working: 0.028,
    workingShield: 0.01,
    recovering: 0.08,
    recoveringShield: 0.015,
    traversing: 0.014,
    traversingShield: 0.006,
  },
  recoveryHpThreshold: 0.6,
  recoverySpeed: 0.66,
  damagedSpeed: 0.66,
  traversingSpeed: 0.74,
  separationMinDist: 28,
  respawn: {
    hpMin: 25,
    hpBase: 0.55,
    hpShieldBonus: 0.04,
    panic: 40,
    evadeTicks: 36,
    damageTicks: 30,
  },
  combatDamageTicks: 24,
  heavyFireThreshold: 24,
} as const;

export const ENEMY_STATS: Record<
  EnemyKind,
  { hpBase: number; hpWave: number; speedBase: number; speedWave: number }
> = {
  mite: { hpBase: 40, hpWave: 6, speedBase: 1.1, speedWave: 0.02 },
  raider: { hpBase: 65, hpWave: 5, speedBase: 0.9, speedWave: 0.02 },
  wisp: { hpBase: 30, hpWave: 6, speedBase: 1.45, speedWave: 0.02 },
  corruptor: { hpBase: 52, hpWave: 5, speedBase: 1, speedWave: 0.015 },
  rusher: { hpBase: 24, hpWave: 4, speedBase: 1.85, speedWave: 0.025 },
  brute: { hpBase: 160, hpWave: 8, speedBase: 0.55, speedWave: 0.01 },
  sapper: { hpBase: 35, hpWave: 5, speedBase: 1.1, speedWave: 0.02 },
  blight: { hpBase: 95, hpWave: 7, speedBase: 0.8, speedWave: 0.012 },
  // Leech: 40 HP replaced by 50-HP shield; remaining 30 base HP.
  leech: { hpBase: 30, hpWave: 6, speedBase: 0.85, speedWave: 0.015 },
  // Phantom: gains 10-HP shield on top of existing 55 HP.
  phantom: { hpBase: 55, hpWave: 5, speedBase: 1.3, speedWave: 0.018 },
  // Zapper: 10 HP replaced by 20-HP shield; remaining 35 base HP.
  zapper: { hpBase: 35, hpWave: 4, speedBase: 0.75, speedWave: 0.01 },
};

export const ENEMY_BUDGET_COST: Record<EnemyKind, number> = {
  mite: 1,
  wisp: 1.25,
  raider: 2.35,
  corruptor: 2.7,
  rusher: 0.9,
  brute: 3.5,
  sapper: 1.6,
  blight: 3.2,
  leech: 2.8,
  phantom: 2.6,
  zapper: 2.4,
};

export const ENEMY_CONTACT_DAMAGE: Record<EnemyKind, number> = {
  mite: 3.4,
  wisp: 2.6,
  raider: 6.8,
  corruptor: 0,
  rusher: 4,
  brute: 12,
  sapper: 0,
  blight: 0,
  leech: 2,
  phantom: 5,
  zapper: 0,
};

/**
 * Enemy shield system — leech, phantom, and zapper carry a shield layer that
 * absorbs damage before their HP pool. Shields don't regen while the enemy is
 * being shot; once REGEN_DELAY_TICKS have passed without incoming damage, the
 * shield recovers at REGEN_RATE_PER_TICK per tick.
 */
export const ENEMY_SHIELD: {
  shieldMax: Partial<Record<import("@/game/types").EnemyKind, number>>;
  regenDelayTicks: number;
  regenRatePerTick: number;
} = {
  shieldMax: {
    leech: 50,
    phantom: 10,
    zapper: 20,
  },
  regenDelayTicks: 90, // ~3 seconds at 30 ticks/s
  regenRatePerTick: 0.25,
} as const;

export const ZAPPER = {
  holdDistance: 140,
  firingRange: 170,
  fireIntervalTicks: 90,
  boltLifeTicks: 22,
  boltColor: "rgba(180, 80, 255, 0.9)",
  boltWidth: 2.4,
  disableDurationTicks: 210,
} as const;

export const ENEMY_SPECIAL = {
  sapper: {
    explosionRadius: 60,
    explosionDamage: 18,
    triggerRadius: 22,
  },
  blight: {
    corruptionRatePerTick: 0.95,
    scoutDamageResistance: 0.6,
    arsenalResistThreshold: 3,
  },
  leech: {
    drainRadius: 100,
    goldDrainPerTick: 0.4,
    energyDrainPerTick: 0.02,
  },
  phantom: {
    visibleTicks: 90,
    cloakedTicks: 30,
    cycleTicks: 120,
  },
  brute: {
    coreDropAmount: 1,
  },
} as const;

export const ENEMY_SEPARATION = {
  minDist: 42,
  resolutionPasses: 2,
} as const;

export const ENEMY_MOVEMENT = {
  combatSpeedScale: 0.561,
  corruptorApproachScale: 0.56,
  strafeAmplitude: 0.18,
  approachMinDistance: 18,
  personalSpaceRadius: 55,
  crowdingThreshold: 2,
  orbitBlend: 0.4,
} as const;

export const TURRET = {
  rangeBase: 125,
  rangePerUpgrade: 15,
  rangePerReactor: 6,
  damageBase: 13,
  damagePerTurret: 4,
  damagePerReactor: 3,
  damageWispBonusBase: 4,
  damageWispBonusPerTurret: 2,
  damageRaiderBonusBase: 5,
  damageRaiderBonusPerReactor: 4,
  cooldownBase: 21,
  cooldownPerTurret: 1.4,
  cooldownPerReactor: 0.45,
  cooldownPerTierPair: 0.3,
  cooldownFloor: 7,
  projectileLife: 7,
  missileSpeed: 3.5,
  missileSteering: 0.12,
  missileMaxLife: 90,
  missileHitRadius: 14,
  missileDamageBonus: 1.15,
} as const;

export const FOCUSED_BEAM = {
  baseRange: 90,
  rangePerLevel: 8,
} as const;

export const SCOUT = {
  damageBase: 6,
  damagePerScout: 2.0,
  damagePerArsenal: 7,
  cooldownBase: 24,
  cooldownPerScout: 0.5,
  cooldownPerArsenal: 2,
  cooldownFloor: 8,
  preferredRangeBase: 56,
  preferredRangePerScout: 4,
  preferredRangePerArsenal: 8,
  speedPerScout: 0.05,
  speedPerArsenal: 0.10,
  cleanseRateBase: 0.10,
  cleanseRatePerArsenal: 0.08,
  avoidRadius: 90,
  capBase: 2,
  capBoostThreshold: 8,
  capBoostAmount: 1,
  cleanseSynergyPerExtra: 0.6,
} as const;

export const FLUX = {
  softCap: 200,
  overCapBuffer: 50,
  cleanseTickReward: 0.5,
  cleanseCompletionBonus: 3.0,
  corruptorKillReward: 1.0,
  blightKillReward: 2.5,
  arsenalTickBonus: 0.1,
  prestigeResetMultiplier: 0.25,
} as const;

export const SENTINEL = {
  damageBase: 22,
  damagePerSentinel: 5,
  cooldownBase: 28,
  cooldownFloor: 14,
  rangeBase: 140,
  speedBase: 0.70,
  projectileColor: "rgba(251, 191, 36, 0.9)",
  projectileWidth: 3.2,
  projectileLife: 9,
  capPerUpgrade: 1,
  patrolRadius: 120,
  patrolY: 350,
} as const;

export const CORRUPTION = {
  ratePerTick: 0.65,
  ratePerLevel: 0.01,
  purgeBase: 0.25,
  purgePerArsenal: 0.04,
  purgePerShield: 0.01,
  purgeThreshold: 3,
  nodeActiveThreshold: 3,
  yieldFloor: 0.45,
  yieldDivisor: 170,
  attachRadius: 10,
  corruptibleKindsBiasWeight: { ore: 0.18, gems: 0.22, energy: 0.2 } as Record<"ore" | "gems" | "energy", number>,
} as const;

export const COMBAT = {
  detectionRadius: 26,
  minPerAttackerDamage: 0.6,
  mitigation: {
    baselineShield: 0.95,
    baselineTurret: 0.12,
    miteShield: 0.55,
    wispTurret: 0.45,
    wispShield: 0.15,
    raiderReactor: 0.55,
    raiderShield: 0.22,
  },
} as const;

export const ECONOMY = {
  prestigeMultiplier: 0.12,
  threatPenaltyFloor: 0.6,
  threatPenaltyPerEnemy: 0.025,
  threatPenaltyPerShield: 0.015,
  rates: {
    goldBase: 1,
    goldPerMiner: 0.78,
    goldPerDrill: 0.1,
    oreBase: 0.32,
    orePerMiner: 0.30,
    orePerDrill: 1.0,
    gemsBase: 0.02,
    gemsPerDrill: 0.08,
    gemsPerReactor: 0.02,
    energyBase: 0.03,
    energyPerReactor: 0.25,
    energyPerShield: 0.04,
  },
  xpRate: {
    base: 0.6,
    perReactor: 0.08,
    perPrestige: 0.05,
    perTurret: 0.015,
    perScout: 0.018,
    scale: 9.5,
  },
  levelComboBonus: 0.15,
  comboMax: 9.9,
  levelXpBase: 80,
  levelXpPerLevel: 25,
} as const;

export const REWARDS = {
  goldPerKillBase: 10,
  goldPerKillPerTurret: 2,
  goldPerPurgeBase: 8,
  goldPerPurgePerScout: 3,
  energyPerKillBase: 0.5,
  energyPerKillPerShield: 0.05,
  energyPerPurgeBase: 0.9,
  energyPerPurgePerArsenal: 0.08,
} as const;

export const MINING = {
  workerActiveHpThreshold: 30,
  damageBase: 1,
  damagePerMiner: 0.08,
  damagePerDrill: 0.04,
  corruptedDamagePenalty: 0.78,
  critChanceBase: 0.18,
  critChancePerBot: 0.01,
  yield: { gold: 14, ore: 10, gems: 3.4, energy: 5.4 } as Record<VisibleResourceKey, number>,
  contactRadiusMin: 24,
  contactRadiusRatio: 0.52,
} as const;

export const PRESTIGE = {
  goldGate: 9800,
  gemsGate: 70,
  maxEnemies: 3,
  resetMultipliers: { gold: 0.18, ore: 0.15, gems: 0.2, energy: 0.2, cores: 0, flux: 0 },
  comboBonus: 0.6,
} as const;

export const PROGRESSION = {
  scoreCoeffs: {
    level: 1.35,
    prestige: 8,
    totalUpgrades: 0.95,
    weightedUpgrade: 0.9,
    cityStage: 3.5,
    totalIncome: 0.035,
  },
  tiersPerScore: 14,
  powerBalance: {
    threatWeight: 1.08,
    corruptionNodeWeight: 0.75,
    corruptorWeight: 0.4,
  },
  spawn: {
    baselineInterval: 280,
    intervalPerScore: 2.1,
    intervalPerTurret: 4,
    intervalPerScout: 3,
    intervalPerPrestige: 4,
    intervalMin: 72,
    intervalMax: 260,
    recoveryPressureMultiplier: 5.5,
    recoveryColonyHealthRef: 74,
    recoveryColonyHealthMultiplier: 1.1,
    recoveryThreatSurplusMultiplier: 11,
    recoveryCorruptionSurplusMultiplier: 9,
    momentumDominanceBonus: 6,
    momentumHealthBonus: 0.65,
    momentumHealthRef: 88,
    recoveryThreshold: 16,
  },
  wave: {
    budgetBase: 1.15,
    budgetPerScore: 0.038,
    budgetPerTier: 0.24,
    budgetPerDominance: 0.11,
    budgetPerPressure: -0.07,
    budgetPerExtraDefender: 0.08,
    budgetMin: 1.1,
    budgetMax: 7.2,
    capBase: 6,
    capPerTier: 2.1,
    capPerLevel: 0.16,
    capMin: 6,
    capMax: 24,
  },
  wavePower: {
    perLevel: 1 / 3,
    perPrestige: 1.5,
    perTier: 0.65,
    perDominance: 0.18,
  },
  corruptor: {
    minTier: 2,
    capLowTier: 2,
    capHighTier: 3,
    highTierThreshold: 4,
    chanceBase: 0.05,
    chancePerTier: 0.07,
    chancePerActiveNode: 0.06,
    chancePerDominance: 0.02,
    chancePerPressure: -0.03,
    chanceMin: 0.04,
    chanceMax: 0.6,
  },
  combatWeights: {
    mite: { base: 2.2, tier: -0.26, pressure: 0.08, min: 0.45, max: 2.4 },
    wisp: { base: 0.6, tier: 0.32, dominance: 0.08, pressure: -0.02, min: 0.35, max: 3.2, minTier: 1 },
    raider: { base: 0.28, tier: 0.36, dominance: 0.12, pressure: -0.1, min: 0.15, max: 2.8, minTier: 2 },
    rusher: { base: 0, tier: 0.28, pressure: 0.12, min: 0.2, max: 2.6, minTier: 3 },
    brute: { base: 0, tier: 0.22, dominance: 0.15, pressure: -0.15, min: 0.1, max: 1.8, minTier: 4 },
    sapper: { base: 0, tier: 0.18, pressure: 0.08, min: 0.1, max: 1.6, minTier: 5 },
    leech: { base: 0, tier: 0.14, dominance: 0.1, min: 0.1, max: 1.4, minTier: 6 },
    phantom: { base: 0, tier: 0.12, min: 0.08, max: 1.2, minTier: 7 },
    zapper: { base: 0, tier: 0.10, min: 0.06, max: 1.0, minTier: 7 },
  },
} as const;

export const CITY = {
  growthStart: 8,
  growthSpan: 118,
  stageThresholds: [0.14, 0.32, 0.54, 0.78, 1],
  developmentWeights: {
    level: 1.05,
    totalUpgrades: 1.45,
    weightedUpgrade: 1.1,
    activeTurrets: 2.1,
    activeScouts: 1.3,
    prestige: 6.8,
    totalIncome: 0.16,
  },
} as const;

export const DEFENSE = {
  score: {
    turret: 1.4,
    shield: 1.9,
    scout: 1.6,
    arsenal: 1.2,
    sentinel: 2.1,
  },
  threat: {
    corruptorMultiplier: 1.3,
  },
  weightedUpgrade: {
    miner: 0.9,
    drill: 1.15,
    reactor: 1.3,
    bot: 0.7,
    turret: 1.8,
    shield: 1.25,
    scout: 1.35,
    arsenal: 1.45,
    foundry: 1.15,
    sentinel: 1.9,
    archive: 1.2,
  },
  hostilePressureEnemyThreshold: 4,
  hostilePressureColonyHealth: 72,
} as const;

export const WORKER_SLOTS_BY_UPGRADE: Record<WorkerKind, number[]> = {
  miner:  [1, 1, 1, 2, 2, 2, 3],
  runner: [1, 1, 1, 2, 2, 2, 3],
  drone:  [1, 1, 1, 2, 2, 2, 3],
};

export const WORKERS_AT_HOME: Record<WorkerKind, { x: number; y: number; speed: number; task: string }> = {
  miner: { x: 160, y: 440, speed: 1.1, task: "Surveying" },
  runner: { x: 320, y: 440, speed: 1.28, task: "Hauling" },
  drone: { x: 700, y: 440, speed: 1.02, task: "Optimizing" },
};
