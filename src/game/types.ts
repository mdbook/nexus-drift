import type { AchievementId } from "@/game/achievements";
import type { Notification } from "@/game/notifications";
import type { Rng } from "@/game/rng";

export type ResourceKey = "gold" | "ore" | "gems" | "energy" | "cores" | "flux";
export type VisibleResourceKey = "gold" | "ore" | "gems" | "energy";
export type WorkerKind = "miner" | "runner" | "drone";
/**
 * Display-only status label for Agent/Scout/Sentinel HUD strings. These are
 * rendered verbatim in the field tooltips and sector card; they are not used
 * as logic discriminators anywhere in the sim path. Keep in sync with every
 * assignment site in `src/game/subsystems/*` and `src/game/factories.ts`.
 */
export type TaskState =
  // Workers
  | "Standby"
  | "Deploying"
  | "Disabled"
  | "Corrupted"
  | "Rebooting"
  | "Evading"
  | "Recovering"
  | "Traversing"
  | "Working"
  | "Mining"
  | "Collecting"
  | "Syncing"
  | "Surveying"
  | "Hauling"
  | "Optimizing"
  | "Purging residue"
  // Scouts + Sentinels
  | "Retreating"
  | "Intercepting"
  | "Engaging"
  | "Purging"
  | "Sweeping"
  | "Cleansing"
  | "Patrolling";
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
  | "zapper"
  | "warden";
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
  | "focusedBeam"
  | "missileLauncher";
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
  task: TaskState;
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
  /** Per-individual multiplier on base speed (~0.88..1.12). Seeded at spawn. */
  speedMod: number;
  /** Per-individual multiplier on pathFearScale (~0.80..1.20). Seeded at spawn. */
  fearMod: number;
  /** Per-individual additive bias to kindPreferenceScore (-0.15..0.15). Seeded at spawn. */
  harvestBias: number;
  /** Miner overclock: counts up while continuously at a node and undamaged. Drives crit bonus. */
  overclockTicks: number;
  /** Runner sprint: remaining ticks of active sprint (speed boost). */
  sprintTicks: number;
  /** Runner sprint: cooldown ticks until next sprint is available. */
  sprintCooldown: number;
  /** Late-game corruption state. When true, worker is void-infested and only destroyable by sentinels. */
  corrupted: boolean;
  /** Counts up while corrupted. Drives drain intensity and shake visual. */
  corruptionTicks: number;
  /** Warden attach progress toward corrupting this worker. Decays when warden not adjacent. */
  corruptingTicks: number;
  /** While > 0 a healthy worker has reported this corrupted agent; any sentinel treats it as visible. */
  spottedTicks: number;
  /** Ticks until this slot's reboot cooldown ends after a cleansed corruption death. 0 = active. */
  rebootTicks: number;
  /**
   * 3.2.1 — counts down after a worker exits evasion. While > 0, the node-scoring
   * threat penalties multiply by WORKER_AI.spookedThreatMultiplier so the worker
   * doesn't path right back through the lane it just fled from.
   */
  spookedTicks: number;
  /**
   * 4.0 — soft player nudge stamped by `suggestWorkerToNode`. When set and
   * unexpired, `chooseWorkerTarget` prefers this target ONLY if it still passes
   * the normal safety/eligibility filters (path-threat / corruption). It never
   * bypasses those rules or the flee path, and is cleared on arrival, expiry, or
   * rejection. Phase 2 only stamps `kind: "node"` (`id` = stringified node id).
   */
  suggestedTarget?: { kind: "node" | "enemy" | "home"; id?: string; expiresAt: number };
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
  /** Current structural HP. Drops when enemies hit the turret; reaches 0 triggers brokenTicks. */
  hp: number;
  /** Maximum structural HP; scales with turret + shield upgrades. */
  maxHp: number;
  /** Recent-hit flash counter. 0 = idle. Identical semantics to Agent.damageTicks. */
  damageTicks: number;
  /** While > 0, turret is cracked/broken: no targeting, no firing. Resets hp to maxHp*0.5 when it expires. */
  brokenTicks: number;
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
  task: TaskState;
  pulse: number;
  homeX: number;
  homeY: number;
  targetId: number | null;
  /** Current HP; drops on enemy contact. At 0, rebootTicks engages. */
  hp: number;
  /** Max HP; scales with scout + arsenal upgrades. */
  maxHp: number;
  /** Recent-hit flash counter. */
  damageTicks: number;
  /** While true, scout is retreating toward home to heal. */
  retreating: boolean;
  /** Ticks until the scout is redeployed after a destruction. 0 = active. */
  rebootTicks: number;
  /** Countdown in ticks while this scout is disabled by a zapper bolt. 0 = active. */
  disabledTicks: number;
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
  task: TaskState;
  pulse: number;
  homeX: number;
  homeY: number;
  targetId: number | null;
  /** Current HP; drops on damaging contact from specialized enemies. */
  hp: number;
  /** Max HP; scales with sentinel + shield upgrades. */
  maxHp: number;
  /** Recent-hit flash counter. */
  damageTicks: number;
  /** While true, sentinel is retreating toward home to heal. */
  retreating: boolean;
  /** Ticks until the sentinel is redeployed after a destruction. 0 = active. */
  rebootTicks: number;
  /** Countdown in ticks while this sentinel is disabled by a zapper bolt. 0 = active. */
  disabledTicks: number;
};

/** Long-range missile launcher, deployed per missileLauncher upgrade level. Independent from turrets. */
export type MissileSilo = {
  id: number;
  x: number;
  y: number;
  cooldown: number;
  angle: number;
  targetId: number | null;
  /** Whether this silo slot is currently deployed by the missileLauncher upgrade level. */
  active: boolean;
};

/** Home district structural state. Damage modulates energy production and city visuals. */
export type CityState = {
  hp: number;
  maxHp: number;
  damageTicks: number;
  /** Last tick at which any enemy was within regen-safe radius of the home district. */
  lastHostileTick: number;
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
  /**
   * 3.0.0 — which class of entity `targetId` refers to. Workers are still the
   * default ("agent"), but enemies may pivot toward turrets, sentinels,
   * scouts, or the home district based on ENEMY_TARGET_PRIORITY. The "city"
   * kind uses targetId=null because the city is not an id'd entity.
   */
  targetKind: "agent" | "turret" | "sentinel" | "scout" | "city";
  targetNodeId: number | null;
  flash: number;
  corruptTicks: number;
  cloakTicks?: number;
  /**
   * 3.1.0 — when true, this enemy is cloaked every tick regardless of
   * cloakTicks/cycle. Set at spawn for wardens (ghosts that infiltrate
   * workers) so turrets, sentinels, scouts, and missile silos can't see
   * them. Workers can still damage wardens through melee retaliation
   * during attach, which is the intended counter-play.
   */
  permanentCloak?: boolean;
  /**
   * 3.1.5 — id of the worker this warden has latched onto as a parasite.
   * While set, the warden is pinned to the worker's position, its movement
   * logic is skipped, and `isCloaked` treats it as visible so defenses can
   * shoot it off before corruption completes. Cleared when the worker dies,
   * reboots, becomes corrupted, or the warden itself dies.
   */
  latchedWorkerId?: number | null;
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
  /** Zapper-bolt disables agents, turrets, scouts, and sentinels; turret-missile targets enemies. */
  targetKind?: "agent" | "turret" | "scout" | "sentinel";
  /** Homing missile velocity (unit vector). */
  vx?: number;
  vy?: number;
  /** Movement speed in px/tick for turret-missile. */
  speed?: number;
  /** Homing correction fraction per tick. Defaults to TURRET.missileSteering when absent. */
  steering?: number;
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
  wardensKilled: number;
  sentinelKills: number;
  blocked: number;
  corruptions: number;
  purges: number;
  corruptedPurified: number;
  /** Running ticks with 3+ corrupted workers simultaneously — resets if count drops below 3. */
  corruptedWorkerOutbreakTicks: number;
  turretsBroken: number;
  eventsExperienced: string[];
  eventTagsInspected: string[];
  touristClicks: number;
  touristPassesClicked: number;
  runtimeMs: number;
  /**
   * 4.0 — running count of CONTINUOUS ticks with master autobuy off. Drives
   * `autobuy_off_milestone`; reset to 0 in `stepAchievements` the moment autobuy
   * is re-enabled. Migration backfills `?? 0`.
   */
  autobuyOffTicks: number;
};

/**
 * 4.0 — persisted first-run / onboarding flags. A small bag so future one-shot
 * "seen this UI" markers can live here without another GameState field. Fresh
 * runs default `v4OnboardingSeen: false` (show the overlay); loaded pre-4.0
 * saves migrate to `true` (returning players skip it — identity preservation).
 */
export type GameMeta = {
  v4OnboardingSeen: boolean;
};

export type Timers = {
  tick: number;
  auto: number;
  event: number;
  enemy: number;
  bigEvent: number;
  /** Cooldown between warden spawns. Increments each tick; resets on spawn. */
  warden: number;
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
  /**
   * 4.0 — per-upgrade autobuy opt-in used when `upgradeAutoMaster` is `"custom"`.
   * A missing key resolves to `false` (not auto-bought). Ignored under `"all"` / `"none"`.
   */
  upgradeAutoFlags: Partial<Record<UpgradeKey, boolean>>;
  /**
   * 4.0 — master autobuy switch. `"all"` autobuys every eligible upgrade (the
   * pre-4.0 behavior; loaded 3.x saves migrate to this), `"none"` disables
   * autobuy entirely (fresh 4.0 saves default here — players buy manually), and
   * `"custom"` defers to `upgradeAutoFlags` per upgrade.
   */
  upgradeAutoMaster: "all" | "none" | "custom";
  /**
   * 4.0 — short-lived player "defense priority" flags. Each entry biases turret
   * target-scoring toward that enemy for a few seconds (§Enemy Target
   * Eligibility). A purely additive weight bias — it never overrides the
   * cloak/range/role eligibility filter that runs before scoring. Expired
   * entries are pruned each tick. Defaults to `[]` on migrate.
   */
  priorityMarks: { enemyId: number; expiresAt: number }[];
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
  missileSilos: MissileSilo[];
  enemies: Enemy[];
  projectiles: Projectile[];
  city: CityState;
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
  nextSiloId: number;
  frozenMissile: { id: number; x: number; y: number; ticks: number } | null;
  goldExplosion: { x: number; y: number; ticks: number; maxTicks: number } | null;
  workerDeathFlash: { x: number; y: number; ticks: number; maxTicks: number } | null;
  missileClickCooldown: number;
  /**
   * 3.2.2 — unified notification queue. Achievement unlocks and enemy
   * discoveries (plus future kinds) are pushed here via `pushNotification`.
   * `tickNotifications` decays the visible window each tick. See
   * `src/game/notifications.ts` for the discriminated union and helpers.
   */
  notifications: Notification[];
  archiveLog: LogEntry[];
  discoveredEnemies: Partial<Record<EnemyKind, number>>;
  /** 4.0 — persisted onboarding / first-run flags. See {@link GameMeta}. */
  meta: GameMeta;
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
  rawTier: number;
  label: string;
  spawnIntervalTicks: number;
  waveBudget: number;
  enemyCap: number;
  recoveryMode: boolean;
  recoveryStrength: number;
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
  activeMissileSilos: number;
  brokenTurrets: number;
  corruptedWorkers: number;
  cityIntegrity: number;
  hostilePressure: boolean;
  corruptionPressure: boolean;
  homeDevelopment: number;
  cityStage: number;
  cityProgress: number;
  cityBuildProgress: number;
  prestigeComboBonus: number;
  progression: ProgressionDirector;
};
