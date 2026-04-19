import { UPGRADES } from "@/game/balance";
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
  { key: "miner", label: "Auto Miner", baseCost: UPGRADES.miner.baseCost, growth: UPGRADES.miner.growth, effectText: "+ Gold + Ore flow" },
  { key: "drill", label: "Deep Drill", baseCost: UPGRADES.drill.baseCost, growth: UPGRADES.drill.growth, effectText: "+ Ore + Gems extraction" },
  { key: "reactor", label: "Reactor", baseCost: UPGRADES.reactor.baseCost, growth: UPGRADES.reactor.growth, effectText: "+ Energy + anti-raider gun power" },
  { key: "bot", label: "Ops Bot", baseCost: UPGRADES.bot.baseCost, growth: UPGRADES.bot.growth, effectText: "Adaptive counter-build logic" },
  { key: "turret", label: "Defense Turret", baseCost: UPGRADES.turret.baseCost, growth: UPGRADES.turret.growth, effectText: "+ Range + fire rate, anti-wisp" },
  { key: "shield", label: "Shield Grid", baseCost: UPGRADES.shield.baseCost, growth: UPGRADES.shield.growth, effectText: "Swarm mitigation + recovery" },
  { key: "scout", label: "Assault Scout", baseCost: UPGRADES.scout.baseCost, growth: UPGRADES.scout.growth, effectText: "Intercepts corrupters" },
  { key: "arsenal", label: "Scout Arsenal", baseCost: UPGRADES.arsenal.baseCost, growth: UPGRADES.arsenal.growth, effectText: "Purge burst + field cleanse" },
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
    fill: "rgba(118, 128, 140, 0.38)",
    core: "rgba(175, 184, 194, 0.95)",
    stroke: "rgba(145, 155, 168, 0.85)",
    glow: "rgba(118, 128, 140, 0.28)",
    label: "rgba(200, 208, 218, 0.98)",
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
