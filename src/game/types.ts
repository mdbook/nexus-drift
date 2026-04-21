import type { AchievementId } from "@/game/achievements";
import type { Rng } from "@/game/rng";

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
  | "phantom"
  | "zapper";
export type EnemyRole = "combat" | "corruptor";
export type EnemyArchetype =
  | "direct"
  | "flanker"
  | "ambusher"
  | "ghost"
  | "skirmisher"
  | "driver"
  | "infester";
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
  | "archive"
  | "focusedBeam";
export type StatusTone = "danger" | "toxic" | "ready" | "calm";

export type LogCategory =
  | "system"
  | "combat"
  | "mining"
  | "corruption"
  | "event"
  | "upgrade"
  | "achievement"
  | "ambient";

export type LogEntry = {
  tick: number;
  category: LogCategory;
  message: string;
};

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
  /** Sim tick when this node was placed or last respawned. Used by the renderer for fade-in. */
  spawnTick: number;
  /** Decaying counter of how actively workers have been mining this node. Used by AI progress-bias. */
  workTicks: number;
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
  killsNearby: number;
  veteranRank: 0 | 1 | 2 | 3;
  /** Sim tick when this agent was deployed or last rebooted. Used by the renderer for fade-in. */
  spawnTick: number;
  /** Countdown in ticks while this worker is disabled by a zapper bolt. 0 = active. */
  disabledTicks: number;
  /** Whether this slot has been unlocked. Slot 0 starts active; slots 1 and 2 unlock via upgrades. */
  active: boolean;
  /** EMA of recent threat-field samples at this worker's position. Feeds regroup and panic scaling. */
  threatMemory: number;
};

export type Turret = {
  id: number;
  x: number;
  y: number;
  range: number;
  cooldown: number;
  angle: number;
  /** Countdown in ticks while this turret is disabled by a zapper bolt. 0 = active. */
  disabledTicks: number;
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
  /** Fire cooldown for zapper enemies. 0 = ready to fire. */
  fireCooldown?: number;
  trail: [number, number][];
  /** Sim tick when this enemy entered the field. Used by the renderer for fade-in. */
  spawnTick: number;
  /**
   * Counts down from DEATH_FADE_TICKS to 0 after hp hits 0. The enemy is kept
   * in state (but skipped by all sim logic) so the renderer can animate a
   * fade-out. Removed from state.enemies once this reaches 0.
   */
  dyingTicks: number;
  /**
   * Current shield HP. Damage is absorbed by the shield before reaching hp.
   * Present only on enemies that have shields (leech, phantom, zapper).
   * undefined = no shield mechanic.
   */
  shield?: number;
  /** Maximum shield HP. */
  shieldMax?: number;
  /**
   * Ticks since the last time this enemy took damage. Once this exceeds
   * ENEMY_SHIELD.regenDelayticks the shield begins regenerating each tick.
   */
  shieldRegenCooldown?: number;
  /** Behavioral archetype derived from kind at spawn. Drives pursuit style. */
  archetype: EnemyArchetype;
  /** Squad bucket derived from spawn tick. Squadmates spread approach bearings to the same target. */
  squadId: number;
  /** Ambusher burst dash counter (sapper). Counts down while in burst state. */
  dashTicks?: number;
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
  /** Identifies special projectile behaviour. Untagged / "instant-beam" = cosmetic line only. */
  tag?: "zapper-bolt" | "turret-missile" | "instant-beam";
  /** Target entity id for tagged projectiles. */
  targetId?: number;
  /** Whether the target is an agent or turret (zapper-bolt) or an enemy (turret-missile). */
  targetKind?: "agent" | "turret";
  /** Homing missile velocity (unit vector). */
  vx?: number;
  vy?: number;
  /** Movement speed in px/tick for turret-missile. */
  speed?: number;
  /** Damage to apply on impact for turret-missile. */
  damage?: number;
  };

export type Stats = {
  mined: number;
  spent: number;
  crits: number;
  hostileKills: number;
  totalEnemiesKilled: number;
  brutesKilled: number;
  phantomsKilled: number;
  leechesKilled: number;
  sappersKilled: number;
  sentinelKills: number;
  blocked: number;
  corruptions: number;
  purges: number;
  eventsExperienced: string[];
  eventTagsInspected: string[];
  touristClicks: number;
  touristPassesClicked: number;
  runtimeMs: number;
};

export type Timers = {
  tick: number;
  auto: number;
  event: number;
  enemy: number;
  bigEvent: number;
};

export type ActiveEvent = {
  id: EventId;
  label: string;
  ticksRemaining: number;
  revertOnExpire: boolean;
};

export type TouristWorker = {
  x: number;
  y: number;
  angle: number;
  active: boolean;
  spotted: boolean;
  passId: number;
  lastClickedPassId: number | null;
  squishTicks: number;
};

export type LostDrone = {
  x: number;
  y: number;
  baseY: number;
  angle: number;
  vx: number;
  wobblePhase: number;
  spawnTick: number;
};

export type GameState = {
  schemaVersion: number;
  citySeed: number;
  rng: Rng;
  resources: ResourceMap;
  upgrades: UpgradeMap;
  log: LogEntry[];
  combo: number;
  level: number;
  xp: number;
  prestige: number;
  achievements: Partial<Record<AchievementId, true>>;
  nodes: ResourceNode[];
  agents: Agent[];
  turrets: Turret[];
  scouts: Scout[];
  sentinels: Sentinel[];
  enemies: Enemy[];
  projectiles: Projectile[];
  stats: Stats;
  timers: Timers;
  touristWorker: TouristWorker | null;
  lostDrone: LostDrone | null;
  lostWorkerFound: boolean;
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
  frozenMissile: { id: number; x: number; y: number; ticks: number } | null;
  goldExplosion: { x: number; y: number; ticks: number; maxTicks: number } | null;
  missileClickCooldown: number;
};

export type UpgradeDef = {
  key: UpgradeKey;
  label: string;
  baseCost: number | Partial<Record<ResourceKey, number>>;
  growth: number;
  effectText: string;
  minTier?: number;
};

export type EventId =
  | "meteor_shower"
  | "solar_flare"
  | "cache_discovery"
  | "pirate_caravan"
  | "xeno_bloom"
  | "dust_storm"
  | "echo_signal"
  | "core_breach"
  | "hunter_pack"
  | "signal_drought"
  | "starcall"
  | "null_surge";

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
