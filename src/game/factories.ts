import { WORLD_H, WORLD_W } from "@/game/constants";
import type {
  Agent,
  Enemy,
  EnemyKind,
  GameState,
  ResourceNode,
  ResourceKey,
  Scout,
  Turret,
} from "@/game/types";
import { dist, pick, rand } from "@/game/utils";

export function makeNode(id: number, x: number, y: number, size: number): ResourceNode {
  const hp = rand(25, 80);
  return {
    id,
    kind: pick<ResourceKey>(["gold", "ore", "ore", "gems", "energy"]),
    x,
    y,
    size,
    hp,
    maxHp: hp,
    pulse: rand(0, Math.PI * 2),
    corruption: 0,
    corrupted: false,
    corruptedBy: null,
  };
}

export function respawnNode(id: number, existing: ResourceNode[]): ResourceNode {
  const GAP = 12;
  const MAX_ATTEMPTS = 60;
  let x = 0, y = 0, size = 0, attempts = 0;

  do {
    size = rand(18, 48);
    x = rand(80, WORLD_W - 80);
    y = rand(100, WORLD_H - 170);
    attempts++;
  } while (
    attempts < MAX_ATTEMPTS &&
    existing.some((n) => n.id !== id && dist(x, y, n.x, n.y) < size + n.size + GAP)
  );

  return makeNode(id, x, y, size);
}

export function makeNodes() {
  const GAP = 12;
  const MAX_ATTEMPTS = 60;
  const placed: ResourceNode[] = [];

  for (let index = 0; index < 14; index++) {
    let x = 0, y = 0, size = 0;
    let attempts = 0;

    do {
      size = rand(18, 48);
      x = rand(80, WORLD_W - 80);
      y = rand(100, WORLD_H - 170);
      attempts++;
    } while (
      attempts < MAX_ATTEMPTS &&
      placed.some((n) => dist(x, y, n.x, n.y) < size + n.size + GAP)
    );

    placed.push(makeNode(index, x, y, size));
  }

  return placed;
}

export function makeAgents(): Agent[] {
  const homes = [
    { id: 1, homeX: 160, homeY: 260, speed: 1.1, kind: "miner" as const, task: "Surveying" },
    { id: 2, homeX: 320, homeY: 440, speed: 1.28, kind: "runner" as const, task: "Hauling" },
    { id: 3, homeX: 700, homeY: 180, speed: 1.02, kind: "drone" as const, task: "Optimizing" },
  ];

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
    { id: 1, x: 220, y: 520, range: 135, cooldown: 0, angle: -1.2 },
    { id: 2, x: 500, y: 540, range: 135, cooldown: 0, angle: -1.57 },
    { id: 3, x: 790, y: 515, range: 135, cooldown: 0, angle: -1.9 },
  ];
}

export function makeScouts(): Scout[] {
  return [
    {
      id: 1,
      x: 150,
      y: 545,
      tx: 150,
      ty: 545,
      speed: 1.5,
      cooldown: 0,
      angle: -1.25,
      task: "Standby",
      pulse: 0.2,
      homeX: 150,
      homeY: 545,
      targetId: null,
    },
    {
      id: 2,
      x: 360,
      y: 555,
      tx: 360,
      ty: 555,
      speed: 1.46,
      cooldown: 0,
      angle: -1.18,
      task: "Standby",
      pulse: 1.4,
      homeX: 360,
      homeY: 555,
      targetId: null,
    },
    {
      id: 3,
      x: 640,
      y: 553,
      tx: 640,
      ty: 553,
      speed: 1.54,
      cooldown: 0,
      angle: -1.03,
      task: "Standby",
      pulse: 2.2,
      homeX: 640,
      homeY: 553,
      targetId: null,
    },
    {
      id: 4,
      x: 850,
      y: 545,
      tx: 850,
      ty: 545,
      speed: 1.5,
      cooldown: 0,
      angle: -0.92,
      task: "Standby",
      pulse: 3.1,
      homeX: 850,
      homeY: 545,
      targetId: null,
    },
  ];
}

export function spawnEnemy(id: number, wave = 0, forcedKind: EnemyKind | null = null): Enemy {
  const side = Math.random() < 0.5 ? "left" : "right";
  const x = side === "left" ? -30 : WORLD_W + 30;
  const y = rand(120, WORLD_H - 100);
  const kind = forcedKind ?? pick<EnemyKind>(["mite", "raider", "wisp"]);

  if (kind === "corruptor") {
    return {
      id,
      kind,
      role: "corruptor",
      x,
      y,
      hp: 52 + wave * 5,
      maxHp: 52 + wave * 5,
      speed: 1 + wave * 0.015,
      targetId: null,
      targetNodeId: null,
      flash: 0,
      corruptTicks: 0,
      trail: [],
    };
  }

  const hpBase = kind === "mite" ? 40 : kind === "raider" ? 65 : 30;
  const speedBase = kind === "mite" ? 1.1 : kind === "raider" ? 0.9 : 1.45;
  return {
    id,
    kind,
    role: "combat",
    x,
    y,
    hp: hpBase + wave * 6,
    maxHp: hpBase + wave * 6,
    speed: speedBase + wave * 0.02,
    targetId: null,
    targetNodeId: null,
    flash: 0,
    corruptTicks: 0,
    trail: [],
  };
}

export function createInitialGameState(): GameState {
  return {
    resources: { gold: 24, ore: 8, gems: 0, energy: 0 },
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
    nodes: makeNodes(),
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
    },
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
    log: [...prev.log],
    nodes: prev.nodes.map((node) => ({ ...node })),
    agents: prev.agents.map((agent) => ({ ...agent })),
    turrets: prev.turrets.map((turret) => ({ ...turret })),
    scouts: prev.scouts.map((scout) => ({ ...scout })),
    enemies: prev.enemies.map((enemy) => ({ ...enemy })),
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
