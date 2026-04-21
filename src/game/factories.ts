import { ENEMY_AI, ENEMY_ARCHETYPE, ENEMY_SHIELD, ENEMY_STATS, SENTINEL, TURRET, WORKERS_AT_HOME } from "@/game/balance";
import { WORLD_H, WORLD_W } from "@/game/constants";
import { Rng } from "@/game/rng";
import type {
  Agent,
  CityState,
  Enemy,
  EnemyKind,
  GameState,
  LogEntry,
  MissileSilo,
  ResourceNode,
  Scout,
  Sentinel,
  Turret,
  VisibleResourceKey,
} from "@/game/types";
import { dist } from "@/game/utils";

export const SCHEMA_VERSION = 7;

/**
 * Deterministic per-agent variance computed from the agent id. These are procedural
 * constants (stable per slot) — not simulation randomness — so they intentionally
 * do not consume the seeded Rng. Using a multiplicative hash keeps the three
 * derived values uncorrelated within the typical id range (1..20).
 */
function agentVariance(id: number): { speedMod: number; fearMod: number; harvestBias: number } {
  const base = (id * 2654435761) >>> 0;
  const u1 = (base >>> 0) / 0xffffffff;
  const u2 = ((base ^ 0x9e3779b9) >>> 0) / 0xffffffff;
  const u3 = ((base * 3 + 0xdeadbeef) >>> 0) / 0xffffffff;
  return {
    speedMod: 1 + (u1 * 2 - 1) * 0.12,
    fearMod: 1 + (u2 * 2 - 1) * 0.20,
    harvestBias: (u3 * 2 - 1) * 0.15,
  };
}

const BIG_EVENT_TICK_MIN = 30 * 30;
const BIG_EVENT_TICK_MAX = 90 * 30;

function rollBigEventInterval(rng: Rng) {
  return Math.floor(BIG_EVENT_TICK_MIN + rng.next() * (BIG_EVENT_TICK_MAX - BIG_EVENT_TICK_MIN));
}

export function makeNode(rng: Rng, id: number, x: number, y: number, size: number, currentTick = 0): ResourceNode {
  const hp = rng.range(25, 80);
  return {
    id,
    kind: rng.pick<VisibleResourceKey>(["gold", "ore", "ore", "gems", "energy"]),
    x,
    y,
    size,
    hp,
    maxHp: hp,
    pulse: rng.range(0, Math.PI * 2),
    corruption: 0,
    corrupted: false,
    corruptedBy: null,
    spawnTick: currentTick,
    workTicks: 0,
  };
}

export function respawnNode(rng: Rng, id: number, existing: ResourceNode[], currentTick = 0): ResourceNode {
  const GAP = 12;
  const MAX_ATTEMPTS = 60;
  let x = 0, y = 0, size = 0, attempts = 0;

  do {
    size = rng.range(18, 48);
    x = rng.range(80, WORLD_W - 80);
    y = rng.range(100, WORLD_H - 170);
    attempts++;
  } while (
    attempts < MAX_ATTEMPTS &&
    existing.some((n) => n.id !== id && dist(x, y, n.x, n.y) < size + n.size + GAP)
  );

  return makeNode(rng, id, x, y, size, currentTick);
}

export function makeNodes(rng: Rng) {
  const GAP = 12;
  const MAX_ATTEMPTS = 60;
  const placed: ResourceNode[] = [];

  for (let index = 0; index < 14; index++) {
    let x = 0, y = 0, size = 0;
    let attempts = 0;

    do {
      size = rng.range(18, 48);
      x = rng.range(80, WORLD_W - 80);
      y = rng.range(100, WORLD_H - 170);
      attempts++;
    } while (
      attempts < MAX_ATTEMPTS &&
      placed.some((n) => dist(x, y, n.x, n.y) < size + n.size + GAP)
    );

    placed.push(makeNode(rng, index, x, y, size));
  }

  return placed;
}

export function makeAgents(): Agent[] {
  const kinds = ["miner", "runner", "drone"] as const;
  const agents: Agent[] = [];
  let id = 1;
  for (const kind of kinds) {
    for (let slot = 0; slot < 3; slot++) {
      const agent = makeWorker(kind, id++, 0, slot, slot === 0);
      agents.push(agent);
    }
  }
  return agents;
}

export function makeWorker(kind: Agent["kind"], id: number, currentTick = 0, slot = 0, active = true): Agent {
  const home = WORKERS_AT_HOME[kind];
  const xOffset = (slot - 1) * 28;
  const homeX = home.x + xOffset;
  const homeY = home.y;
  const variance = agentVariance(id);

  return {
    id,
    x: homeX,
    y: homeY,
    tx: homeX,
    ty: homeY,
    homeX,
    homeY,
    speed: home.speed,
    kind,
    target: null,
    swing: 0,
    task: home.task,
    hp: 100,
    maxHp: 100,
    panic: 0,
    evadeTicks: 0,
    evadeDx: 0,
    evadeDy: -1,
    damageTicks: 0,
    killsNearby: 0,
    veteranRank: 0,
    spawnTick: currentTick,
    disabledTicks: 0,
    active,
    threatMemory: 0,
    speedMod: variance.speedMod,
    fearMod: variance.fearMod,
    harvestBias: variance.harvestBias,
    overclockTicks: 0,
    sprintTicks: 0,
    sprintCooldown: 0,
    corrupted: false,
    corruptionTicks: 0,
    corruptingTicks: 0,
    spottedTicks: 0,
    rebootTicks: 0,
  };
}

/** Initial turret HP — final tuning comes with the break-state step. */
const TURRET_HP_DEFAULT = 120;

export function makeTurrets(): Turret[] {
  const hp = TURRET_HP_DEFAULT;
  return [
    { id: 1, x: 220, y: 540, range: 135, cooldown: 0, angle: -1.2, disabledTicks: 0, hp, maxHp: hp, damageTicks: 0, brokenTicks: 0 },
    { id: 2, x: 500, y: 540, range: 135, cooldown: 0, angle: -1.57, disabledTicks: 0, hp, maxHp: hp, damageTicks: 0, brokenTicks: 0 },
    { id: 3, x: 790, y: 540, range: 135, cooldown: 0, angle: -1.9, disabledTicks: 0, hp, maxHp: hp, damageTicks: 0, brokenTicks: 0 },
  ];
}

/** Initial scout HP — final tuning comes with the retreat/heal step. */
const SCOUT_HP_DEFAULT = 45;

function makeScout(
  id: number,
  x: number,
  y: number,
  speed: number,
  angle: number,
  pulse: number,
): Scout {
  return {
    id,
    x,
    y,
    tx: x,
    ty: y,
    speed,
    cooldown: 0,
    angle,
    task: "Standby",
    pulse,
    homeX: x,
    homeY: y,
    targetId: null,
    hp: SCOUT_HP_DEFAULT,
    maxHp: SCOUT_HP_DEFAULT,
    damageTicks: 0,
    retreating: false,
    rebootTicks: 0,
  };
}

export function makeScouts(): Scout[] {
  return [
    makeScout(1, 220, 575, 0.98, -1.25, 0.2),
    makeScout(2, 500, 575, 0.95, -1.18, 1.4),
    makeScout(3, 790, 575, 1.02, -1.03, 2.2),
    makeScout(4, 355, 575, 0.97, -1.12, 0.7),
  ];
}

/** Initial sentinel HP — final tuning comes with the retreat/heal step. */
const SENTINEL_HP_DEFAULT = 220;

function makeSentinel(id: number, x: number, y: number, speed: number): Sentinel {
  return {
    id,
    x,
    y,
    tx: x,
    ty: y,
    speed,
    cooldown: 0,
    angle: 0,
    task: "Standby",
    pulse: 0,
    homeX: x,
    homeY: y,
    targetId: null,
    hp: SENTINEL_HP_DEFAULT,
    maxHp: SENTINEL_HP_DEFAULT,
    damageTicks: 0,
    retreating: false,
    rebootTicks: 0,
  };
}

export function makeSentinels(): Sentinel[] {
  return [
    makeSentinel(1, 300, 500, SENTINEL.speedBase + 0.02),
    makeSentinel(2, 660, 500, SENTINEL.speedBase - 0.02),
  ];
}

/** Missile silo slot coordinates — wedged between turret pads at ground level. */
const MISSILE_SILO_LAYOUT: Array<{ x: number; y: number }> = [
  { x: 355, y: 560 },
  { x: 645, y: 560 },
  { x: 135, y: 560 },
  { x: 865, y: 560 },
];

export function makeMissileSilos(): MissileSilo[] {
  return MISSILE_SILO_LAYOUT.map((pos, index) => ({
    id: index + 1,
    x: pos.x,
    y: pos.y,
    cooldown: 0,
    angle: -Math.PI / 2,
    targetId: null,
    active: false,
  }));
}

/** Initial city HP — energy modulation math uses this via derived state. */
const CITY_HP_DEFAULT = 1000;

export function makeCityState(): CityState {
  return {
    hp: CITY_HP_DEFAULT,
    maxHp: CITY_HP_DEFAULT,
    damageTicks: 0,
    lastHostileTick: 0,
  };
}

export function spawnEnemy(rng: Rng, id: number, wave = 0, forcedKind: EnemyKind | null = null, currentTick = 0): Enemy {
  const side = rng.next() < 0.5 ? "left" : "right";
  const x = side === "left" ? -30 : WORLD_W + 30;
  const y = rng.range(120, WORLD_H - 100);
  const kind = forcedKind ?? rng.pick<EnemyKind>(["mite", "raider", "wisp"]);

  const stats = ENEMY_STATS[kind];
  const hp = stats.hpBase + wave * stats.hpWave;
  const speed = stats.speedBase + wave * stats.speedWave;
  const enemy: Enemy = {
    id,
    kind,
    role: kind === "corruptor" || kind === "blight" ? "corruptor" : "combat",
    x,
    y,
    hp,
    maxHp: hp,
    speed,
    targetId: null,
    targetKind: "agent",
    targetNodeId: null,
    flash: 0,
    corruptTicks: 0,
    trail: [],
    spawnTick: currentTick,
    dyingTicks: 0,
    archetype: ENEMY_ARCHETYPE[kind],
    squadId: Math.floor(currentTick / ENEMY_AI.squadBucketTicks),
  };

  if (kind === "phantom") {
    enemy.cloakTicks = 0;
  }

  if (kind === "zapper") {
    enemy.fireCooldown = 0;
  }

  if (kind === "sapper") {
    enemy.dashTicks = 0;
  }

  const shieldMax = ENEMY_SHIELD.shieldMax[kind];
  if (shieldMax !== undefined) {
    enemy.shield = shieldMax;
    enemy.shieldMax = shieldMax;
    enemy.shieldRegenCooldown = 0;
  }

  return enemy;
}

export function createInitialGameState(seed?: number): GameState {
  const citySeed = seed ?? Date.now();
  const rng = new Rng(citySeed);
  return {
    schemaVersion: SCHEMA_VERSION,
    citySeed,
    rng,
    resources: { gold: 24, ore: 8, gems: 0, energy: 0, cores: 0, flux: 0 },
    upgrades: {
      miner: 0,
      drill: 0,
      reactor: 0,
      bot: 0,
      turret: 0,
      shield: 0,
      scout: 0,
      arsenal: 0,
      foundry: 0,
      sentinel: 0,
      archive: 0,
      focusedBeam: 0,
      missileLauncher: 0,
    },
    log: [
      { tick: 0, category: "system" as const, message: "Passive income stable." },
      { tick: 0, category: "system" as const, message: "Auto-routing drones to resource field." },
      { tick: 0, category: "system" as const, message: "Boot sequence complete." },
    ] satisfies LogEntry[],
    combo: 1,
    level: 1,
    xp: 8,
    prestige: 0,
    achievements: {},
    nodes: makeNodes(rng),
    agents: makeAgents(),
    turrets: makeTurrets(),
    scouts: makeScouts(),
    sentinels: makeSentinels(),
    missileSilos: makeMissileSilos(),
    enemies: [],
    projectiles: [],
    city: makeCityState(),
    stats: {
      mined: 0,
      spent: 0,
      crits: 0,
      hostileKills: 0,
      totalEnemiesKilled: 0,
      brutesKilled: 0,
      phantomsKilled: 0,
      leechesKilled: 0,
      sappersKilled: 0,
      wardensKilled: 0,
      sentinelKills: 0,
      blocked: 0,
      corruptions: 0,
      purges: 0,
      corruptedPurified: 0,
      turretsBroken: 0,
      eventsExperienced: [],
      eventTagsInspected: [],
      touristClicks: 0,
      touristPassesClicked: 0,
      runtimeMs: 0,
    },
    timers: {
      tick: 0,
      auto: 0,
      event: 0,
      enemy: 0,
      bigEvent: 0,
    },
    touristWorker: null,
    lostDrone: null,
    lostWorkerFound: false,
    activeEvents: [],
    eventModifiers: {
      yieldMultiplier: 1,
      energyRate: 1,
      turretCooldownScale: 1,
      turretRangeScale: 1,
      enemySpeedScale: 1,
      corruptionRate: 1,
      fluxPurgeMultiplier: 1,
    },
    nextBigEventInterval: rollBigEventInterval(rng),
    nextNodeId: 14,
    nextEnemyId: 1,
    nextProjectileId: 1,
    nextSiloId: MISSILE_SILO_LAYOUT.length + 1,
    frozenMissile: null,
    goldExplosion: null,
    missileClickCooldown: 0,
  };
}

export function cloneGameState(prev: GameState): GameState {
  return {
    ...prev,
    resources: { ...prev.resources },
    upgrades: { ...prev.upgrades },
    achievements: { ...prev.achievements },
    stats: {
      ...prev.stats,
      eventsExperienced: [...prev.stats.eventsExperienced],
      eventTagsInspected: [...prev.stats.eventTagsInspected],
    },
    timers: { ...prev.timers },
    touristWorker: prev.touristWorker ? { ...prev.touristWorker } : null,
    lostDrone: prev.lostDrone ? { ...prev.lostDrone } : null,
    frozenMissile: prev.frozenMissile ? { ...prev.frozenMissile } : null,
    goldExplosion: prev.goldExplosion ? { ...prev.goldExplosion } : null,
    activeEvents: prev.activeEvents.map((event) => ({ ...event })),
    eventModifiers: { ...prev.eventModifiers },
    log: prev.log.map((entry) => ({ ...entry })),
    nodes: prev.nodes.map((node) => ({ ...node })),
    agents: prev.agents.map((agent) => ({ ...agent })),
    turrets: prev.turrets.map((turret) => ({ ...turret })),
    scouts: prev.scouts.map((scout) => ({ ...scout })),
    sentinels: prev.sentinels.map((sentinel) => ({ ...sentinel })),
    missileSilos: prev.missileSilos.map((silo) => ({ ...silo })),
    enemies: prev.enemies.map((enemy) => ({
      ...enemy,
      trail: enemy.trail.map(([x, y]) => [x, y] as [number, number]),
    })),
    projectiles: prev.projectiles.map((projectile) => ({ ...projectile })),
    city: { ...prev.city },
  };
}

type SerializedGameState = Partial<GameState> & {
  schemaVersion?: number;
  rng?: GameState["rng"] | { state?: number };
};

export function migrateGameState(raw: SerializedGameState): GameState {
  // v1 saves have no schemaVersion field; all fields are merged defensively below.
  const base = createInitialGameState(
    typeof raw.citySeed === "number" ? raw.citySeed : Date.now()
  );
  const rawRngState =
    typeof (raw as { rng?: { state?: number } }).rng?.state === "number"
      ? (raw as { rng?: { state?: number } }).rng?.state
      : undefined;

  return {
    ...base,
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    rng: rawRngState !== undefined ? Rng.fromState(rawRngState) : base.rng,
    resources: { ...base.resources, ...raw.resources },
    upgrades: { ...base.upgrades, ...raw.upgrades },
    achievements: { ...raw.achievements },
    stats: {
      ...base.stats,
      ...raw.stats,
      phantomsKilled: raw.stats?.phantomsKilled ?? 0,
      leechesKilled: raw.stats?.leechesKilled ?? 0,
      sappersKilled: raw.stats?.sappersKilled ?? 0,
      wardensKilled: raw.stats?.wardensKilled ?? 0,
      sentinelKills: raw.stats?.sentinelKills ?? 0,
      corruptedPurified: raw.stats?.corruptedPurified ?? 0,
      turretsBroken: raw.stats?.turretsBroken ?? 0,
      eventsExperienced: Array.isArray(raw.stats?.eventsExperienced)
        ? [...new Set(raw.stats.eventsExperienced.filter((value): value is string => typeof value === "string"))]
        : base.stats.eventsExperienced,
      eventTagsInspected: Array.isArray(raw.stats?.eventTagsInspected)
        ? [...new Set(raw.stats.eventTagsInspected.filter((value): value is string => typeof value === "string"))]
        : base.stats.eventTagsInspected,
      touristClicks: raw.stats?.touristClicks ?? 0,
      touristPassesClicked: raw.stats?.touristPassesClicked ?? 0,
    },
    timers: { ...base.timers, ...raw.timers },
    touristWorker: raw.touristWorker
      ? {
          x: raw.touristWorker.x ?? -30,
          y: raw.touristWorker.y ?? 300,
          angle: raw.touristWorker.angle ?? 0,
          active: raw.touristWorker.active ?? true,
          spotted: raw.touristWorker.spotted ?? false,
          passId: raw.touristWorker.passId ?? 1,
          lastClickedPassId: raw.touristWorker.lastClickedPassId ?? null,
          squishTicks: raw.touristWorker.squishTicks ?? 0,
        }
      : null,
    lostDrone: raw.lostDrone
      ? {
          x: raw.lostDrone.x ?? -42,
          y: raw.lostDrone.y ?? 300,
          baseY: raw.lostDrone.baseY ?? raw.lostDrone.y ?? 300,
          angle: raw.lostDrone.angle ?? 0,
          vx: raw.lostDrone.vx ?? 0.24,
          wobblePhase: raw.lostDrone.wobblePhase ?? 0,
          spawnTick: raw.lostDrone.spawnTick ?? 0,
        }
      : null,
    lostWorkerFound: raw.lostWorkerFound ?? false,
    frozenMissile: null,
    goldExplosion: null,
    missileClickCooldown: (raw as { missileClickCooldown?: number }).missileClickCooldown ?? 0,
    activeEvents: Array.isArray(raw.activeEvents)
      ? raw.activeEvents.map((event) => ({
          ...event,
          revertOnExpire: event.revertOnExpire ?? true,
        }))
      : base.activeEvents,
    eventModifiers: { ...base.eventModifiers, ...raw.eventModifiers },
    log: Array.isArray(raw.log)
      ? raw.log.map((entry) =>
          typeof entry === "string"
            ? ({ tick: 0, category: "system" as const, message: entry } satisfies LogEntry)
            : ({ tick: entry.tick ?? 0, category: entry.category ?? "ambient", message: entry.message ?? "" } satisfies LogEntry)
        )
      : base.log,
    nodes: Array.isArray(raw.nodes)
      ? raw.nodes.map((node) => ({
          ...node,
          spawnTick: node.spawnTick ?? 0,
          workTicks: node.workTicks ?? 0,
        }))
      : base.nodes,
    agents: Array.isArray(raw.agents)
      ? raw.agents.map((agent) => {
          const variance = agentVariance(agent.id);
          return {
            ...makeWorker(agent.kind, agent.id),
            ...agent,
            killsNearby: agent.killsNearby ?? 0,
            veteranRank: agent.veteranRank ?? 0,
            spawnTick: agent.spawnTick ?? 0,
            disabledTicks: agent.disabledTicks ?? 0,
            active: agent.active ?? true,
            threatMemory: agent.threatMemory ?? 0,
            speedMod: agent.speedMod ?? variance.speedMod,
            fearMod: agent.fearMod ?? variance.fearMod,
            harvestBias: agent.harvestBias ?? variance.harvestBias,
            overclockTicks: agent.overclockTicks ?? 0,
            sprintTicks: agent.sprintTicks ?? 0,
            sprintCooldown: agent.sprintCooldown ?? 0,
            corrupted: agent.corrupted ?? false,
            corruptionTicks: agent.corruptionTicks ?? 0,
            corruptingTicks: agent.corruptingTicks ?? 0,
            spottedTicks: agent.spottedTicks ?? 0,
            rebootTicks: agent.rebootTicks ?? 0,
          };
        })
      : base.agents,
    turrets: Array.isArray(raw.turrets)
      ? raw.turrets.map((turret) => ({
          ...turret,
          disabledTicks: turret.disabledTicks ?? 0,
          maxHp: turret.maxHp ?? TURRET_HP_DEFAULT,
          hp: turret.hp ?? turret.maxHp ?? TURRET_HP_DEFAULT,
          damageTicks: turret.damageTicks ?? 0,
          brokenTicks: turret.brokenTicks ?? 0,
        }))
      : base.turrets,
    scouts: Array.isArray(raw.scouts)
      ? raw.scouts.map((scout) => ({
          ...scout,
          maxHp: scout.maxHp ?? SCOUT_HP_DEFAULT,
          hp: scout.hp ?? scout.maxHp ?? SCOUT_HP_DEFAULT,
          damageTicks: scout.damageTicks ?? 0,
          retreating: scout.retreating ?? false,
          rebootTicks: scout.rebootTicks ?? 0,
        }))
      : base.scouts,
    sentinels: Array.isArray(raw.sentinels)
      ? raw.sentinels.map((sentinel) => ({
          ...sentinel,
          maxHp: sentinel.maxHp ?? SENTINEL_HP_DEFAULT,
          hp: sentinel.hp ?? sentinel.maxHp ?? SENTINEL_HP_DEFAULT,
          damageTicks: sentinel.damageTicks ?? 0,
          retreating: sentinel.retreating ?? false,
          rebootTicks: sentinel.rebootTicks ?? 0,
        }))
      : base.sentinels,
    missileSilos: Array.isArray(raw.missileSilos)
      ? raw.missileSilos.map((silo) => ({
          ...silo,
          active: silo.active ?? false,
          cooldown: silo.cooldown ?? 0,
          angle: silo.angle ?? -Math.PI / 2,
          targetId: silo.targetId ?? null,
        }))
      : base.missileSilos,
    city: raw.city
      ? {
          maxHp: raw.city.maxHp ?? CITY_HP_DEFAULT,
          hp: raw.city.hp ?? raw.city.maxHp ?? CITY_HP_DEFAULT,
          damageTicks: raw.city.damageTicks ?? 0,
          lastHostileTick: raw.city.lastHostileTick ?? 0,
        }
      : base.city,
    nextSiloId: (raw as { nextSiloId?: number }).nextSiloId ?? base.nextSiloId,
    enemies: Array.isArray(raw.enemies)
      ? raw.enemies.map((enemy) => {
          const shieldMax = ENEMY_SHIELD.shieldMax[enemy.kind as import("@/game/types").EnemyKind];
          const kind = enemy.kind as import("@/game/types").EnemyKind;
          return {
            ...enemy,
            trail: Array.isArray(enemy.trail) ? enemy.trail.map(([x, y]) => [x, y] as [number, number]) : [],
            spawnTick: enemy.spawnTick ?? 0,
            dyingTicks: enemy.dyingTicks ?? 0,
            archetype: enemy.archetype ?? ENEMY_ARCHETYPE[kind],
            squadId: enemy.squadId ?? Math.floor((enemy.spawnTick ?? 0) / ENEMY_AI.squadBucketTicks),
            // 3.0.0 Step 4 — pre-targetKind saves default to worker targeting.
            targetKind: enemy.targetKind ?? "agent",
            ...(kind === "sapper" && { dashTicks: enemy.dashTicks ?? 0 }),
            // Shield fields: fall back to full shield for enemies that have one,
            // so mid-combat saves from before shields existed don't start at 0.
            ...(shieldMax !== undefined && {
              shield: enemy.shield ?? shieldMax,
              shieldMax: enemy.shieldMax ?? shieldMax,
              shieldRegenCooldown: enemy.shieldRegenCooldown ?? 0,
            }),
          };
        })
      : base.enemies,
    projectiles: Array.isArray(raw.projectiles)
      ? raw.projectiles.map((projectile) => ({ ...projectile }))
      : base.projectiles,
  };
}

export function addProjectile(
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  width = 2,
  maxLife = 8,
  tag?: import("@/game/types").Projectile["tag"],
  targetId?: number,
  targetKind?: import("@/game/types").Projectile["targetKind"]
) {
  state.projectiles.push({
    id: state.nextProjectileId++,
    x1: fromX,
    y1: fromY,
    x2: toX,
    y2: toY,
    life: maxLife,
    maxLife,
    color,
    width,
    ...(tag !== undefined && { tag }),
    ...(targetId !== undefined && { targetId }),
    ...(targetKind !== undefined && { targetKind }),
  });
}

export function addMissile(
  state: GameState,
  fromX: number,
  fromY: number,
  vx: number,
  vy: number,
  targetId: number,
  damage: number,
  opts?: { speed?: number; maxLife?: number; steering?: number; color?: string }
) {
  const maxLife = opts?.maxLife ?? TURRET.missileMaxLife;
  state.projectiles.push({
    id: state.nextProjectileId++,
    x1: fromX,
    y1: fromY,
    x2: fromX,
    y2: fromY,
    life: maxLife,
    maxLife,
    color: opts?.color ?? "rgba(255, 140, 0, 0.95)",
    width: 3,
    tag: "turret-missile",
    targetId,
    vx,
    vy,
    speed: opts?.speed ?? TURRET.missileSpeed,
    ...(opts?.steering !== undefined && { steering: opts.steering }),
    damage,
  });
}

