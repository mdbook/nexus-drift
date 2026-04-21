import type { EnemyArchetype, EnemyKind, ResourceKey, UpgradeKey, VisibleResourceKey, WorkerKind } from "@/game/types";

// 3.0.0: base costs stretched so 3rd turret / multi-worker slots take 1+ hr
// each, and full-doctrine runs land in the multi-session wallpaper range
// (see plan file "let-s-get-ready-for-playful-snowflake.md" Section A).
export const UPGRADES: Record<UpgradeKey, { baseCost: number; growth: number }> = {
  miner: { baseCost: 28, growth: 1.24 },
  drill: { baseCost: 220, growth: 1.27 },
  reactor: { baseCost: 520, growth: 1.30 },
  bot: { baseCost: 1100, growth: 1.32 },
  turret: { baseCost: 520, growth: 1.30 },
  shield: { baseCost: 420, growth: 1.28 },
  scout: { baseCost: 280, growth: 1.26 },
  arsenal: { baseCost: 540, growth: 1.29 },
  foundry: { baseCost: 200, growth: 1.26 },
  sentinel: { baseCost: 800, growth: 1.35 },
  archive: { baseCost: 0, growth: 1.30 },
  focusedBeam: { baseCost: 600, growth: 1.35 },
  missileLauncher: { baseCost: 2200, growth: 1.32 },
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

/**
 * Worker-vs-enemy collision tuning used by movement.ts.
 * Radii intentionally track the rendered bodies rather than the larger panic
 * / threat radii so blocking feels physical without inflating fear range.
 */
export const WORKER_BLOCKING = {
  workerRadius: {
    miner: 14,
    runner: 15,
    drone: 14,
  } satisfies Record<WorkerKind, number>,
  enemyRadius: {
    mite: 15,
    raider: 24,
    wisp: 13,
    corruptor: 16,
    rusher: 12,
    brute: 27,
    sapper: 10,
    blight: 18,
    leech: 16,
    phantom: 17,
    zapper: 14,
    warden: 18,
  } satisfies Record<EnemyKind, number>,
  softBuffer: 10,
  speedPenaltyPerEnemy: 0.13,
  speedPenaltyCap: 0.55,
  touchingPenaltyPerEnemy: 0.18,
  touchingPenaltyCap: 0.42,
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
  // Warden: late-game void infester. Tanky so it survives to attach, but slow.
  warden: { hpBase: 140, hpWave: 6, speedBase: 0.82, speedWave: 0.012 },
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
  warden: 4.5,
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
  warden: 0,
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
  corruptor: {
    corruptionRatePerTick: 0.12,
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

/**
 * 3.0.0 — turret structural HP + break state.
 *
 * Turrets now have a health pool that enemies can damage (wiring lives in
 * stepCombat / damageTurret). When HP reaches 0 the turret enters a
 * `brokenTicks` downtime window (~80s at 30 ticks/s), during which it skips
 * all targeting and firing. On recovery the turret is restored to
 * `maxHp * brokenRecoverRatio` rather than full so chained breaks stay
 * punishing without becoming unrecoverable.
 */
export const TURRET_HP = {
  hpBase: 120,
  hpPerTurretUpgrade: 20,
  hpPerShieldUpgrade: 10,
  brokenDurationTicks: 2400,
  brokenRecoverRatio: 0.5,
  damageFlashTicks: 12,
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
  missileSteering: 0.18,
  missileMaxLife: 90,
  missileHitRadius: 16,
  missileGraceRadius: 28,
  missileCorpseGraceRadius: 24,
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
  purgeBase: 0.12,
  purgePerArsenal: 0.025,
  purgePerShield: 0.01,
  purgeThreshold: 3,
  nodeActiveThreshold: 3,
  yieldFloor: 0.45,
  yieldDivisor: 170,
  attachRadius: 10,
  corruptibleKindsBiasWeight: { ore: 0.18, gems: 0.22, energy: 0.2 } as Record<"ore" | "gems" | "energy", number>,
} as const;

export const COMBAT = {
  detectionRadius: 32,
  minPerAttackerDamage: 0.6,
  surroundBonusPerAttacker: 0.32,
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

// 3.0.0: passive gold income and XP accumulation are dramatically slowed so
// base progression keys off mining output rather than timer-style drip, and
// sector level takes hours to climb. Mining yields themselves are also cut
// (MINING.yield below) to anchor the overall gold curve against the new
// upgrade costs.
export const ECONOMY = {
  prestigeMultiplier: 0.12,
  threatPenaltyFloor: 0.6,
  threatPenaltyPerEnemy: 0.025,
  threatPenaltyPerShield: 0.015,
  rates: {
    goldBase: 0.18,
    goldPerMiner: 0.16,
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
    base: 0.12,
    perReactor: 0.08,
    perPrestige: 0.05,
    perTurret: 0.015,
    perScout: 0.018,
    scale: 2.0,
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
  // 3.0.0: per-haul yields cut ~3× to keep the stretched upgrade curve honest.
  yield: { gold: 4.5, ore: 3.4, gems: 1.2, energy: 1.8 } as Record<VisibleResourceKey, number>,
  contactRadiusMin: 24,
  contactRadiusRatio: 0.52,
} as const;

// 3.0.0: prestige gates raised ~6× so auto-prestige lands in the 6-10 hour
// range instead of the ~45 min current target.
export const PRESTIGE = {
  goldGate: 60000,
  gemsGate: 380,
  maxEnemies: 3,
  resetMultipliers: { gold: 0.18, ore: 0.15, gems: 0.2, energy: 0.2, cores: 0, flux: 0 },
  comboBonus: 0.6,
} as const;

// 3.0.0: director score and spawn tuning both decouple from level-driven
// drift — tier now climbs via real colony weight (upgrades, prestige, income)
// over a much longer curve, and wave cadence stays calmer so the early
// colony can actually finish its first turrets before real pressure lands.
export const PROGRESSION = {
  scoreCoeffs: {
    level: 0.22,
    prestige: 8,
    totalUpgrades: 0.95,
    weightedUpgrade: 0.9,
    cityStage: 3.5,
    totalIncome: 0.035,
  },
  tiersPerScore: 75,
  powerBalance: {
    threatWeight: 1.08,
    corruptionNodeWeight: 0.75,
    corruptorWeight: 0.4,
  },
  spawn: {
    baselineInterval: 280,
    intervalPerScore: 0.35,
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
    budgetPerScore: 0.008,
    budgetPerTier: 0.09,
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

// 3.0.0: second worker slot now gates behind sector level 22 (was 12); third
// slot gates behind level 42 (was 24). These align with the stretched XP
// curve so multi-worker deployment lands on a multi-hour, multi-session
// cadence instead of an hour-long run.
export const WORKER_SLOTS_BY_LEVEL = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  3,
] as const;

// 3.0.0: slot-unlock surcharges climb ~4× so the level 3 / level 6 worker
// purchases feel like a deliberate flux+cores spend, not a rounding error.
export const WORKER_SLOT_UNLOCK_RESOURCE_COSTS: Partial<Record<number, Partial<Record<ResourceKey, number>>>> = {
  3: { flux: 18, cores: 4 },
  6: { flux: 55, cores: 14 },
};

/**
 * 3.0.0: new turret slot gate.
 *
 * Turret slot count is now `min(upgrades.turret, TURRET_SLOTS_BY_LEVEL[level])`,
 * mirroring the worker-slot pattern. Index = sector level (clamped to last
 * entry). Values = number of additional turret slots on top of the always-on
 * first turret. Early levels keep 1 turret even if the upgrade has been
 * purchased; the 2nd turret unlocks at level 2, the 3rd at level 8.
 */
export const TURRET_SLOTS_BY_LEVEL = [
  0, 0, 1, 1, 1, 1, 1, 1, 2,
] as const;

/**
 * AI — shared threat field. Per-kind weight is the pressure that kind exerts
 * on nearby space. Corruptors and blights deliberately carry zero weight
 * because they don't attack workers. Falloff is inverse-quadratic with a
 * distance floor so enemies close in don't produce infinities.
 */
export const AI_THREAT = {
  weight: {
    mite: 1,
    raider: 2.2,
    wisp: 1.2,
    rusher: 2,
    brute: 4,
    sapper: 2.5,
    leech: 0.4,
    phantom: 2,
    zapper: 3,
    corruptor: 0,
    blight: 0,
    warden: 3.5,
  } as Record<EnemyKind, number>,
  falloffFloor: 900, // px² — distance² is max()-clamped to this before division
  highThreat: 0.045, // above this threat sample, a point is considered "dangerous"
  cornerSampleDistance: 60, // px probed outward in each of 4 directions for the corner-check
  cornerWallBuffer: 60, // px from a world edge considered "near a wall"
  cornerLookaheadTicks: 14,
} as const;

/**
 * AI — enemy archetype and per-archetype behavior params.
 * tangentBlend: fraction of tangential component mixed into pursuit (flankers).
 * leadTicks: how far ahead to aim when predicting worker position.
 * squadBearingBuckets: how many bearing slices squadmates spread across.
 */
export const ENEMY_ARCHETYPE: Record<EnemyKind, EnemyArchetype> = {
  mite: "direct",
  rusher: "direct",
  brute: "direct",
  raider: "flanker",
  wisp: "flanker",
  sapper: "ambusher",
  phantom: "ghost",
  zapper: "skirmisher",
  leech: "driver",
  corruptor: "infester",
  blight: "infester",
  warden: "ghost",
};

export const ENEMY_AI = {
  flankerTangentBlend: 0.55,
  flankerLeadTicks: 18,
  ambusherApproachScale: 0.55,
  ambusherDashTrigger: 90, // px — enter burst dash once inside this range
  ambusherDashDuration: 18,
  ambusherDashSpeedScale: 1.8,
  ghostRepositionOffset: 120, // px behind worker's movement direction
  ghostRepositionLead: 24,
  ghostRepositionPhaseStart: 0.3, // cloakPhase fraction at which ghost begins repositioning
  ghostRepositionPhaseEnd: 0.75, // cloakPhase fraction at which ghost stops repositioning
  squadBearingBuckets: 6,
  squadBucketTicks: 45, // spawn-tick / this = squadId bucket size
  tankTargetRefreshTicks: 36,
  isolatedRadius: 120, // "alone" means no other active worker within this radius
  woundedHpRatio: 0.6,
} as const;

/**
 * Preferred field regions for each worker kind. Workers score nodes inside
 * their region higher and drift back when hurt. These are soft attractors —
 * workers still leave their zone for a clearly better node, they just need
 * a good reason to do so.
 *
 * Field is 1000 × 620 (y starts at 50 below the header bar).
 * Miner  — left sector, deep field gold deposits.
 * Runner — mid-field corridor, traverses wide gaps.
 * Drone  — right sector, energy-gem clusters.
 */
export const WORKER_REGIONS: Record<WorkerKind, { cx: number; cy: number; radius: number }> = {
  miner:  { cx: 200, cy: 250, radius: 280 },
  runner: { cx: 500, cy: 280, radius: 300 },
  drone:  { cx: 780, cy: 240, radius: 260 },
} as const;

/**
 * Per-kind personality tuning.
 * pathFearScale   — multiplier on pathSafetyPenalty; <1 = braver, >1 = more cautious.
 * regionBias      — weight of region-distance penalty added to node score.
 * groupRepelRadius — sense same-kind peers within this distance.
 * groupRepelMinCount — minimum nearby same-kind peers before dispersal kicks in.
 * lowHpPull       — speed at which a hurt worker nudges toward their region center.
 */
export const WORKER_PERSONALITY: Record<WorkerKind, {
  pathFearScale: number;
  regionBias: number;
  groupRepelRadius: number;
  groupRepelMinCount: number;
  lowHpPull: number;
}> = {
  miner:  { pathFearScale: 0.60, regionBias: 0.28, groupRepelRadius: 130, groupRepelMinCount: 2, lowHpPull: 0.55 },
  runner: { pathFearScale: 0.90, regionBias: 0.16, groupRepelRadius: 110, groupRepelMinCount: 2, lowHpPull: 0.40 },
  drone:  { pathFearScale: 1.30, regionBias: 0.32, groupRepelRadius: 150, groupRepelMinCount: 2, lowHpPull: 0.60 },
} as const;

/**
 * AI — worker target scoring and evasion tuning.
 */
export const WORKER_AI = {
  pathSafetyPenalty: 34, // score penalty per threat-sample unit along the path
  harvestingEvasionRadius: 42, // while at the node, only bolt when an enemy closes within this distance
  corruptionHardAvoidAbove: 20, // non-miners hard-penalize nodes beyond this
  corruptionSoftMultiplier: 1.9, // multiplier applied when hard-avoid triggers
  evadingContestedPenalty: 140, // extra score cost per evading worker currently targeting node
  progressFreshBonus: -12, // score bonus for freshly respawned nodes (small)
  progressActiveBonus: -34, // score bonus for nodes with recent worker contact (workTicks > threshold)
  currentTargetProgressBonus: -28, // extra stickiness for finishing the current partially-mined node
  progressActiveThreshold: 30,
  nodeThreatRadius: 82,
  nodeThreatCrowdPenalty: 44,
  harvestingStubbornEnemyLimit: 2,
  fleeTargetLookahead: 290, // max forward distance considered while persistent evasion is coasting
  fleeTargetMinForward: 48,
  fleeTargetLateralLimit: 125,
  fleeTargetMaxPathThreat: 0.038,
  fleeTargetScanTicks: 12,
  regroupPanicThreshold: 70,
  regroupWeight: 0.05,
  stickyThreshold: 0.64, // only switch target if candidate score is < this * current — lower = stickier
  threatMemoryDecay: 0.92,
  threatMemoryGain: 0.18,
  cornerRotationCandidates: [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75],
} as const;

/**
 * AI — sentinel intercept bodyguard tuning.
 */
export const SENTINEL_AI = {
  interceptLerp: 0.55, // 0 = move to enemy, 1 = move to defended worker; mid intercepts between them
  interceptLeadTicks: 12, // predict worker forward by this many ticks when placing intercept point
  threatWorkerRadiusBias: 280, // closer-to-worker bonus scale
  workerCentroidPatrolWeight: 0.7, // blend between fixed patrolY and active-worker centroid Y
} as const;

/**
 * AI — scout coordinated decorruption tuning.
 */
export const SCOUT_AI = {
  rateScoreWeight: 260, // weight for corruption-dealing rate of a corruptor
  distanceScoreWeight: 1, // distance cost
  finishNodeBias: 18, // score bonus for nodes within X% of cleanse threshold
  finishNodeThreshold: 18, // corruption% at which we call a node "near cleanse"
  stopBleedBias: 14, // bonus for nodes actively being corrupted (corruptedBy != null)
  pairUpScoutCount: 3, // minimum active scouts needed before pair-up activates
  pairUpCorruptionThreshold: 70, // node corruption% required before a second scout stacks
  cornerWallBuffer: 60,
} as const;

export const WORKERS_AT_HOME: Record<WorkerKind, { x: number; y: number; speed: number; task: string }> = {
  miner: { x: 160, y: 440, speed: 1.1, task: "Surveying" },
  runner: { x: 320, y: 440, speed: 1.28, task: "Hauling" },
  drone: { x: 700, y: 440, speed: 1.02, task: "Optimizing" },
};
