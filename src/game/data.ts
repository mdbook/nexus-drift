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
    fill: "rgba(255, 200, 50, 0.28)",
    core: "rgba(255, 230, 140, 0.95)",
    stroke: "rgba(255, 215, 80, 0.80)",
    glow: "rgba(255, 210, 60, 0.28)",
    label: "rgba(255, 240, 180, 0.98)",
  },
  ore: {
    fill: "rgba(130, 170, 255, 0.26)",
    core: "rgba(200, 220, 255, 0.92)",
    stroke: "rgba(160, 200, 255, 0.72)",
    glow: "rgba(130, 170, 255, 0.26)",
    label: "rgba(220, 235, 255, 0.98)",
  },
  gems: {
    fill: "rgba(80, 255, 210, 0.24)",
    core: "rgba(180, 255, 238, 0.95)",
    stroke: "rgba(100, 255, 220, 0.72)",
    glow: "rgba(80, 255, 210, 0.24)",
    label: "rgba(200, 255, 244, 0.98)",
  },
  energy: {
    fill: "rgba(100, 255, 130, 0.24)",
    core: "rgba(190, 255, 205, 0.92)",
    stroke: "rgba(120, 255, 150, 0.72)",
    glow: "rgba(100, 255, 130, 0.24)",
    label: "rgba(210, 255, 220, 0.98)",
  },
};

export const ENEMY_STYLE: Record<Exclude<EnemyKind, "corruptor">, EnemyVisual> = {
  mite: {
    fill: "rgba(255, 145, 55, 0.88)",
    glow: "rgba(255, 120, 30, 0.22)",
    stroke: "rgba(255, 230, 180, 0.7)",
    radius: 11,
  },
  raider: {
    fill: "rgba(160, 20, 50, 0.92)",
    glow: "rgba(200, 30, 60, 0.28)",
    stroke: "rgba(255, 160, 170, 0.75)",
    radius: 20,
  },
  wisp: {
    fill: "rgba(160, 200, 255, 0.92)",
    glow: "rgba(120, 170, 255, 0.28)",
    stroke: "rgba(210, 230, 255, 0.80)",
    radius: 9,
  },
};

export const AGENT_STYLE: Record<WorkerKind, string> = {
  miner: "rgba(255, 210, 80, 1.0)",
  runner: "rgba(100, 200, 255, 1.0)",
  drone: "rgba(120, 255, 190, 1.0)",
};

