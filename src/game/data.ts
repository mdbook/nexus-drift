import type { EnemyKind, EnemyVisual, NodeVisual, ResourceDef, ResourceKey, UpgradeDef, WorkerKind } from "@/game/types";

export const resourceDefs: ResourceDef[] = [
  {
    key: "gold",
    label: "Gold",
    tint: "rgba(255, 220, 110, 0.95)",
    glow: "rgba(255, 220, 110, 0.28)",
  },
  {
    key: "ore",
    label: "Ore",
    tint: "rgba(170, 210, 255, 0.95)",
    glow: "rgba(170, 210, 255, 0.24)",
  },
  {
    key: "gems",
    label: "Gems",
    tint: "rgba(120, 255, 220, 0.95)",
    glow: "rgba(120, 255, 220, 0.22)",
  },
  {
    key: "energy",
    label: "Energy",
    tint: "rgba(150, 255, 160, 0.95)",
    glow: "rgba(150, 255, 160, 0.22)",
  },
];

export const upgradeDefs: UpgradeDef[] = [
  { key: "miner", label: "Auto Miner", baseCost: 12, growth: 1.18, effectText: "+ Gold + Ore" },
  { key: "drill", label: "Deep Drill", baseCost: 80, growth: 1.22, effectText: "+ Ore + Gems" },
  { key: "reactor", label: "Reactor", baseCost: 240, growth: 1.25, effectText: "+ Energy + turrets" },
  { key: "bot", label: "Ops Bot", baseCost: 1100, growth: 1.3, effectText: "Smarter autobuy" },
  { key: "turret", label: "Defense Turret", baseCost: 180, growth: 1.23, effectText: "Perimeter defense" },
  { key: "shield", label: "Shield Grid", baseCost: 420, growth: 1.26, effectText: "Worker mitigation" },
  { key: "scout", label: "Assault Scout", baseCost: 280, growth: 1.24, effectText: "Hunts corrupters" },
  { key: "arsenal", label: "Scout Arsenal", baseCost: 540, growth: 1.27, effectText: "Purge damage + cleanse" },
];

export const NODE_STYLE: Record<ResourceKey, NodeVisual> = {
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

export const ENEMY_STYLE: Record<Exclude<EnemyKind, "corruptor">, EnemyVisual> = {
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

export const AGENT_STYLE: Record<WorkerKind, string> = {
  miner: "rgba(255, 221, 154, 0.95)",
  runner: "rgba(145, 225, 255, 0.95)",
  drone: "rgba(194, 255, 220, 0.95)",
};

