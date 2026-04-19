import { MAX_LOG } from "@/game/constants";
import type { ResourceKey, ResourceMap, UpgradeDef } from "@/game/types";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const chance = (value: number) => Math.random() < value;

export function pickWeighted<T>(items: Array<{ item: T; weight: number }>) {
  const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return null;

  let threshold = Math.random() * total;
  for (const entry of items) {
    threshold -= Math.max(0, entry.weight);
    if (threshold <= 0) return entry.item;
  }

  return items[items.length - 1]?.item ?? null;
}

export function normalize(dx: number, dy: number, fallbackX = 0, fallbackY = -1) {
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

export function fmt(n: number) {
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

export function pushLog(log: string[], message: string) {
  return [message, ...log].slice(0, MAX_LOG);
}

export function nextUpgradeCost(def: UpgradeDef, level: number): Partial<Record<ResourceKey, number>> {
  const multiplier = Math.pow(def.growth, level);
  if (typeof def.baseCost === "number") {
    return { gold: Math.round(def.baseCost * multiplier) };
  }

  const cost: Partial<Record<ResourceKey, number>> = {};
  for (const [key, value] of Object.entries(def.baseCost)) {
    cost[key as ResourceKey] = Math.round(value * multiplier);
  }
  return cost;
}

export function canAffordUpgrade(resources: ResourceMap, cost: Partial<Record<ResourceKey, number>>) {
  return Object.entries(cost).every(([key, value]) => resources[key as ResourceKey] >= (value ?? 0));
}

export function deductUpgradeCost(resources: ResourceMap, cost: Partial<Record<ResourceKey, number>>) {
  for (const [key, value] of Object.entries(cost)) {
    resources[key as ResourceKey] = Math.max(0, resources[key as ResourceKey] - (value ?? 0));
  }
}

export function getUpgradeCostTotal(cost: Partial<Record<ResourceKey, number>>) {
  return Object.values(cost).reduce((sum, value) => sum + (value ?? 0), 0);
}

export function formatUpgradeCost(cost: Partial<Record<ResourceKey, number>>) {
  const labels: Record<ResourceKey, string> = {
    gold: "G",
    ore: "O",
    gems: "GM",
    energy: "E",
    cores: "C",
    flux: "F",
  };

  return (Object.entries(cost) as Array<[ResourceKey, number | undefined]>)
    .filter(([, value]) => (value ?? 0) > 0)
    .map(([key, value]) => `${fmt(value ?? 0)} ${labels[key]}`)
    .join(" + ");
}

export function makeStars(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: rand(0, 100),
    y: rand(0, 100),
    size: rand(1, 3),
    opacity: rand(0.2, 0.95),
  }));
}

export function stateSafe(value: number) {
  return Number.isFinite(value) ? value : 0;
}
