import { ENEMY_STATS, WORKERS_AT_HOME } from "@/game/balance";
import { WORLD_H, WORLD_W } from "@/game/constants";
import { Rng } from "@/game/rng";
import type {
  Agent,
  Enemy,
  EnemyKind,
  GameState,
  ResourceNode,
  Scout,
  Turret,
  VisibleResourceKey,
} from "@/game/types";
import { dist } from "@/game/utils";

const BIG_EVENT_TICK_MIN = 30 * 30;
const BIG_EVENT_TICK_MAX = 90 * 30;

function rollBigEventInterval(rng: Rng) {
  return Math.floor(BIG_EVENT_TICK_MIN + rng.next() * (BIG_EVENT_TICK_MAX - BIG_EVENT_TICK_MIN));
}

export function makeNode(rng: Rng, id: number, x: number, y: number, size: number): ResourceNode {
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
  };
}

export function respawnNode(rng: Rng, id: number, existing: ResourceNode[]): ResourceNode {
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

  return makeNode(rng, id, x, y, size);
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
  const homes = kinds.map((kind, index) => ({
    id: index + 1,
    homeX: WORKERS_AT_HOME[kind].x,
    homeY: WORKERS_AT_HOME[kind].y,
    speed: WORKERS_AT_HOME[kind].speed,
    kind,
    task: WORKERS_AT_HOME[kind].task,
  }));

  return homes.map((home, index) => ({
    id: home.id,
    x: home.homeX,
    y: home.homeY,
    tx: home.homeX,
    ty: home.homeY,
    homeX: home.homeX,
    homeY: home.homeY,
    speed: home.speed,
    kind: home.kind,
    target: index,
    swing: 0,
    task: home.task,
    hp: 100,
    maxHp: 100,
    panic: 0,
    evadeTicks: 0,
    evadeDx: 0,
    evadeDy: -1,
    damageTicks: 0,
  }));
}

export function makeTurrets(): Turret[] {
  return [
    { id: 1, x: 220, y: 540, range: 135, cooldown: 0, angle: -1.2 },
    { id: 2, x: 500, y: 540, range: 135, cooldown: 0, angle: -1.57 },
    { id: 3, x: 790, y: 540, range: 135, cooldown: 0, angle: -1.9 },
  ];
}

export function makeScouts(): Scout[] {
  return [
    {
      id: 1,
      x: 220,
      y: 575,
      tx: 220,
      ty: 575,
      speed: 0.98,
      cooldown: 0,
      angle: -1.25,
      task: "Standby",
      pulse: 0.2,
      homeX: 220,
      homeY: 575,
      targetId: null,
    },
    {
      id: 2,
      x: 500,
      y: 575,
      tx: 500,
      ty: 575,
      speed: 0.95,
      cooldown: 0,
      angle: -1.18,
      task: "Standby",
      pulse: 1.4,
      homeX: 500,
      homeY: 575,
      targetId: null,
    },
    {
      id: 3,
      x: 790,
      y: 575,
      tx: 790,
      ty: 575,
      speed: 1.02,
      cooldown: 0,
      angle: -1.03,
      task: "Standby",
      pulse: 2.2,
      homeX: 790,
      homeY: 575,
      targetId: null,
    },
    {
      id: 4,
      x: 355,
      y: 575,
      tx: 355,
      ty: 575,
      speed: 0.97,
      cooldown: 0,
      angle: -1.12,
      task: "Standby",
      pulse: 0.7,
      homeX: 355,
      homeY: 575,
      targetId: null,
    },
  ];
}

export function spawnEnemy(rng: Rng, id: number, wave = 0, forcedKind: EnemyKind | null = null): Enemy {
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
    targetNodeId: null,
    flash: 0,
    corruptTicks: 0,
    trail: [],
  };

  if (kind === "phantom") {
    enemy.cloakTicks = 0;
  }

  return enemy;
}

export function createInitialGameState(seed?: number): GameState {
  const citySeed = seed ?? Date.now();
  const rng = new Rng(citySeed);
  return {
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
    },
    log: [
      "Boot sequence complete.",
      "Auto-routing drones to resource field.",
      "Passive income stable.",
    ],
    combo: 1,
    level: 1,
    xp: 8,
    prestige: 0,
    nodes: makeNodes(rng),
    agents: makeAgents(),
    turrets: makeTurrets(),
    scouts: makeScouts(),
    enemies: [],
    projectiles: [],
    stats: {
      mined: 0,
      spent: 0,
      crits: 0,
      hostileKills: 0,
      blocked: 0,
      corruptions: 0,
      purges: 0,
    },
    timers: {
      tick: 0,
      auto: 0,
      event: 0,
      enemy: 0,
      bigEvent: 0,
    },
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
  };
}

export function cloneGameState(prev: GameState): GameState {
  return {
    ...prev,
    resources: { ...prev.resources },
    upgrades: { ...prev.upgrades },
    stats: { ...prev.stats },
    timers: { ...prev.timers },
    activeEvents: prev.activeEvents.map((event) => ({ ...event })),
    eventModifiers: { ...prev.eventModifiers },
    log: [...prev.log],
    nodes: prev.nodes.map((node) => ({ ...node })),
    agents: prev.agents.map((agent) => ({ ...agent })),
    turrets: prev.turrets.map((turret) => ({ ...turret })),
    scouts: prev.scouts.map((scout) => ({ ...scout })),
    enemies: prev.enemies.map((enemy) => ({
      ...enemy,
      trail: enemy.trail.map(([x, y]) => [x, y] as [number, number]),
    })),
    projectiles: prev.projectiles.map((projectile) => ({ ...projectile })),
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
  maxLife = 8
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
  });
}

// Tier 1 = strongly preferred, Tier 2 = acceptable, anything else = avoided
const WORKER_TIER1: Record<Agent["kind"], string[]> = {
  miner: ["gold"],
  runner: ["ore", "energy"],
  drone: ["gems", "energy"],
};
const WORKER_TIER2: Record<Agent["kind"], string[]> = {
  miner: ["ore"],
  runner: ["gold"],
  drone: [],
};

export function chooseWorkerTarget(state: GameState, agent: Agent) {
  if (!state.nodes.length) return null;

  const ranked = state.nodes
    .map((node) => {
      const d = dist(agent.x, agent.y, node.x, node.y);
      const hpFactor = node.hp / node.maxHp; // 1.0 = full, 0.0 = depleted

      // Distance + hp urgency: lower hp nodes score better (we want to harvest them before respawn)
      let score = d * 0.55 + hpFactor * 70;

      // Type preference — aggressive tiers
      if (WORKER_TIER1[agent.kind].includes(node.kind)) {
        score *= 0.45;
      } else if (WORKER_TIER2[agent.kind].includes(node.kind)) {
        score *= 0.78;
      } else {
        score *= 1.6; // strong penalty for off-type nodes
      }

      // Contested penalty: discourage piling on the same node as another worker
      const contested = state.agents.filter((a) => a.id !== agent.id && a.target === node.id).length;
      score += contested * 90;

      // Corruption: non-miners avoid heavily corrupted nodes
      if (node.corruption > 12) score *= agent.kind === "miner" ? 1.05 : 0.88;

      // Small deterministic jitter so identical situations still spread workers
      score += ((agent.id * 41 + node.id * 17) % 20);

      return { id: node.id, score };
    })
    .sort((a, b) => a.score - b.score);

  return ranked[0]?.id ?? state.nodes[0].id;
}
