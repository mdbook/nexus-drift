import { MAX_LOG } from "@/game/constants";
import type { UpgradeDef } from "@/game/types";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const chance = (value: number) => Math.random() < value;

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

export function nextUpgradeCost(def: UpgradeDef, level: number) {
  return Math.floor(def.baseCost * Math.pow(def.growth, level));
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

