import { GEM_UPGRADE_COST, UPGRADES } from "@/game/balance";
import type {
  EnemyKind,
  EnemyVisual,
  NodeVisual,
  ResourceDef,
  ResourceKey,
  UpgradeDef,
  VisibleResourceKey,
  WorkerKind,
} from "@/game/types";

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
  {
    key: "miner",
    label: "Auto Miner",
    baseCost: UPGRADES.miner.baseCost,
    growth: UPGRADES.miner.growth,
    effectText: "+ Gold + Ore flow, extra crews at sector 22 / 42; unlock steps use flux + cores",
  },
  {
    key: "drill",
    label: "Deep Drill",
    baseCost: UPGRADES.drill.baseCost,
    growth: UPGRADES.drill.growth,
    effectText: "+ Ore + Gems extraction, extra drones at sector 22 / 42; unlock steps use flux + cores",
  },
  {
    key: "reactor",
    label: "Reactor",
    // 4.4.0: gems added as a sink. Thematic — the reactor is the main energy
    // producer, so gems now fund the energy capacity that operator actions burn.
    baseCost: { gold: UPGRADES.reactor.baseCost, gems: GEM_UPGRADE_COST.reactor },
    growth: UPGRADES.reactor.growth,
    effectText: "+ Energy + anti-raider gun power (costs gems)",
  },
  {
    key: "bot",
    label: "Ops Bot",
    baseCost: UPGRADES.bot.baseCost,
    growth: UPGRADES.bot.growth,
    effectText:
      "Adaptive counter-build logic, extra runners at sector 22 / 42; unlock steps use flux + cores",
  },
  {
    key: "turret",
    label: "Defense Turret",
    baseCost: UPGRADES.turret.baseCost,
    growth: UPGRADES.turret.growth,
    effectText: "+ Range + fire rate, anti-wisp",
    // 4.1: 3 → 2. The turret is the primary perimeter weapon; gating it at
    // Tier 3 left an unblocked colony without a fixed gun until deep into the
    // run. Tier 2 keeps it off the Tier-0/1 opening but makes it available as
    // real pressure arrives.
    minTier: 2,
  },
  {
    key: "shield",
    label: "Shield Grid",
    baseCost: UPGRADES.shield.baseCost,
    growth: UPGRADES.shield.growth,
    effectText: "Swarm mitigation + recovery",
  },
  {
    key: "scout",
    label: "Assault Scout",
    baseCost: UPGRADES.scout.baseCost,
    growth: UPGRADES.scout.growth,
    effectText: "Intercepts corrupters",
    minTier: 1,
  },
  {
    key: "arsenal",
    label: "Scout Arsenal",
    // 4.4.0: gems added as a sink (mid/late upgrade).
    baseCost: { gold: UPGRADES.arsenal.baseCost, gems: GEM_UPGRADE_COST.arsenal },
    growth: UPGRADES.arsenal.growth,
    effectText: "Purge burst + field cleanse (costs gems)",
  },
  {
    key: "foundry",
    label: "Foundry",
    baseCost: { ore: 200, flux: 4 } satisfies Partial<Record<ResourceKey, number>>,
    growth: UPGRADES.foundry.growth,
    effectText: "+5% node yield per level",
    minTier: 3,
  },
  {
    key: "sentinel",
    label: "Sentinel Mech",
    baseCost: { gold: 800, cores: 3 } satisfies Partial<Record<ResourceKey, number>>,
    growth: UPGRADES.sentinel.growth,
    effectText: "Deploys a heavy combat mech (cap 2). Hunts Brutes, Sappers, Leeches.",
    minTier: 5,
  },
  {
    key: "archive",
    label: "Data Archive",
    baseCost: { flux: 6, cores: 1 } satisfies Partial<Record<ResourceKey, number>>,
    growth: UPGRADES.archive.growth,
    effectText: "+8% XP rate, +0.05 prestige combo per level",
    minTier: 4,
  },
  {
    key: "focusedBeam",
    label: "Focused Beam",
    baseCost: { gold: 600, cores: 2 } satisfies Partial<Record<ResourceKey, number>>,
    growth: UPGRADES.focusedBeam.growth,
    effectText:
      "Extends turret beam range (+6px/level, capped by TURRET.rangeMax). All turret shots are now instant-hit.",
    minTier: 4,
  },
  {
    key: "missileLauncher",
    label: "Missile Launcher",
    // 4.4.0: gems added as a sink (high-value late upgrade).
    baseCost: { gold: UPGRADES.missileLauncher.baseCost, gems: GEM_UPGRADE_COST.missileLauncher },
    growth: UPGRADES.missileLauncher.growth,
    effectText:
      "Long-range missile silos — few shots, big hits, massive range. +12 dmg / level (costs gems).",
  },
];

export function getUpgradeDef(key: UpgradeDef["key"]) {
  return upgradeDefs.find((def) => def.key === key)!;
}

export const NODE_STYLE: Record<VisibleResourceKey, NodeVisual> = {
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
  rusher: {
    fill: "rgba(255, 214, 64, 0.92)",
    glow: "rgba(255, 214, 64, 0.24)",
    stroke: "rgba(255, 246, 190, 0.8)",
    radius: 8,
  },
  brute: {
    fill: "rgba(110, 122, 145, 0.92)",
    glow: "rgba(140, 156, 182, 0.24)",
    stroke: "rgba(224, 232, 246, 0.75)",
    radius: 22,
  },
  sapper: {
    fill: "rgba(255, 82, 119, 0.92)",
    glow: "rgba(255, 82, 119, 0.24)",
    stroke: "rgba(255, 212, 224, 0.8)",
    radius: 6,
  },
  blight: {
    fill: "rgba(155, 240, 185, 0.88)",
    glow: "rgba(114, 230, 145, 0.24)",
    stroke: "rgba(228, 255, 236, 0.8)",
    radius: 14,
  },
  leech: {
    fill: "rgba(129, 140, 248, 0.92)",
    glow: "rgba(129, 140, 248, 0.24)",
    stroke: "rgba(224, 228, 255, 0.8)",
    radius: 12,
  },
  phantom: {
    fill: "rgba(226, 232, 240, 0.9)",
    glow: "rgba(226, 232, 240, 0.2)",
    stroke: "rgba(255, 255, 255, 0.8)",
    radius: 13,
  },
  zapper: {
    fill: "rgba(180, 80, 255, 0.88)",
    glow: "rgba(160, 60, 240, 0.28)",
    stroke: "rgba(230, 200, 255, 0.80)",
    radius: 10,
  },
  warden: {
    fill: "rgba(96, 40, 150, 0.78)",
    glow: "rgba(150, 70, 220, 0.34)",
    stroke: "rgba(210, 170, 255, 0.82)",
    radius: 16,
  },
};

export const AGENT_STYLE: Record<WorkerKind, string> = {
  miner: "rgba(255, 210, 80, 1.0)",
  runner: "rgba(100, 200, 255, 1.0)",
  drone: "rgba(120, 255, 190, 1.0)",
};
