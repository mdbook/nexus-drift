import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  Bot,
  Coins,
  Cpu,
  Crosshair,
  Gem,
  Hammer,
  Pickaxe,
  Radar,
  Shield,
  Swords,
  TrendingUp,
  Zap,
} from "lucide-react";

const TICK_MS = 33;
const WORLD_W = 1000;
const WORLD_H = 620;
const MAX_LOG = 6;

const EVADE_ENTER_RADIUS = 92;
const EVADE_EXIT_RADIUS = 150;
const EVADE_PERSIST_TICKS = 48;
const EVADE_BONUS_PER_THREAT = 10;

const MINING_TICK = 21;
const COMBAT_TICK = 12;
const AUTO_TICK = 39;
const EVENT_TICK = 145;
const TICK_WRAP = 10_000_000;

const CORRUPTIBLE_KINDS = ["ore", "gems", "energy"];
const WORK_TASKS = {
  miner: "Mining",
  runner: "Collecting",
  drone: "Syncing",
};

const WORKER_KIND_PREFERENCES = {
  miner: ["gold", "ore", "ore", "gold"],
  runner: ["ore", "energy", "gold", "gems"],
  drone: ["gems", "energy", "ore", "energy"],
};

const panelClass =
  "rounded-[28px] border border-white/10 bg-slate-950/60 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl";

const resourceDefs = [
  {
    key: "gold",
    label: "Gold",
    icon: Coins,
    tint: "rgba(255, 220, 110, 0.95)",
    glow: "rgba(255, 220, 110, 0.28)",
  },
  {
    key: "ore",
    label: "Ore",
    icon: Pickaxe,
    tint: "rgba(170, 210, 255, 0.95)",
    glow: "rgba(170, 210, 255, 0.24)",
  },
  {
    key: "gems",
    label: "Gems",
    icon: Gem,
    tint: "rgba(120, 255, 220, 0.95)",
    glow: "rgba(120, 255, 220, 0.22)",
  },
  {
    key: "energy",
    label: "Energy",
    icon: Zap,
    tint: "rgba(150, 255, 160, 0.95)",
    glow: "rgba(150, 255, 160, 0.22)",
  },
];

const upgradeDefs = [
  {
    key: "miner",
    label: "Auto Miner",
    icon: Pickaxe,
    baseCost: 12,
    growth: 1.18,
    effectText: "+ Gold + Ore",
  },
  {
    key: "drill",
    label: "Deep Drill",
    icon: Hammer,
    baseCost: 80,
    growth: 1.22,
    effectText: "+ Ore + Gems",
  },
  {
    key: "reactor",
    label: "Reactor",
    icon: Cpu,
    baseCost: 240,
    growth: 1.25,
    effectText: "+ Energy + turrets",
  },
  {
    key: "bot",
    label: "Ops Bot",
    icon: Bot,
    baseCost: 1100,
    growth: 1.3,
    effectText: "Smarter autobuy",
  },
  {
    key: "turret",
    label: "Defense Turret",
    icon: Crosshair,
    baseCost: 180,
    growth: 1.23,
    effectText: "Perimeter defense",
  },
  {
    key: "shield",
    label: "Shield Grid",
    icon: Shield,
    baseCost: 420,
    growth: 1.26,
    effectText: "Worker mitigation",
  },
  {
    key: "scout",
    label: "Assault Scout",
    icon: Radar,
    baseCost: 280,
    growth: 1.24,
    effectText: "Hunts corrupters",
  },
  {
    key: "arsenal",
    label: "Scout Arsenal",
    icon: Swords,
    baseCost: 540,
    growth: 1.27,
    effectText: "Purge damage + cleanse",
  },
];

const NODE_STYLE = {
  gold: {
    fill: "rgba(255, 212, 102, 0.18)",
    core: "rgba(255, 232, 178, 0.88)",
    stroke: "rgba(255, 222, 145, 0.65)",
    glow: "rgba(255, 214, 100, 0.22)",
    label: "rgba(255, 239, 191, 0.95)",
  },
  ore: {
    fill: "rgba(150, 190, 255, 0.18)",
    core: "rgba(215, 232, 255, 0.84)",
    stroke: "rgba(186, 216, 255, 0.55)",
    glow: "rgba(150, 190, 255, 0.2)",
    label: "rgba(226, 238, 255, 0.95)",
  },
  gems: {
    fill: "rgba(120, 255, 220, 0.16)",
    core: "rgba(205, 255, 242, 0.9)",
    stroke: "rgba(145, 255, 226, 0.55)",
    glow: "rgba(120, 255, 220, 0.18)",
    label: "rgba(214, 255, 246, 0.95)",
  },
  energy: {
    fill: "rgba(136, 255, 156, 0.16)",
    core: "rgba(212, 255, 220, 0.86)",
    stroke: "rgba(154, 255, 171, 0.55)",
    glow: "rgba(136, 255, 156, 0.18)",
    label: "rgba(224, 255, 230, 0.95)",
  },
};

const ENEMY_STYLE = {
  mite: {
    fill: "rgba(255, 145, 110, 0.78)",
    glow: "rgba(255, 95, 70, 0.14)",
    stroke: "rgba(255, 220, 210, 0.58)",
    radius: 12,
  },
  raider: {
    fill: "rgba(255, 110, 120, 0.8)",
    glow: "rgba(255, 70, 90, 0.16)",
    stroke: "rgba(255, 215, 220, 0.58)",
    radius: 16,
  },
  wisp: {
    fill: "rgba(130, 205, 255, 0.78)",
    glow: "rgba(110, 180, 255, 0.16)",
    stroke: "rgba(215, 240, 255, 0.58)",
    radius: 10,
  },
};

const AGENT_STYLE = {
  miner: "rgba(255, 221, 154, 0.95)",
  runner: "rgba(145, 225, 255, 0.95)",
  drone: "rgba(194, 255, 220, 0.95)",
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const chance = (n) => Math.random() < n;

function normalize(dx, dy, fallbackX = 0, fallbackY = -1) {
  const magnitude = Math.hypot(dx, dy);
  if (magnitude < 0.001) {
    const fallbackMagnitude = Math.max(0.001, Math.hypot(fallbackX, fallbackY));
    return {
      x: fallbackX / fallbackMagnitude,
      y: fallbackY / fallbackMagnitude,
    };
  }
  return {
    x: dx / magnitude,
    y: dy / magnitude,
  };
}

function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
  const units = ["K", "M", "B", "T", "Qa", "Qi"];
  let value = n;
  let index = -1;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000;
    index += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)}${units[index]}`;
}

function pushLog(log, message) {
  return [message, ...log].slice(0, MAX_LOG);
}

function nextUpgradeCost(def, level) {
  return Math.floor(def.baseCost * Math.pow(def.growth, level));
}

function makeStars(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: rand(0, 100),
    y: rand(0, 100),
    size: rand(1, 3),
    opacity: rand(0.2, 0.95),
  }));
}

function makeNode(id) {
  const hp = rand(25, 80);
  return {
    id,
    kind: pick(["gold", "ore", "ore", "gems", "energy"]),
    x: rand(80, WORLD_W - 80),
    y: rand(100, WORLD_H - 170),
    size: rand(18, 48),
    hp,
    maxHp: hp,
    pulse: rand(0, Math.PI * 2),
    corruption: 0,
    corrupted: false,
    corruptedBy: null,
  };
}

function makeNodes() {
  return Array.from({ length: 14 }, (_, index) => makeNode(index));
}

function makeAgents() {
  const homes = [
    { id: 1, homeX: 160, homeY: 260, speed: 1.1, kind: "miner", task: "Surveying" },
    { id: 2, homeX: 320, homeY: 440, speed: 1.28, kind: "runner", task: "Hauling" },
    { id: 3, homeX: 700, homeY: 180, speed: 1.02, kind: "drone", task: "Optimizing" },
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

function makeTurrets() {
  return [
    { id: 1, x: 220, y: 520, range: 135, cooldown: 0, angle: -1.2 },
    { id: 2, x: 500, y: 540, range: 135, cooldown: 0, angle: -1.57 },
    { id: 3, x: 790, y: 515, range: 135, cooldown: 0, angle: -1.9 },
  ];
}

function makeScouts() {
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

function spawnEnemy(id, wave = 0, forcedKind = null) {
  const side = Math.random() < 0.5 ? "left" : "right";
  const x = side === "left" ? -30 : WORLD_W + 30;
  const y = rand(120, WORLD_H - 100);
  const kind = forcedKind ?? pick(["mite", "raider", "wisp"]);

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
  };
}

function createInitialGameState() {
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

function cloneGameState(prev) {
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

function addProjectile(state, fromX, fromY, toX, toY, color, width = 2, maxLife = 8) {
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

function chooseWorkerTarget(state, agent, index) {
  if (!state.nodes.length) return null;
  const preferredKinds = new Set(WORKER_KIND_PREFERENCES[agent.kind] ?? resourceDefs.map((item) => item.key));

  const ranked = state.nodes
    .map((node) => {
      let score = dist(agent.x, agent.y, node.x, node.y);
      if (preferredKinds.has(node.kind)) score *= 0.76;
      if (node.corruption > 12) score *= agent.kind === "miner" ? 1.04 : 0.82;
      if (node.corrupted) score *= agent.kind === "miner" ? 1.08 : 0.78;
      if (agent.hp < 50) score += dist(agent.homeX, agent.homeY, node.x, node.y) * 0.2;
      score += ((index + 1) * 13 + node.id * 17 + state.timers.tick) % 29;
      return { id: node.id, score };
    })
    .sort((a, b) => a.score - b.score);

  return ranked[0]?.id ?? state.nodes[0].id;
}

function computeDerived(state) {
  const p = 1 + state.prestige * 0.12;
  const combatThreats = state.enemies.filter((enemy) => enemy.role !== "corruptor").length;
  const corruptorCount = state.enemies.filter((enemy) => enemy.role === "corruptor").length;
  const corruptedByType = { ore: 0, gems: 0, energy: 0 };

  state.nodes.forEach((node) => {
    if (node.corrupted && corruptedByType[node.kind] != null) {
      corruptedByType[node.kind] += 1;
    }
  });

  const threatPenalty = Math.max(0.6, 1 - combatThreats * 0.025 + state.upgrades.shield * 0.015);
  const corruptionPenalty = {
    ore: Math.max(0.25, 1 - corruptedByType.ore * 0.18),
    gems: Math.max(0.2, 1 - corruptedByType.gems * 0.22),
    energy: Math.max(0.2, 1 - corruptedByType.energy * 0.2),
  };

  const rates = {
    gold: (1 + state.upgrades.miner * 0.9 + state.upgrades.drill * 0.1) * p * threatPenalty,
    ore:
      (0.4 + state.upgrades.miner * 0.35 + state.upgrades.drill * 1.0) *
      p *
      threatPenalty *
      corruptionPenalty.ore,
    gems:
      (0.02 + state.upgrades.drill * 0.08 + state.upgrades.reactor * 0.02) *
      p *
      corruptionPenalty.gems,
    energy:
      (0.03 + state.upgrades.reactor * 0.25 + state.upgrades.shield * 0.04) *
      p *
      corruptionPenalty.energy,
  };

  const totalIncome = rates.gold + rates.ore * 2 + rates.gems * 18 + rates.energy * 12;
  const targetXp = 80 + state.level * 25;
  const defenseScore =
    state.upgrades.turret * 1.4 +
    state.upgrades.shield * 1.9 +
    state.upgrades.scout * 1.6 +
    state.upgrades.arsenal * 1.2;
  const threatScore =
    combatThreats + corruptorCount * 1.3 + corruptedByType.ore + corruptedByType.gems + corruptedByType.energy;
  const colonyHealth = state.agents.length
    ? state.agents.reduce((sum, agent) => sum + agent.hp, 0) / state.agents.length
    : 100;
  const corruptedNodes = state.nodes.filter((node) => node.corrupted).length;
  const activeTurrets = Math.max(1, Math.min(state.turrets.length, 1 + state.upgrades.turret));
  const activeScouts = Math.min(state.scouts.length, state.upgrades.scout);
  const hostilePressure = combatThreats >= 4 || colonyHealth < 72;
  const corruptionPressure = corruptorCount > 0 || corruptedNodes > 0;

  return {
    rates,
    totalIncome,
    targetXp,
    defenseScore,
    threatScore,
    colonyHealth,
    corruptedByType,
    corruptorCount,
    corruptedNodes,
    combatThreats,
    activeTurrets,
    activeScouts,
    hostilePressure,
    corruptionPressure,
  };
}

function stepEconomy(state) {
  const derived = computeDerived(state);

  Object.keys(state.resources).forEach((key) => {
    state.resources[key] += derived.rates[key] * (TICK_MS / 1000);
  });

  state.xp +=
    (0.6 +
      state.upgrades.reactor * 0.08 +
      state.prestige * 0.05 +
      state.upgrades.turret * 0.015 +
      state.upgrades.scout * 0.018) *
    (TICK_MS / 1000) *
    12;

  while (state.xp >= 80 + state.level * 25) {
    state.xp -= 80 + state.level * 25;
    state.level += 1;
    state.combo = clamp(state.combo + 0.15, 1, 9.9);
    state.log = pushLog(state.log, `Sector level up -> ${state.level}`);
  }
}

function stepSpawns(state) {
  const spawnThreshold = Math.max(80, 220 - state.level * 2 - state.upgrades.bot * 6);
  if (state.timers.enemy < spawnThreshold) return;

  state.timers.enemy = 0;
  if (state.enemies.length > 10 + state.upgrades.turret + state.upgrades.scout) return;

  const wave = Math.floor(state.level / 3) + state.prestige;
  const corruptibleNodes = state.nodes.filter((node) => CORRUPTIBLE_KINDS.includes(node.kind));
  const existingCorruptors = state.enemies.filter((enemy) => enemy.role === "corruptor").length;
  const shouldSpawnCorruptor =
    corruptibleNodes.length > 0 &&
    state.level >= 3 &&
    existingCorruptors < Math.max(1, Math.ceil(state.level / 8)) &&
    chance(clamp(0.2 + state.level * 0.004, 0.2, 0.45));

  if (shouldSpawnCorruptor) {
    state.enemies.push(spawnEnemy(state.nextEnemyId++, wave, "corruptor"));
    state.log = pushLog(state.log, "Toxic corrupter drifting toward resource lanes.");
    return;
  }

  const count = chance(0.22 + state.level * 0.003) ? 2 : 1;
  for (let index = 0; index < count; index += 1) {
    state.enemies.push(spawnEnemy(state.nextEnemyId++, wave));
  }
  state.log = pushLog(state.log, "Hostile contact detected on perimeter.");
}

function stepWorkers(state) {
  if (!state.nodes.length) return;
  const combatEnemies = state.enemies.filter((enemy) => enemy.role !== "corruptor");

  state.agents.forEach((agent, index) => {
    const needsTarget =
      agent.target == null ||
      !state.nodes.some((node) => node.id === agent.target) ||
      state.timers.tick % (210 + index * 30) === 0;

    if (needsTarget) {
      agent.target = chooseWorkerTarget(state, agent, index);
    }

    const node =
      state.nodes.find((candidate) => candidate.id === agent.target) ??
      state.nodes[index % state.nodes.length];

    const threatRadius = agent.evadeTicks > 0 ? EVADE_EXIT_RADIUS : EVADE_ENTER_RADIUS;
    const evadeThreats = combatEnemies
      .map((enemy) => {
        const d = dist(enemy.x, enemy.y, agent.x, agent.y);
        return d < threatRadius ? { enemy, d } : null;
      })
      .filter(Boolean);

    if (evadeThreats.length > 0) {
      let vx = 0;
      let vy = 0;

      evadeThreats.forEach(({ enemy, d }) => {
        const dx = agent.x - enemy.x;
        const dy = agent.y - enemy.y;
        const weight = 1 / Math.max(36, d * d);
        vx += dx * weight;
        vy += dy * weight;
      });

      const nextDirection = normalize(vx, vy, agent.evadeDx, agent.evadeDy);
      const blendedDirection = normalize(
        agent.evadeDx * 0.45 + nextDirection.x * 0.55,
        agent.evadeDy * 0.45 + nextDirection.y * 0.55,
        nextDirection.x,
        nextDirection.y
      );

      agent.evadeDx = blendedDirection.x;
      agent.evadeDy = blendedDirection.y;
      agent.evadeTicks = Math.max(
        agent.evadeTicks,
        EVADE_PERSIST_TICKS + Math.max(0, evadeThreats.length - 1) * EVADE_BONUS_PER_THREAT
      );
    } else if (agent.evadeTicks > 0) {
      agent.evadeTicks -= 1;
    }

    if (agent.evadeTicks > 0) {
      const evadeSpeed = agent.speed * (1.1 + Math.min(0.18, agent.panic / 180));
      agent.x = clamp(agent.x + agent.evadeDx * evadeSpeed, 20, WORLD_W - 20);
      agent.y = clamp(agent.y + agent.evadeDy * evadeSpeed, 50, WORLD_H - 32);
      agent.tx = clamp(agent.x + agent.evadeDx * 84, 20, WORLD_W - 20);
      agent.ty = clamp(agent.y + agent.evadeDy * 84, 50, WORLD_H - 32);
      agent.swing = 0;
      agent.task = "Evading";
      agent.panic = clamp(agent.panic + (evadeThreats.length > 0 ? 1.8 : 0.75), 0, 100);
      agent.hp = clamp(agent.hp + 0.006 + state.upgrades.shield * 0.004, 0, agent.maxHp);
      agent.damageTicks = Math.max(0, agent.damageTicks - 1);
      return;
    }

    const recovering = agent.damageTicks > 0 && agent.hp < agent.maxHp * 0.6;
    const destination = recovering
      ? { x: agent.homeX, y: agent.homeY, size: 18, corrupted: false }
      : node;

    const dx = destination.x - agent.x;
    const dy = destination.y - agent.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const workRadius = recovering ? 22 : clamp(destination.size * 0.45, 16, 24);

    if (d <= workRadius) {
      agent.tx = destination.x;
      agent.ty = destination.y;
      agent.swing = recovering ? 0 : (agent.swing + 1) % 24;
      agent.task = recovering
        ? "Recovering"
        : destination.corrupted
          ? "Purging residue"
          : WORK_TASKS[agent.kind] ?? "Working";
      agent.panic = clamp(agent.panic - (recovering ? 3.2 : 2.1), 0, 100);
      agent.hp = clamp(
        agent.hp + (recovering ? 0.08 : 0.028) + state.upgrades.shield * (recovering ? 0.015 : 0.01),
        0,
        agent.maxHp
      );
      agent.damageTicks = Math.max(0, agent.damageTicks - 1);
      return;
    }

    const speedMultiplier = recovering ? 0.66 : agent.damageTicks > 0 ? 0.66 : 0.74;
    agent.x += (dx / d) * agent.speed * speedMultiplier;
    agent.y += (dy / d) * agent.speed * speedMultiplier;
    agent.tx = destination.x;
    agent.ty = destination.y;
    agent.swing = 0;
    agent.task = recovering ? "Recovering" : "Traversing";
    agent.panic = clamp(agent.panic - (recovering ? 1.8 : 1.2), 0, 100);
    agent.hp = clamp(agent.hp + 0.014 + state.upgrades.shield * 0.006, 0, agent.maxHp);
    agent.damageTicks = Math.max(0, agent.damageTicks - 1);
  });
}

function stepEnemies(state) {
  state.enemies.forEach((enemy) => {
    enemy.flash = Math.max(0, enemy.flash - 1);

    if (enemy.role === "corruptor") {
      const targetableNodes = state.nodes.filter((node) => CORRUPTIBLE_KINDS.includes(node.kind));
      const currentNode = targetableNodes.find((node) => node.id === enemy.targetNodeId);
      const shouldRetarget =
        !currentNode ||
        (currentNode.corruption >= 100 &&
          targetableNodes.some((node) => node.id !== currentNode.id && node.corruption < 95));

      const preferredNode =
        (!shouldRetarget && currentNode) ||
        [...targetableNodes].sort((a, b) => {
          const corruptionDelta = a.corruption - b.corruption;
          if (corruptionDelta !== 0) return corruptionDelta;
          return dist(a.x, a.y, enemy.x, enemy.y) - dist(b.x, b.y, enemy.x, enemy.y);
        })[0];

      if (!preferredNode) return;

      enemy.targetNodeId = preferredNode.id;
      const dx = preferredNode.x - enemy.x;
      const dy = preferredNode.y - enemy.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const contactRadius = preferredNode.size + 8;

      if (d <= contactRadius) {
        enemy.corruptTicks += 1;
        preferredNode.corruption = clamp(preferredNode.corruption + 0.65 + state.level * 0.01, 0, 100);
        preferredNode.corruptedBy = enemy.id;
        enemy.x += Math.cos((state.timers.tick + enemy.id * 11) / 12) * 0.12;
        enemy.y += Math.sin((state.timers.tick + enemy.id * 7) / 12) * 0.12;

        if (preferredNode.corruption >= 100 && !preferredNode.corrupted) {
          preferredNode.corrupted = true;
          state.stats.corruptions += 1;
          state.log = pushLog(state.log, `${preferredNode.kind} node fully corrupted. Gross.`);
        }
        return;
      }

      enemy.x += (dx / d) * enemy.speed * 0.56;
      enemy.y += (dy / d) * enemy.speed * 0.56;
      return;
    }

    const target = [...state.agents].sort(
      (a, b) => dist(a.x, a.y, enemy.x, enemy.y) - dist(b.x, b.y, enemy.x, enemy.y)
    )[0];

    if (!target) return;

    enemy.targetId = target.id;
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const d = Math.max(1, Math.hypot(dx, dy));

    if (d > 18) {
      enemy.x += (dx / d) * enemy.speed * 0.561;
      enemy.y += (dy / d) * enemy.speed * 0.561;
      const strafe = Math.sin((state.timers.tick + enemy.id * 13) / 14) * 0.18;
      enemy.x += (-dy / d) * strafe;
      enemy.y += (dx / d) * strafe;
    }
  });
}

function stepCorruption(state) {
  state.nodes.forEach((node) => {
    node.pulse = (node.pulse + 0.04 + node.corruption * 0.002) % (Math.PI * 2);
    const corruptorAttached = state.enemies.some(
      (enemy) =>
        enemy.role === "corruptor" &&
        enemy.targetNodeId === node.id &&
        dist(enemy.x, enemy.y, node.x, node.y) <= node.size + 10
    );

    if (!corruptorAttached && node.corruption > 0) {
      const purgeRate = 0.18 + state.upgrades.arsenal * 0.04 + state.upgrades.shield * 0.01;
      node.corruption = clamp(node.corruption - purgeRate, 0, 100);
      node.corruptedBy = null;
      if (node.corruption <= 3) {
        node.corrupted = false;
        node.corruptedBy = null;
      }
    }
  });
}

function stepTurrets(state) {
  state.turrets.forEach((turret, index) => {
    const live = index < Math.max(1, Math.min(state.turrets.length, 1 + state.upgrades.turret));
    if (!live) {
      turret.cooldown = 0;
      turret.angle += (-1.57 - turret.angle) * 0.06;
      return;
    }

    turret.range = 125 + state.upgrades.turret * 18;
    turret.cooldown = Math.max(0, turret.cooldown - 1);
    const target = [...state.enemies]
      .filter(
        (enemy) => enemy.role !== "corruptor" && dist(enemy.x, enemy.y, turret.x, turret.y) <= turret.range
      )
      .sort(
        (a, b) => dist(a.x, a.y, turret.x, turret.y) - dist(b.x, b.y, turret.x, turret.y)
      )[0];

    if (target) {
      turret.angle = Math.atan2(target.y - turret.y, target.x - turret.x);
    } else {
      turret.angle += (-1.57 - turret.angle) * 0.06;
    }

    if (target && turret.cooldown <= 0) {
      const damage = 16 + state.upgrades.turret * 6 + state.upgrades.reactor * 2;
      turret.cooldown = Math.max(8, 20 - state.upgrades.turret);
      addProjectile(
        state,
        turret.x,
        turret.y,
        target.x,
        target.y,
        "rgba(255, 255, 255, 0.95)",
        2.2,
        7
      );
      target.hp -= damage;
      target.flash = 6;
    }
  });
}

function stepScouts(state) {
  const corruptors = state.enemies.filter((enemy) => enemy.role === "corruptor");
  const corruptedNodes = [...state.nodes]
    .filter((node) => node.corruption > 8 && CORRUPTIBLE_KINDS.includes(node.kind))
    .sort((a, b) => b.corruption - a.corruption || a.id - b.id);

  state.scouts.forEach((scout, index) => {
    const live = index < Math.min(state.scouts.length, state.upgrades.scout);
    scout.pulse = (scout.pulse + 0.08) % (Math.PI * 2);
    scout.cooldown = Math.max(0, scout.cooldown - 1);

    if (!live) {
      scout.targetId = null;
      scout.tx = scout.homeX;
      scout.ty = scout.homeY;
      scout.x += (scout.homeX - scout.x) * 0.08;
      scout.y += (scout.homeY - scout.y) * 0.08;
      scout.angle += (-1.2 - scout.angle) * 0.08;
      scout.task = "Standby";
      return;
    }

    const currentTarget = corruptors.find((enemy) => enemy.id === scout.targetId);
    const interceptTarget =
      currentTarget ??
      [...corruptors].sort((a, b) => {
        const aDistance = dist(a.x, a.y, scout.x, scout.y);
        const bDistance = dist(b.x, b.y, scout.x, scout.y);
        return aDistance - bDistance;
      })[Math.min(index, Math.max(0, corruptors.length - 1))];

    if (interceptTarget) {
      scout.targetId = interceptTarget.id;
      scout.tx = interceptTarget.x;
      scout.ty = interceptTarget.y;

      const dx = interceptTarget.x - scout.x;
      const dy = interceptTarget.y - scout.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      scout.angle = Math.atan2(dy, dx);
      const preferredRange = 70 + state.upgrades.arsenal * 8;

      if (d > preferredRange) {
        scout.x += (dx / d) * (scout.speed + state.upgrades.arsenal * 0.14);
        scout.y += (dy / d) * (scout.speed + state.upgrades.arsenal * 0.14);
        scout.task = "Intercepting";
      } else {
        const orbit = Math.sin((state.timers.tick + scout.id * 19) / 14) * 0.9;
        scout.x += (-dy / d) * orbit;
        scout.y += (dx / d) * orbit;
        scout.task = "Purging";
      }

      if (d <= preferredRange + 10 && scout.cooldown <= 0) {
        const damage = 11 + state.upgrades.scout * 2 + state.upgrades.arsenal * 8;
        scout.cooldown = Math.max(7, 18 - state.upgrades.arsenal * 2);
        addProjectile(
          state,
          scout.x,
          scout.y,
          interceptTarget.x,
          interceptTarget.y,
          "rgba(220, 170, 255, 0.95)",
          2.4,
          8
        );
        interceptTarget.hp -= damage;
        interceptTarget.flash = 7;
      }

      return;
    }

    const sweepNode = corruptedNodes[Math.min(index, Math.max(0, corruptedNodes.length - 1))];
    if (sweepNode) {
      scout.targetId = null;
      scout.tx = sweepNode.x;
      scout.ty = sweepNode.y;
      const dx = sweepNode.x - scout.x;
      const dy = sweepNode.y - scout.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      scout.angle = Math.atan2(dy, dx);

      if (d > 28) {
        scout.x += (dx / d) * (0.6 + scout.speed * 0.55);
        scout.y += (dy / d) * (0.6 + scout.speed * 0.55);
      } else {
        const cleanseRate = 0.2 + state.upgrades.arsenal * 0.08;
        sweepNode.corruption = clamp(sweepNode.corruption - cleanseRate, 0, 100);
        if (sweepNode.corruption <= 3) {
          sweepNode.corrupted = false;
          sweepNode.corruptedBy = null;
        }
      }

      scout.task = "Sweeping";
      return;
    }

    const patrolX = scout.homeX + Math.cos((state.timers.tick + scout.id * 21) / 20) * 18;
    const patrolY = scout.homeY - 10 + Math.sin((state.timers.tick + scout.id * 15) / 24) * 12;
    scout.targetId = null;
    scout.tx = patrolX;
    scout.ty = patrolY;
    scout.x += (patrolX - scout.x) * 0.12;
    scout.y += (patrolY - scout.y) * 0.12;
    scout.angle = Math.atan2(patrolY - scout.y, patrolX - scout.x);
    scout.task = "Patrolling";
  });
}

function resolveEnemyDeaths(state) {
  const killed = state.enemies.filter((enemy) => enemy.hp <= 0);
  if (!killed.length) return;

  const purged = killed.filter((enemy) => enemy.role === "corruptor").length;
  const regular = killed.length - purged;
  const killedIds = new Set(killed.map((enemy) => enemy.id));

  state.stats.hostileKills += killed.length;
  state.stats.purges += purged;
  state.resources.gold += regular * (10 + state.upgrades.turret * 2) + purged * (8 + state.upgrades.scout * 3);
  state.resources.energy +=
    regular * (0.5 + state.upgrades.shield * 0.05) + purged * (0.9 + state.upgrades.arsenal * 0.08);

  state.nodes.forEach((node) => {
    if (node.corruptedBy != null && killedIds.has(node.corruptedBy)) {
      node.corruptedBy = null;
    }
  });

  if (regular > 0 && purged > 0) {
    state.log = pushLog(
      state.log,
      `Defense grid cleared ${regular} hostile${regular > 1 ? "s" : ""}; scouts purged ${purged} corrupter${purged > 1 ? "s" : ""}.`
    );
  } else if (purged > 0) {
    state.log = pushLog(
      state.log,
      `Assault scouts purged ${purged} toxic corrupter${purged > 1 ? "s" : ""}.`
    );
  } else {
    state.log = pushLog(
      state.log,
      `Defense grid cleared ${regular} hostile${regular > 1 ? "s" : ""}.`
    );
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}

function stepCombat(state) {
  if (state.timers.tick % COMBAT_TICK !== 0) return;

  state.agents.forEach((agent) => {
    const attackers = state.enemies.filter(
      (enemy) => enemy.role !== "corruptor" && dist(enemy.x, enemy.y, agent.x, agent.y) < 26
    ).length;

    if (!attackers) return;

    const mitigation = state.upgrades.shield * 1.8 + state.upgrades.turret * 0.25;
    const incoming = Math.max(0.8, attackers * 4.2 - mitigation);
    const blocked = Math.max(0, attackers * 4.2 - incoming);
    state.stats.blocked += blocked;

    const nextHp = clamp(agent.hp - incoming, 0, agent.maxHp);
    if (nextHp <= 20 && agent.hp > 20) {
      state.log = pushLog(state.log, `${agent.kind} drone taking heavy fire.`);
    }

    if (nextHp <= 0) {
      agent.x = rand(agent.homeX - 18, agent.homeX + 18);
      agent.y = rand(agent.homeY - 18, agent.homeY + 18);
      agent.tx = agent.homeX;
      agent.ty = agent.homeY;
      agent.hp = clamp(agent.maxHp * (0.55 + state.upgrades.shield * 0.04), 25, agent.maxHp);
      agent.panic = 40;
      agent.evadeTicks = 36;
      agent.evadeDx = 0;
      agent.evadeDy = -1;
      agent.damageTicks = 30;
      agent.target = chooseWorkerTarget(state, agent, agent.id - 1);
      agent.task = "Rebooting";
      state.log = pushLog(state.log, `${agent.kind} drone restored from backup shell.`);
      return;
    }

    agent.hp = nextHp;
    agent.panic = clamp(agent.panic + 6, 0, 100);
    agent.damageTicks = 24;
  });
}

function stepMining(state) {
  if (state.timers.tick % MINING_TICK !== 0) return;

  state.nodes.forEach((node) => {
    const workers = state.agents.filter(
      (agent) =>
        agent.target === node.id &&
        dist(agent.x, agent.y, node.x, node.y) < Math.max(24, node.size * 0.52) &&
        agent.hp > 30 &&
        agent.evadeTicks <= 0
    ).length;

    if (!workers) {
      node.pulse = (node.pulse + 0.12) % (Math.PI * 2);
      return;
    }

    const damage =
      workers *
      (1 + state.upgrades.miner * 0.08 + state.upgrades.drill * 0.04) *
      (node.corrupted ? 0.78 : 1);

    node.hp -= damage;

    if (node.hp <= 0) {
      const crit = chance(0.18 + state.upgrades.bot * 0.01);
      const baseAmount =
        node.kind === "gold" ? 14 : node.kind === "ore" ? 10 : node.kind === "gems" ? 3.4 : 5.4;
      const corruptionPenalty = 1 - node.corruption / 170;
      const amount = baseAmount * Math.max(0.45, corruptionPenalty);

      state.resources[node.kind] += amount * state.combo * (crit ? 2 : 1);
      state.stats.mined += amount;
      if (crit) {
        state.stats.crits += 1;
        state.log = pushLog(state.log, `Critical haul on ${node.kind} node.`);
      }

      Object.assign(node, makeNode(node.id));
    } else {
      node.pulse = (node.pulse + 0.2 + node.corruption * 0.003) % (Math.PI * 2);
    }
  });
}

function getAutobuyWeight(state, derived, key) {
  let weight = 1;

  if (state.level < 3 && (key === "miner" || key === "drill")) weight *= 0.8;
  if (state.resources.energy < 10 && key === "reactor") weight *= 0.86;
  if (state.upgrades.turret === 0 && derived.hostilePressure && key === "turret") weight *= 0.45;
  if (state.upgrades.scout === 0 && derived.corruptionPressure && key === "scout") weight *= 0.3;

  if (derived.hostilePressure) {
    if (key === "turret") weight *= 0.52;
    else if (key === "shield") weight *= 0.62;
    else if (key === "reactor") weight *= 0.88;
    else weight *= 1.15;
  }

  if (derived.corruptionPressure) {
    if (key === "scout") weight *= 0.45;
    else if (key === "arsenal") weight *= 0.54;
    else if (key === "shield") weight *= 0.9;
    else if (key === "turret") weight *= 1.08;
  }

  if (key === "bot" && state.upgrades.bot > state.prestige + 2) weight *= 1.2;
  return weight;
}

function stepAutobuy(state) {
  if (state.timers.auto < AUTO_TICK) return;
  state.timers.auto = 0;

  const derived = computeDerived(state);
  const candidates = upgradeDefs
    .map((def) => ({
      def,
      cost: nextUpgradeCost(def, state.upgrades[def.key]),
    }))
    .filter(({ def, cost }) => {
      const smartGate =
        (def.key !== "bot" || state.upgrades.drill >= 2) &&
        (def.key !== "shield" || state.upgrades.turret >= 1) &&
        (def.key !== "turret" || state.upgrades.reactor >= 1 || state.level >= 3) &&
        (def.key !== "scout" || state.upgrades.reactor >= 1 || state.level >= 4) &&
        (def.key !== "arsenal" || state.upgrades.scout >= 1);

      return smartGate && state.resources.gold >= cost;
    })
    .sort((a, b) => {
      const weightedA = a.cost * getAutobuyWeight(state, derived, a.def.key);
      const weightedB = b.cost * getAutobuyWeight(state, derived, b.def.key);
      return weightedA - weightedB || a.cost - b.cost;
    });

  const chosen = candidates[0];
  if (chosen) {
    state.resources.gold = Math.max(0, state.resources.gold - chosen.cost);
    state.upgrades[chosen.def.key] += 1;
    state.stats.spent += chosen.cost;
    state.log = pushLog(state.log, `Purchased ${chosen.def.label} v${state.upgrades[chosen.def.key]}`);
    return;
  }

  if (
    state.resources.gold > 5200 &&
    state.resources.gems > 24 &&
    state.enemies.length < 3 &&
    derived.corruptedNodes === 0
  ) {
    state.resources.gold *= 0.18;
    state.resources.ore *= 0.15;
    state.resources.gems *= 0.2;
    state.resources.energy *= 0.2;
    state.prestige += 1;
    state.combo = Math.min(state.combo + 0.6, 9.9);
    state.log = pushLog(state.log, "Quantum reset complete. Prestige +1.");
  }
}

function stepProjectiles(state) {
  state.projectiles = state.projectiles
    .map((projectile) => ({
      ...projectile,
      life: projectile.life - 1,
    }))
    .filter((projectile) => projectile.life > 0);
}

function stepEvents(state) {
  if (state.timers.event < EVENT_TICK) return;
  state.timers.event = 0;

  const derived = computeDerived(state);
  const ambientMessages = [
    "AI rerouted workers for better pathing.",
    "Bonus vein detected near lower ridge.",
    "Cache compression improved throughput.",
    "Support drone pretending to be useful.",
    "Energy bloom stabilized reactor output.",
    "Shield harmonics adjusted for worker safety.",
    "Scout wing reports purple sludge where it absolutely should not be.",
  ];

  if (derived.hostilePressure) {
    ambientMessages.push("Perimeter guns are cycling hot against the latest raiders.");
  } else {
    ambientMessages.push("Perimeter defense holding a lazy but confident posture.");
  }

  if (derived.corruptionPressure) {
    ambientMessages.push("Purge wing is tracing toxic residue over the outer nodes.");
  } else {
    ambientMessages.push("Corruption scan clean. For now.");
  }

  if (state.resources.gold > 2200) {
    ambientMessages.push("Treasury overflow routed into colony purchase heuristics.");
  }

  state.log = pushLog(state.log, pick(ambientMessages));
}

function advanceGame(prev) {
  const state = cloneGameState(prev);
  state.timers.tick = (state.timers.tick + 1) % TICK_WRAP;
  state.timers.auto += 1;
  state.timers.event += 1;
  state.timers.enemy += 1;

  stepEconomy(state);
  stepSpawns(state);
  stepWorkers(state);
  stepEnemies(state);
  stepCorruption(state);
  stepTurrets(state);
  stepScouts(state);
  resolveEnemyDeaths(state);
  stepCombat(state);
  stepMining(state);
  stepAutobuy(state);
  stepProjectiles(state);
  stepEvents(state);

  return state;
}

function StatusBadge({ tone, children }) {
  const toneClass =
    tone === "danger"
      ? "border-rose-300/20 bg-rose-300/10 text-rose-100"
      : tone === "toxic"
        ? "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100"
        : tone === "ready"
          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
          : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";

  return (
    <div className={`rounded-2xl border px-3 py-2 text-[11px] uppercase tracking-[0.22em] ${toneClass}`}>
      {children}
    </div>
  );
}

function ResourcePill({ label, value, rate, icon: Icon, tint, glow }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 shadow-lg backdrop-blur-md">
      <div
        className="rounded-2xl p-2.5"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.08)",
          boxShadow: `0 0 24px ${glow}`,
        }}
      >
        <Icon className="h-4 w-4" style={{ color: tint }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">{label}</div>
        <div className="text-lg font-semibold text-white">{fmt(value)}</div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">rate</div>
        <div className="text-sm font-medium" style={{ color: tint }}>
          +{rate.toFixed(2)}/s
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, tint }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">{label}</div>
      <div className="mt-1 text-xl font-semibold" style={{ color: tint ?? "rgba(255,255,255,0.95)" }}>
        {value}
      </div>
    </div>
  );
}

function UpgradeTile({ def, level, cost, canAfford }) {
  const Icon = def.icon;
  return (
    <div
      className={`rounded-3xl border px-3 py-3 transition-colors ${
        canAfford ? "border-white/20 bg-white/10" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-white/10 p-2">
          <Icon className="h-4 w-4 text-white/85" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">v{level}</div>
      </div>
      <div className="mt-3 text-sm font-medium text-white">{def.label}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-white/45">{def.effectText}</div>
      <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em]">
        <span className={canAfford ? "text-emerald-200" : "text-white/35"}>{canAfford ? "Ready" : "Queue"}</span>
        <span className="text-white/55">{fmt(cost)} G</span>
      </div>
    </div>
  );
}

function Background() {
  const stars = useMemo(() => makeStars(90), []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(70,110,255,0.16),transparent_35%),linear-gradient(180deg,rgba(5,8,20,1)_0%,rgba(7,10,28,1)_42%,rgba(6,10,22,1)_100%)]">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="absolute inset-0 opacity-70">
        {stars.map((star) => (
          <motion.div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
            }}
            animate={{
              opacity: [star.opacity * 0.35, star.opacity, star.opacity * 0.55],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 3 + (star.id % 5),
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <motion.div
        className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-cyan-200/10 blur-3xl"
        animate={{ x: [0, 120, 0], y: [0, 40, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-blue-200/10 blur-3xl"
        animate={{ x: [0, -100, 0], y: [0, -60, 0] }}
        transition={{ duration: 31, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-fuchsia-300/10 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

export default function IdleWallpaperGame() {
  const [game, setGame] = useState(createInitialGameState);
  const gameRef = useRef(game);
  const derived = useMemo(() => computeDerived(game), [game]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    const id = setInterval(() => {
      const next = advanceGame(gameRef.current);
      gameRef.current = next;
      setGame(next);
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  const xpPct = clamp((game.xp / Math.max(1, derived.targetXp)) * 100, 0, 100);
  const stabilityPct = clamp(
    (derived.defenseScore / Math.max(2, derived.threatScore + 2)) * 100,
    0,
    100
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050814] text-white">
      <Background />

      <div className="relative z-10 flex min-h-screen flex-col p-4 md:p-6">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.35em] text-white/40">
              Autonomous Colony Sim
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
              NEXUS DRIFT // purge wing online
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-white/55 md:text-base">
              This colony never sleeps: workers mine, raiders harass, turrets answer, and the purple
              sludge goblins keep trying to rot your economy anyway.
            </p>
          </div>

          <Card className={`${panelClass} min-w-[250px] p-4`}>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-white/45">
              <span>Sector Level</span>
              <span>{game.level}</span>
            </div>
            <div className="mt-3 text-4xl font-semibold text-white">x{game.combo.toFixed(1)}</div>
            <div className="mt-1 text-sm text-white/55">combo multiplier</div>
            <Progress value={xpPct} className="mt-4 h-2 bg-white/10" />
            <div className="mt-2 flex items-center justify-between text-xs text-white/45">
              <span>XP {fmt(game.xp)}</span>
              <span>{fmt(derived.targetXp)}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatusBadge tone={derived.hostilePressure ? "danger" : "calm"}>
                {derived.hostilePressure ? "Perimeter Hot" : "Perimeter Stable"}
              </StatusBadge>
              <StatusBadge tone={derived.corruptionPressure ? "toxic" : "ready"}>
                {derived.corruptionPressure ? "Purge Wing Live" : "Corruption Low"}
              </StatusBadge>
            </div>
          </Card>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {resourceDefs.map((resource) => (
            <ResourcePill
              key={resource.key}
              label={resource.label}
              value={game.resources[resource.key]}
              rate={derived.rates[resource.key]}
              icon={resource.icon}
              tint={resource.tint}
              glow={resource.glow}
            />
          ))}
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.85fr]">
          <Card className={`${panelClass} relative overflow-hidden p-0`}>
            <div className="absolute left-4 top-4 z-20 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/55 backdrop-blur-md">
              active field // perimeter defense + purge wing
            </div>

            <div className="absolute right-4 top-4 z-20 flex gap-2">
              <StatusBadge tone={derived.hostilePressure ? "danger" : "calm"}>
                Combat {derived.combatThreats}
              </StatusBadge>
              <StatusBadge tone={derived.corruptionPressure ? "toxic" : "ready"}>
                Corruption {derived.corruptedNodes}
              </StatusBadge>
            </div>

            <svg
              viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
              className="h-[60vh] min-h-[440px] w-full bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]"
            >
              <defs>
                <radialGradient id="fieldGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.6)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
                <linearGradient id="groundGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
                </linearGradient>
              </defs>

              <path
                d="M0 485 C170 430, 300 540, 420 505 S690 420, 795 468 S940 525, 1000 462 L1000 620 L0 620 Z"
                fill="url(#groundGradient)"
              />
              <path
                d="M0 540 C180 500, 330 575, 470 540 S760 495, 1000 560"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="2"
              />

              <rect
                x="105"
                y="498"
                width="790"
                height="82"
                rx="24"
                fill="rgba(255,255,255,0.03)"
                stroke="rgba(255,255,255,0.1)"
              />

              {game.scouts.map((scout, index) => {
                const live = index < derived.activeScouts;
                return (
                  <g key={`pad-${scout.id}`}>
                    <circle
                      cx={scout.homeX}
                      cy={scout.homeY + 12}
                      r="18"
                      fill={live ? "rgba(208,168,255,0.12)" : "rgba(255,255,255,0.04)"}
                      stroke={live ? "rgba(235,210,255,0.35)" : "rgba(255,255,255,0.08)"}
                    />
                  </g>
                );
              })}

              {game.turrets.map((turret, index) => {
                const live = index < derived.activeTurrets;
                if (!live) {
                  return (
                    <g key={turret.id}>
                      <circle cx={turret.x} cy={turret.y} r="16" fill="rgba(255,255,255,0.05)" />
                      <circle
                        cx={turret.x}
                        cy={turret.y}
                        r="6"
                        fill="rgba(255,255,255,0.08)"
                        stroke="rgba(255,255,255,0.15)"
                      />
                    </g>
                  );
                }

                return (
                  <g key={turret.id}>
                    <circle
                      cx={turret.x}
                      cy={turret.y}
                      r={turret.range}
                      fill="none"
                      stroke="rgba(255,255,255,0.05)"
                      strokeDasharray="7 9"
                    />
                    <circle cx={turret.x} cy={turret.y} r="20" fill="rgba(255,255,255,0.06)" />
                    <circle
                      cx={turret.x}
                      cy={turret.y}
                      r="14"
                      fill="rgba(255,255,255,0.12)"
                      stroke="rgba(255,255,255,0.42)"
                      strokeWidth="1.5"
                    />
                    <line
                      x1={turret.x}
                      y1={turret.y}
                      x2={turret.x + Math.cos(turret.angle) * 21}
                      y2={turret.y + Math.sin(turret.angle) * 21}
                      stroke="rgba(255,255,255,0.92)"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

              {game.nodes.map((node) => {
                const style = NODE_STYLE[node.kind];
                const hpPct = clamp((node.hp / node.maxHp) * 100, 0, 100);
                const corruptionPct = clamp(node.corruption, 0, 100);
                const toxicGlow = node.corruption > 0 ? 0.1 + node.corruption / 200 : 0;

                return (
                  <g key={node.id}>
                    {node.corruption > 0 && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.size + 20}
                        fill="rgba(190,80,255,0.16)"
                        opacity={toxicGlow}
                      />
                    )}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.size + 16}
                      fill="url(#fieldGlow)"
                      opacity={0.18 + (Math.sin(node.pulse) + 1) * 0.08}
                    />
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.size}
                      fill={node.corrupted ? "rgba(175,90,255,0.2)" : style.fill}
                      stroke={node.corrupted ? "rgba(220,160,255,0.74)" : style.stroke}
                      strokeWidth="1.5"
                    />
                    <circle
                      cx={node.x - node.size * 0.25}
                      cy={node.y - node.size * 0.22}
                      r={node.size * 0.32}
                      fill={node.corrupted ? "rgba(220,150,255,0.32)" : style.core}
                    />
                    <rect
                      x={node.x - 22}
                      y={node.y + node.size + 10}
                      rx="4"
                      ry="4"
                      width="44"
                      height="5"
                      fill="rgba(255,255,255,0.12)"
                    />
                    <rect
                      x={node.x - 22}
                      y={node.y + node.size + 10}
                      rx="4"
                      ry="4"
                      width={(44 * hpPct) / 100}
                      height="5"
                      fill="rgba(255,255,255,0.7)"
                    />
                    {node.corruption > 0 && (
                      <>
                        <rect
                          x={node.x - 22}
                          y={node.y + node.size + 18}
                          rx="4"
                          ry="4"
                          width="44"
                          height="4"
                          fill="rgba(255,255,255,0.08)"
                        />
                        <rect
                          x={node.x - 22}
                          y={node.y + node.size + 18}
                          rx="4"
                          ry="4"
                          width={(44 * corruptionPct) / 100}
                          height="4"
                          fill="rgba(195,120,255,0.92)"
                        />
                      </>
                    )}
                    <text
                      x={node.x}
                      y={node.y + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fill={style.label}
                      style={{ letterSpacing: 1.5 }}
                    >
                      {node.kind.toUpperCase()}
                    </text>
                  </g>
                );
              })}

              {game.projectiles.map((projectile) => (
                <line
                  key={projectile.id}
                  x1={projectile.x1}
                  y1={projectile.y1}
                  x2={projectile.x2}
                  y2={projectile.y2}
                  stroke={projectile.color}
                  strokeWidth={projectile.width}
                  opacity={projectile.life / projectile.maxLife}
                  strokeLinecap="round"
                />
              ))}

              {game.enemies.map((enemy) => {
                const hpPct = clamp((enemy.hp / enemy.maxHp) * 100, 0, 100);

                if (enemy.role === "corruptor") {
                  const wobble = Math.sin((game.timers.tick + enemy.id * 11) / 7) * 2;
                  return (
                    <g key={enemy.id}>
                      <circle cx={enemy.x} cy={enemy.y} r="22" fill="rgba(160,70,255,0.08)" />
                      <circle
                        cx={enemy.x}
                        cy={enemy.y}
                        r={12 + wobble * 0.15}
                        fill={enemy.flash ? "rgba(255,255,255,0.82)" : "rgba(172,92,255,0.82)"}
                        stroke="rgba(240,190,255,0.55)"
                        strokeWidth="1.4"
                      />
                      <circle cx={enemy.x - 5} cy={enemy.y - 5} r="4" fill="rgba(245,210,255,0.75)" />
                      <path
                        d={`M ${enemy.x - 9} ${enemy.y + 9} q 7 10 18 4`}
                        stroke="rgba(235,180,255,0.7)"
                        strokeWidth="2"
                        fill="none"
                      />
                      <rect
                        x={enemy.x - 16}
                        y={enemy.y + 18}
                        rx="4"
                        ry="4"
                        width="32"
                        height="4"
                        fill="rgba(255,255,255,0.12)"
                      />
                      <rect
                        x={enemy.x - 16}
                        y={enemy.y + 18}
                        rx="4"
                        ry="4"
                        width={(32 * hpPct) / 100}
                        height="4"
                        fill="rgba(210,140,255,0.95)"
                      />
                    </g>
                  );
                }

                const style = ENEMY_STYLE[enemy.kind];
                if (enemy.kind === "raider") {
                  return (
                    <g key={enemy.id}>
                      <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
                      <rect
                        x={enemy.x - 12}
                        y={enemy.y - 12}
                        width="24"
                        height="24"
                        rx="6"
                        fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill}
                        stroke={style.stroke}
                        strokeWidth="1.2"
                      />
                      <line
                        x1={enemy.x - 8}
                        y1={enemy.y}
                        x2={enemy.x + 8}
                        y2={enemy.y}
                        stroke="rgba(255,255,255,0.55)"
                        strokeWidth="1.5"
                      />
                      <rect
                        x={enemy.x - 16}
                        y={enemy.y + style.radius + 8}
                        rx="4"
                        ry="4"
                        width="32"
                        height="4"
                        fill="rgba(255,255,255,0.12)"
                      />
                      <rect
                        x={enemy.x - 16}
                        y={enemy.y + style.radius + 8}
                        rx="4"
                        ry="4"
                        width={(32 * hpPct) / 100}
                        height="4"
                        fill="rgba(255,140,140,0.95)"
                      />
                    </g>
                  );
                }

                if (enemy.kind === "wisp") {
                  return (
                    <g key={enemy.id}>
                      <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
                      <path
                        d={`M ${enemy.x} ${enemy.y - 12} L ${enemy.x + 10} ${enemy.y} L ${enemy.x} ${enemy.y + 12} L ${enemy.x - 10} ${enemy.y} Z`}
                        fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill}
                        stroke={style.stroke}
                        strokeWidth="1.2"
                      />
                      <rect
                        x={enemy.x - 16}
                        y={enemy.y + style.radius + 8}
                        rx="4"
                        ry="4"
                        width="32"
                        height="4"
                        fill="rgba(255,255,255,0.12)"
                      />
                      <rect
                        x={enemy.x - 16}
                        y={enemy.y + style.radius + 8}
                        rx="4"
                        ry="4"
                        width={(32 * hpPct) / 100}
                        height="4"
                        fill="rgba(152,220,255,0.95)"
                      />
                    </g>
                  );
                }

                return (
                  <g key={enemy.id}>
                    <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
                    <circle
                      cx={enemy.x}
                      cy={enemy.y}
                      r={style.radius}
                      fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill}
                      stroke={style.stroke}
                      strokeWidth="1.2"
                    />
                    <line
                      x1={enemy.x - 6}
                      y1={enemy.y - 8}
                      x2={enemy.x - 11}
                      y2={enemy.y - 14}
                      stroke="rgba(255,255,255,0.4)"
                    />
                    <line
                      x1={enemy.x + 6}
                      y1={enemy.y - 8}
                      x2={enemy.x + 11}
                      y2={enemy.y - 14}
                      stroke="rgba(255,255,255,0.4)"
                    />
                    <rect
                      x={enemy.x - 16}
                      y={enemy.y + style.radius + 8}
                      rx="4"
                      ry="4"
                      width="32"
                      height="4"
                      fill="rgba(255,255,255,0.12)"
                    />
                    <rect
                      x={enemy.x - 16}
                      y={enemy.y + style.radius + 8}
                      rx="4"
                      ry="4"
                      width={(32 * hpPct) / 100}
                      height="4"
                      fill="rgba(255,176,145,0.95)"
                    />
                  </g>
                );
              })}

              {game.scouts.map((scout, index) => {
                const live = index < derived.activeScouts;
                const bob = Math.sin(scout.pulse) * 2.2;

                if (!live) return null;

                return (
                  <g key={scout.id}>
                    <line
                      x1={scout.x}
                      y1={scout.y}
                      x2={scout.tx}
                      y2={scout.ty}
                      stroke="rgba(220,180,255,0.12)"
                      strokeDasharray="4 4"
                    />
                    <circle
                      cx={scout.x}
                      cy={scout.y + bob}
                      r="16"
                      fill="rgba(205,155,255,0.14)"
                      stroke="rgba(240,210,255,0.55)"
                      strokeWidth="1.3"
                    />
                    <path
                      d={`M ${scout.x - 8} ${scout.y + bob + 4} L ${scout.x} ${scout.y + bob - 10} L ${scout.x + 8} ${scout.y + bob + 4} Z`}
                      fill="rgba(245,220,255,0.95)"
                      opacity="0.92"
                    />
                    <line
                      x1={scout.x}
                      y1={scout.y + bob}
                      x2={scout.x + Math.cos(scout.angle) * 18}
                      y2={scout.y + bob + Math.sin(scout.angle) * 18}
                      stroke="rgba(220,180,255,0.82)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

              {game.agents.map((agent) => {
                const bob = Math.sin((game.timers.tick + agent.id * 8) / 7) * 2;
                const shieldActive = game.upgrades.shield > 0;
                const panicOpacity = clamp(agent.panic / 100, 0, 1) * 0.22;
                const armAngle = (agent.swing / 24) * Math.PI * 2;
                const armX = agent.x + 8 + Math.cos(armAngle) * 5;
                const armY = agent.y + bob - 7 + Math.sin(armAngle) * 5;

                return (
                  <g key={agent.id}>
                    <line
                      x1={agent.x}
                      y1={agent.y}
                      x2={agent.tx}
                      y2={agent.ty}
                      stroke="rgba(255,255,255,0.09)"
                      strokeDasharray="4 5"
                    />
                    {panicOpacity > 0 && (
                      <circle
                        cx={agent.x}
                        cy={agent.y + bob}
                        r={20 + agent.panic * 0.04}
                        fill={`rgba(255, 120, 120, ${panicOpacity})`}
                      />
                    )}
                    {shieldActive && (
                      <circle
                        cx={agent.x}
                        cy={agent.y + bob}
                        r={19 + game.upgrades.shield * 1.5}
                        fill="none"
                        stroke="rgba(150,220,255,0.22)"
                        strokeWidth="2"
                      />
                    )}
                    <circle
                      cx={agent.x}
                      cy={agent.y + bob}
                      r="13"
                      fill={agent.hp < 35 ? "rgba(255,160,160,0.28)" : "rgba(255,255,255,0.14)"}
                      stroke="rgba(255,255,255,0.55)"
                      strokeWidth="1.5"
                    />
                    <circle cx={agent.x} cy={agent.y + bob} r="4.2" fill={AGENT_STYLE[agent.kind]} />
                    <path
                      d={`M ${agent.x + 4} ${agent.y + bob - 4} L ${armX} ${armY}`}
                      stroke="rgba(255,255,255,0.82)"
                      strokeWidth="2"
                      opacity={agent.swing ? 0.92 : 0.25}
                    />
                    <circle cx={agent.x} cy={agent.y + bob} r="24" fill="none" stroke="rgba(255,255,255,0.08)" />
                  </g>
                );
              })}
            </svg>

            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {game.agents.map((agent) => (
                <div key={agent.id} className="rounded-3xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-md">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Unit {agent.id}</div>
                  <div className="mt-1 flex items-center justify-between text-sm font-medium text-white">
                    <span>{agent.kind}</span>
                    <span className="text-xs text-white/50">{Math.round(agent.hp)}%</span>
                  </div>
                  <div className="mt-1 text-xs text-white/50">{agent.task}</div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid min-h-0 grid-rows-[auto_auto_1fr] gap-4">
            <Card className={`${panelClass} p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Economy</div>
                  <div className="mt-1 text-lg font-semibold text-white">Autonomous throughput</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-2">
                  <TrendingUp className="h-4 w-4 text-white/80" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <StatTile label="Total Income" value={`${fmt(derived.totalIncome)}/s`} tint="rgba(130,255,210,0.95)" />
                <StatTile
                  label="Colony Health"
                  value={`${Math.round(derived.colonyHealth)}%`}
                  tint={derived.colonyHealth < 72 ? "rgba(255,170,170,0.95)" : "rgba(180,230,255,0.95)"}
                />
                <StatTile label="Prestige" value={`+${game.prestige}`} tint="rgba(255,220,150,0.95)" />
                <StatTile label="Stability" value={`${Math.round(stabilityPct)}%`} tint="rgba(160,235,255,0.95)" />
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/40">
                  <span>Threat / Defense Balance</span>
                  <span>
                    {derived.defenseScore.toFixed(1)} : {derived.threatScore.toFixed(1)}
                  </span>
                </div>
                <Progress value={stabilityPct} className="mt-2 h-2 bg-white/10" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {resourceDefs.map((resource) => (
                  <div key={resource.key} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/38">{resource.label}</div>
                    <div className="mt-1 text-sm font-medium" style={{ color: resource.tint }}>
                      +{derived.rates[resource.key].toFixed(2)}/s
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className={`${panelClass} p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Automation</div>
                  <div className="mt-1 text-lg font-semibold text-white">Colony brain upgrade queue</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-2">
                  <Bot className="h-4 w-4 text-white/80" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <StatTile label="Active Turrets" value={derived.activeTurrets} tint="rgba(255,255,255,0.95)" />
                <StatTile label="Active Scouts" value={derived.activeScouts} tint="rgba(220,180,255,0.95)" />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {upgradeDefs.map((def) => (
                  <UpgradeTile
                    key={def.key}
                    def={def}
                    level={game.upgrades[def.key]}
                    cost={nextUpgradeCost(def, game.upgrades[def.key])}
                    canAfford={game.resources.gold >= nextUpgradeCost(def, game.upgrades[def.key])}
                  />
                ))}
              </div>
            </Card>

            <Card className={`${panelClass} flex min-h-0 flex-col p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Threat / Activity</div>
                  <div className="mt-1 text-lg font-semibold text-white">Perimeter pressure and logs</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-2">
                  <AlertTriangle className="h-4 w-4 text-white/80" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <StatTile label="Combat Contacts" value={derived.combatThreats} tint="rgba(255,170,170,0.95)" />
                <StatTile label="Corrupters" value={derived.corruptorCount} tint="rgba(220,170,255,0.95)" />
                <StatTile label="Corrupted Nodes" value={derived.corruptedNodes} tint="rgba(220,170,255,0.95)" />
                <StatTile label="Blocked Damage" value={fmt(stateSafe(game.stats.blocked))} tint="rgba(170,220,255,0.95)" />
                <StatTile label="Hostiles Cleared" value={game.stats.hostileKills} tint="rgba(255,220,180,0.95)" />
                <StatTile label="Purges" value={game.stats.purges} tint="rgba(220,190,255,0.95)" />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/38">Ore Rot</div>
                  <div className="mt-1 text-sm font-medium text-white/80">{derived.corruptedByType.ore}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/38">Gem Rot</div>
                  <div className="mt-1 text-sm font-medium text-white/80">{derived.corruptedByType.gems}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/38">Energy Rot</div>
                  <div className="mt-1 text-sm font-medium text-white/80">{derived.corruptedByType.energy}</div>
                </div>
              </div>

              <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-3xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Activity Log</div>
                <div className="rounded-2xl bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/45">
                    live
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {game.log.map((entry, index) => (
                    <div
                      key={`${entry}-${index}`}
                      className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/75"
                    >
                      {entry}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function stateSafe(value) {
  return Number.isFinite(value) ? value : 0;
}
