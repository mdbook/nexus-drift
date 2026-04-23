import { WORKER_SLOT_UNLOCK_RESOURCE_COSTS } from "@/game/balance";
import { MAX_LOG, TICK_WRAP } from "@/game/constants";
import type { LogCategory, LogEntry, ResourceKey, ResourceMap, UpgradeDef } from "@/game/types";

/**
 * Modular elapsed-tick delta. `state.timers.tick` wraps at `TICK_WRAP`,
 * so `now - then` can go negative once the counter wraps. Use this for
 * any "how many ticks since X" comparison.
 */
export const elapsedTicks = (now: number, then: number) => (now - then + TICK_WRAP) % TICK_WRAP;

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
// TODO(3.2.0): `rand`, `pick`, `chance`, and `pickWeighted` all pull from
// `Math.random` and therefore MUST NOT be used from any simulation path — the
// sim layer is deterministic and reproducible only when every decision flows
// through the seeded `Rng` in `src/game/rng.ts`. These helpers are retained
// for cosmetic / non-sim code (starfield, background chrome); sweep them out
// or fork a "cosmeticRand" / "seededRand" split so a future contributor
// can't accidentally reach for them inside a subsystem.
export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const chance = (value: number) => Math.random() < value;

export function pickWeighted<T>(items: Array<{ item: T; weight: number }>) {
  const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return null;

  // TODO(3.2.0): unseeded — see note at top of file; do not call from sim.
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

export function pushLog(log: LogEntry[], message: string, category: LogCategory, tick: number): LogEntry[] {
  return [{ tick, category, message }, ...log].slice(0, MAX_LOG);
}

export function nextUpgradeCost(def: UpgradeDef, level: number): Partial<Record<ResourceKey, number>> {
  const multiplier = Math.pow(def.growth, level);
  const cost: Partial<Record<ResourceKey, number>> = {};

  if (typeof def.baseCost === "number") {
    cost.gold = Math.round(def.baseCost * multiplier);
  } else {
    for (const [key, value] of Object.entries(def.baseCost)) {
      cost[key as ResourceKey] = Math.round(value * multiplier);
    }
  }

  if (def.key === "miner" || def.key === "drill" || def.key === "bot") {
    const unlockCost = WORKER_SLOT_UNLOCK_RESOURCE_COSTS[level + 1];
    if (unlockCost) {
      for (const [key, value] of Object.entries(unlockCost)) {
        cost[key as ResourceKey] = (cost[key as ResourceKey] ?? 0) + (value ?? 0);
      }
    }
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
