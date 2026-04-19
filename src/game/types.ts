export type ResourceKey = "gold" | "ore" | "gems" | "energy" | "cores" | "flux";
export type VisibleResourceKey = "gold" | "ore" | "gems" | "energy";
export type WorkerKind = "miner" | "runner" | "drone";
export type EnemyKind =
  | "mite"
  | "raider"
  | "wisp"
  | "corruptor"
  | "rusher"
  | "brute"
  | "sapper"
  | "blight"
  | "leech"
  | "phantom";
export type EnemyRole = "combat" | "corruptor";
export type UpgradeKey =
  | "miner"
  | "drill"
  | "reactor"
  | "bot"
  | "turret"
  | "shield"
  | "scout"
  | "arsenal"
  | "foundry"
  | "sentinel"
  | "archive";
export type StatusTone = "danger" | "toxic" | "ready" | "calm";

export type ResourceMap = Record<ResourceKey, number>;
export type UpgradeMap = Record<UpgradeKey, number>;

export type ResourceNode = {
  id: number;
  kind: VisibleResourceKey;
  x: number;
  y: number;
  size: number;
  hp: number;
  maxHp: number;
  pulse: number;
  corruption: number;
  corrupted: boolean;
  corruptedBy: number | null;
  temporary?: boolean;
  despawnAt?: number;
};

export type Agent = {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  homeX: number;
  homeY: number;
  speed: number;
  kind: WorkerKind;
  target: number | null;
  swing: number;
  task: string;
  hp: number;
  maxHp: number;
  panic: number;
  evadeTicks: number;
  evadeDx: number;
  evadeDy: number;
  damageTicks: number;
};

export type Turret = {
  id: number;
  x: number;
  y: number;
  range: number;
  cooldown: number;
  angle: number;
};

export type Scout = {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  cooldown: number;
  angle: number;
  task: string;
  pulse: number;
  homeX: number;
  homeY: number;
  targetId: number | null;
};

export type Sentinel = {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  cooldown: number;
  angle: number;
  task: string;
  pulse: number;
  homeX: number;
  homeY: number;
  targetId: number | null;
};

export type Enemy = {
  id: number;
  kind: EnemyKind;
  role: EnemyRole;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  targetId: number | null;
  targetNodeId: number | null;
  flash: number;
  corruptTicks: number;
  cloakTicks?: number;
  goldRewardBonus?: number;
  coreDropOverride?: number;
  trail: [number, number][];
};

export type Projectile = {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
};

export type Stats = {
  mined: number;
  spent: number;
  crits: number;
  hostileKills: number;
  brutesKilled: number;
  blocked: number;
  corruptions: number;
  purges: number;
};

export type Timers = {
  tick: number;
  auto: number;
  event: number;
  enemy: number;
  bigEvent: number;
};

export type ActiveEvent = {
  id: string;
  label: string;
  ticksRemaining: number;
};

import type { Rng } from "@/game/rng";

export type GameState = {
  citySeed: number;
  rng: Rng;
  resources: ResourceMap;
  upgrades: UpgradeMap;
  log: string[];
  combo: number;
  level: number;
  xp: number;
  prestige: number;
  nodes: ResourceNode[];
  agents: Agent[];
  turrets: Turret[];
  scouts: Scout[];
  sentinels: Sentinel[];
  enemies: Enemy[];
  projectiles: Projectile[];
  stats: Stats;
  timers: Timers;
  activeEvents: ActiveEvent[];
  eventModifiers: {
    yieldMultiplier: number;
    energyRate: number;
    turretCooldownScale: number;
    turretRangeScale: number;
    enemySpeedScale: number;
    corruptionRate: number;
    fluxPurgeMultiplier: number;
  };
  nextBigEventInterval: number;
  nextNodeId: number;
  nextEnemyId: number;
  nextProjectileId: number;
};

export type UpgradeDef = {
  key: UpgradeKey;
  label: string;
  baseCost: number | Partial<Record<ResourceKey, number>>;
  growth: number;
  effectText: string;
  minTier?: number;
};

export type ResourceDef = {
  key: VisibleResourceKey;
  label: string;
  tint: string;
  glow: string;
};

export type NodeVisual = {
  fill: string;
  core: string;
  stroke: string;
  glow: string;
  label: string;
};

export type EnemyVisual = {
  fill: string;
  glow: string;
  stroke: string;
  radius: number;
};

export type ProgressionDirector = {
  score: number;
  tier: number;
  label: string;
  spawnIntervalTicks: number;
  waveBudget: number;
  enemyCap: number;
  recoveryMode: boolean;
  powerBalance: number;
};

export type DerivedState = {
  resources: ResourceMap;
  rates: ResourceMap;
  fluxRate: number;
  totalIncome: number;
  targetXp: number;
  defenseScore: number;
  threatScore: number;
  enemyCounts: Record<EnemyKind, number>;
  activeEvents: ActiveEvent[];
  colonyHealth: number;
  corruptedByType: Record<"ore" | "gems" | "energy", number>;
  corruptorCount: number;
  activeCorruptionNodes: number;
  corruptedNodes: number;
  combatThreats: number;
  activeTurrets: number;
  activeScouts: number;
  activeSentinels: number;
  hostilePressure: boolean;
  corruptionPressure: boolean;
  homeDevelopment: number;
  cityStage: number;
  cityProgress: number;
  cityBuildProgress: number;
  prestigeComboBonus: number;
  progression: ProgressionDirector;
};
