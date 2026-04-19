import { describe, expect, it } from "vitest";
import { advanceGame } from "@/game/advanceGame";
import { createInitialGameState, spawnEnemy } from "@/game/factories";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";

function runTicks(state: GameState, ticks: number): GameState {
  let current = state;
  for (let i = 0; i < ticks; i += 1) {
    current = advanceGame(current);
  }
  return current;
}

describe("advanceGame simulation invariants", () => {
  it("starts with no visible home district development", () => {
    const derived = computeDerived(createInitialGameState());
    expect(derived.cityStage).toBe(0);
  });

  it("home district development increases with progression", () => {
    const early = createInitialGameState();
    const mid = createInitialGameState();
    const late = createInitialGameState();

    mid.level = 6;
    mid.upgrades.miner = 2;
    mid.upgrades.drill = 1;
    mid.upgrades.turret = 1;
    mid.upgrades.scout = 1;

    late.level = 14;
    late.prestige = 1;
    late.upgrades.miner = 4;
    late.upgrades.drill = 3;
    late.upgrades.reactor = 3;
    late.upgrades.turret = 2;
    late.upgrades.shield = 2;
    late.upgrades.scout = 2;
    late.upgrades.arsenal = 1;

    const earlyDerived = computeDerived(early);
    const midDerived = computeDerived(mid);
    const lateDerived = computeDerived(late);

    expect(midDerived.cityStage).toBeGreaterThan(earlyDerived.cityStage);
    expect(lateDerived.cityStage).toBeGreaterThan(midDerived.cityStage);
    expect(lateDerived.homeDevelopment).toBeGreaterThan(midDerived.homeDevelopment);
    expect(midDerived.cityBuildProgress).toBeGreaterThan(earlyDerived.cityBuildProgress);
    expect(lateDerived.cityBuildProgress).toBeGreaterThan(midDerived.cityBuildProgress);
  });

  it("upgrade investment nudges city growth forward", () => {
    const base = createInitialGameState();
    const upgraded = createInitialGameState();

    upgraded.level = base.level;
    upgraded.upgrades.turret = 1;
    upgraded.upgrades.shield = 1;
    upgraded.upgrades.scout = 1;

    const baseDerived = computeDerived(base);
    const upgradedDerived = computeDerived(upgraded);

    expect(upgradedDerived.cityBuildProgress).toBeGreaterThan(baseDerived.cityBuildProgress);
  });

  it("never produces NaN resources over a long run", () => {
    const final = runTicks(createInitialGameState(), 2_000);
    for (const key of Object.keys(final.resources) as Array<keyof GameState["resources"]>) {
      expect(Number.isFinite(final.resources[key])).toBe(true);
      expect(final.resources[key]).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isFinite(final.xp)).toBe(true);
    expect(Number.isFinite(final.combo)).toBe(true);
  });

  it("keeps node corruption clamped to 0..100", () => {
    const seeded = createInitialGameState();
    seeded.enemies.push(spawnEnemy(seeded.nextEnemyId++, 0, "corruptor"));
    const final = runTicks(seeded, 1_500);
    for (const node of final.nodes) {
      expect(node.corruption).toBeGreaterThanOrEqual(0);
      expect(node.corruption).toBeLessThanOrEqual(100);
    }
  });

  it("never corrupts gold nodes", () => {
    const seeded = createInitialGameState();
    for (let i = 0; i < 4; i += 1) {
      seeded.enemies.push(spawnEnemy(seeded.nextEnemyId++, 0, "corruptor"));
    }
    const final = runTicks(seeded, 2_000);
    const corruptedGold = final.nodes.filter((node) => node.kind === "gold" && (node.corrupted || node.corruption > 0));
    expect(corruptedGold).toHaveLength(0);
  });

  it("turret targeting excludes corruptors", () => {
    const seeded = createInitialGameState();
    seeded.upgrades.turret = 2;
    const seededCorruptors = new Map<number, number>();
    for (let i = 0; i < 3; i += 1) {
      const enemy = spawnEnemy(seeded.nextEnemyId++, 0, "corruptor");
      enemy.x = seeded.turrets[0].x + 30;
      enemy.y = seeded.turrets[0].y;
      seeded.enemies.push(enemy);
      seededCorruptors.set(enemy.id, enemy.hp);
    }
    const after = runTicks(seeded, 40);
    for (const [id, startHp] of seededCorruptors) {
      const alive = after.enemies.find((enemy) => enemy.id === id);
      if (!alive) continue;
      expect(alive.hp).toBeGreaterThanOrEqual(startHp);
      expect(alive.flash).toBe(0);
    }
  });

  it("scouts prefer corruptors over sweep targets", () => {
    const seeded = createInitialGameState();
    seeded.upgrades.scout = 2;
    const corruptor = spawnEnemy(seeded.nextEnemyId++, 0, "corruptor");
    corruptor.x = 400;
    corruptor.y = 300;
    seeded.enemies.push(corruptor);
    seeded.nodes[0].corruption = 40;
    seeded.nodes[0].kind = "ore";
    const after = runTicks(seeded, 10);
    const liveScouts = after.scouts.slice(0, 2);
    const anyTargeting = liveScouts.some((scout) => scout.targetId === corruptor.id);
    expect(anyTargeting).toBe(true);
  });

  it("worker evade persists across multiple ticks once triggered", () => {
    const seeded = createInitialGameState();
    const agent = seeded.agents[0];
    const enemy = spawnEnemy(seeded.nextEnemyId++, 0);
    enemy.x = agent.x + 10;
    enemy.y = agent.y + 10;
    seeded.enemies.push(enemy);
    const afterTrigger = advanceGame(seeded);
    const triggeredAgent = afterTrigger.agents[0];
    expect(triggeredAgent.evadeTicks).toBeGreaterThan(1);
    const enemyIndex = afterTrigger.enemies.findIndex((item) => item.id === enemy.id);
    if (enemyIndex >= 0) {
      afterTrigger.enemies.splice(enemyIndex, 1);
    }
    const later = advanceGame(afterTrigger);
    expect(later.agents[0].evadeTicks).toBeGreaterThan(0);
  });

  it("derived state stays consistent with simulation", () => {
    const final = runTicks(createInitialGameState(), 500);
    const derived = computeDerived(final);
    expect(Number.isFinite(derived.totalIncome)).toBe(true);
    expect(derived.colonyHealth).toBeGreaterThanOrEqual(0);
    expect(derived.colonyHealth).toBeLessThanOrEqual(100);
    expect(derived.activeCorruptionNodes).toBe(final.nodes.filter((node) => node.kind !== "gold" && node.corruption > 3).length);
    expect(derived.corruptedNodes).toBe(final.nodes.filter((node) => node.corrupted).length);
  });

  it("treats lingering corruption residue as active corruption pressure", () => {
    const seeded = createInitialGameState();
    seeded.nodes[0].kind = "ore";
    seeded.nodes[0].corruption = 40;
    seeded.nodes[0].corrupted = false;

    const derived = computeDerived(seeded);

    expect(derived.activeCorruptionNodes).toBe(1);
    expect(derived.corruptedNodes).toBe(0);
    expect(derived.corruptionPressure).toBe(true);
  });
});
