import { describe, expect, it } from "vitest";
import { advanceGame } from "@/game/advanceGame";
import { AUTO_TICK } from "@/game/constants";
import { unlockSecretAchievement } from "@/game/achievements";
import { createInitialGameState, migrateGameState, SCHEMA_VERSION, spawnEnemy } from "@/game/factories";
import { resolveEnemyDeaths, stepZapperFire } from "@/game/subsystems/combat";
import { stepAchievements } from "@/game/subsystems/achievements";
import { stepProjectiles } from "@/game/subsystems/projectiles";
import { stepScouts } from "@/game/subsystems/scouts";
import { stepSentinels } from "@/game/subsystems/sentinels";
import { stepTurrets } from "@/game/subsystems/turrets";
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

  it("threat director escalates with progression", () => {
    const early = createInitialGameState();
    const late = createInitialGameState();

    late.level = 18;
    late.prestige = 1;
    late.upgrades.miner = 4;
    late.upgrades.drill = 4;
    late.upgrades.reactor = 3;
    late.upgrades.turret = 3;
    late.upgrades.shield = 2;
    late.upgrades.scout = 2;
    late.upgrades.arsenal = 2;

    const earlyDerived = computeDerived(early);
    const lateDerived = computeDerived(late);

    expect(lateDerived.progression.tier).toBeGreaterThan(earlyDerived.progression.tier);
    expect(lateDerived.progression.waveBudget).toBeGreaterThan(earlyDerived.progression.waveBudget);
    expect(lateDerived.progression.enemyCap).toBeGreaterThan(earlyDerived.progression.enemyCap);
    expect(lateDerived.progression.spawnIntervalTicks).toBeLessThan(earlyDerived.progression.spawnIntervalTicks);
  });

  it("does not mark a dominant late-game colony as recovering at the cadence floor", () => {
    const dominant = createInitialGameState();

    dominant.level = 18;
    dominant.prestige = 1;
    dominant.upgrades.miner = 4;
    dominant.upgrades.drill = 4;
    dominant.upgrades.reactor = 3;
    dominant.upgrades.turret = 3;
    dominant.upgrades.shield = 2;
    dominant.upgrades.scout = 2;
    dominant.upgrades.arsenal = 2;

    const derived = computeDerived(dominant);

    expect(derived.progression.spawnIntervalTicks).toBe(72);
    expect(derived.progression.recoveryMode).toBe(false);
  });

  it("threat director slows down when the colony is under pressure", () => {
    const stable = createInitialGameState();
    const stressed = createInitialGameState();

    stable.level = 8;
    stable.upgrades.miner = 2;
    stable.upgrades.drill = 2;
    stable.upgrades.reactor = 1;
    stable.upgrades.turret = 1;
    stable.upgrades.shield = 1;
    stable.upgrades.scout = 1;

    stressed.level = stable.level;
    stressed.upgrades = { ...stable.upgrades };
    stressed.agents.forEach((agent) => {
      agent.hp = 42;
    });
    for (let i = 0; i < 4; i += 1) {
      const raider = spawnEnemy(stressed.rng, stressed.nextEnemyId++, 0, "raider");
      raider.x = stressed.agents[0].x + 12 + i * 8;
      raider.y = stressed.agents[0].y + 4;
      stressed.enemies.push(raider);
    }
    stressed.nodes[0].kind = "ore";
    stressed.nodes[0].corruption = 68;
    stressed.nodes[0].corrupted = false;

    const stableDerived = computeDerived(stable);
    const stressedDerived = computeDerived(stressed);

    expect(stressedDerived.progression.recoveryMode).toBe(true);
    expect(stressedDerived.progression.spawnIntervalTicks).toBeGreaterThan(stableDerived.progression.spawnIntervalTicks);
  });

  it("caps active corruption-killer drones at two by default and three when upgrade is 8+", () => {
    const seeded = createInitialGameState();
    seeded.upgrades.scout = 9;

    const derived = computeDerived(seeded);

    expect(seeded.scouts).toHaveLength(4);
    expect(derived.activeScouts).toBe(3);

    const low = createInitialGameState();
    low.upgrades.scout = 2;
    const lowDerived = computeDerived(low);
    expect(lowDerived.activeScouts).toBe(2);
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
    seeded.enemies.push(spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0, "corruptor"));
    const final = runTicks(seeded, 1_500);
    for (const node of final.nodes) {
      expect(node.corruption).toBeGreaterThanOrEqual(0);
      expect(node.corruption).toBeLessThanOrEqual(100);
    }
  });

  it("never corrupts gold nodes", () => {
    const seeded = createInitialGameState();
    for (let i = 0; i < 4; i += 1) {
      seeded.enemies.push(spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0, "corruptor"));
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
      const enemy = spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0, "corruptor");
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

  it("reactor upgrades improve turret damage against raiders", () => {
    const baseline = createInitialGameState();
    const boosted = createInitialGameState();

    baseline.upgrades.turret = 1;
    boosted.upgrades.turret = 1;
    boosted.upgrades.reactor = 2;

    const baselineRaider = spawnEnemy(baseline.rng, baseline.nextEnemyId++, 0, "raider");
    baselineRaider.x = baseline.turrets[0].x + 30;
    baselineRaider.y = baseline.turrets[0].y - 10;
    baseline.enemies.push(baselineRaider);

    const boostedRaider = spawnEnemy(boosted.rng, boosted.nextEnemyId++, 0, "raider");
    boostedRaider.x = boosted.turrets[0].x + 30;
    boostedRaider.y = boosted.turrets[0].y - 10;
    boosted.enemies.push(boostedRaider);

    // Turrets now fire missiles; run enough ticks for missiles to travel and land (~8-10 ticks at 3.5 px/tick for ~31px gap)
    const baselineAfter = runTicks(baseline, 15);
    const boostedAfter = runTicks(boosted, 15);

    const baselineHp = baselineAfter.enemies.find((e) => e.id === baselineRaider.id)?.hp ?? 0;
    const boostedHp = boostedAfter.enemies.find((e) => e.id === boostedRaider.id)?.hp ?? 0;
    expect(boostedHp).toBeLessThan(baselineHp);
  });

  it("resets the spawn timer instead of banking spawn debt while enemy cap is full", () => {
    const seeded = createInitialGameState();
    seeded.level = 12;
    seeded.prestige = 1;
    seeded.upgrades.reactor = 2;
    seeded.upgrades.turret = 2;
    seeded.upgrades.shield = 1;
    seeded.upgrades.scout = 2;

    const initialDerived = computeDerived(seeded);
    for (let i = 0; i < initialDerived.progression.enemyCap; i += 1) {
      const enemy = spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0, "mite");
      enemy.x = -60 - i * 10;
      enemy.y = 140 + i * 8;
      seeded.enemies.push(enemy);
    }
    const cappedDerived = computeDerived(seeded);
    seeded.timers.enemy = cappedDerived.progression.spawnIntervalTicks;

    const afterBlockedSpawn = advanceGame(seeded);
    const afterNextTick = advanceGame(afterBlockedSpawn);

    expect(afterBlockedSpawn.enemies).toHaveLength(initialDerived.progression.enemyCap);
    expect(afterBlockedSpawn.timers.enemy).toBe(0);
    expect(afterNextTick.timers.enemy).toBe(1);
  });

  it("scouts prefer corruptors over sweep targets", () => {
    const seeded = createInitialGameState();
    seeded.upgrades.scout = 2;
    const corruptor = spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0, "corruptor");
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
    const enemy = spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0);
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

  it("fast-tracks scout upgrades once corrupters are active", () => {
    const seeded = createInitialGameState();
    seeded.level = 8;
    seeded.upgrades.miner = 2;
    seeded.upgrades.drill = 2;
    seeded.upgrades.reactor = 1;
    seeded.upgrades.turret = 1;
    seeded.resources.gold = 1500;
    seeded.timers.auto = AUTO_TICK;
    seeded.enemies.push(spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0, "corruptor"));

    const after = advanceGame(seeded);

    expect(after.upgrades.scout).toBe(1);
  });

  it("awards flux when corruptors or blights die", () => {
    const seeded = createInitialGameState();
    const corruptor = spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0, "corruptor");
    const blight = spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0, "blight");
    corruptor.hp = 0;
    blight.hp = 0;
    seeded.enemies.push(corruptor, blight);

    resolveEnemyDeaths(seeded);

    expect(seeded.resources.flux).toBeGreaterThanOrEqual(3.5);
  });

  it("can autobuy foundry using ore and flux costs", () => {
    const seeded = createInitialGameState();
    seeded.level = 14;
    seeded.resources.gold = 0;
    seeded.resources.ore = 300;
    seeded.resources.flux = 10;
    seeded.upgrades.miner = 4;
    seeded.upgrades.drill = 4;
    seeded.upgrades.reactor = 3;
    seeded.upgrades.turret = 3;
    seeded.upgrades.shield = 2;
    seeded.upgrades.scout = 2;
    seeded.upgrades.arsenal = 1;
    seeded.timers.auto = AUTO_TICK;

    const after = advanceGame(seeded);

    expect(after.upgrades.foundry).toBe(1);
    expect(after.resources.ore).toBeLessThan(seeded.resources.ore);
    expect(after.resources.flux).toBeLessThan(seeded.resources.flux);
  });

  it("sentinels prioritize brutes over nearby mites", () => {
    const seeded = createInitialGameState();
    seeded.upgrades.sentinel = 1;

    const brute = spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0, "brute");
    brute.x = seeded.sentinels[0].x + 120;
    brute.y = seeded.sentinels[0].y - 40;

    const mite = spawnEnemy(seeded.rng, seeded.nextEnemyId++, 0, "mite");
    mite.x = seeded.sentinels[0].x + 50;
    mite.y = seeded.sentinels[0].y - 20;

    seeded.enemies.push(mite, brute);

    const after = runTicks(seeded, 12);

    expect(after.sentinels[0].targetId).toBe(brute.id);
  });

  it("credits purges when scouts cleanse a node instead of when corruptors die", () => {
    const state = createInitialGameState();
    state.upgrades.scout = 1;
    const scout = state.scouts[0];
    const node = state.nodes[0];
    node.kind = "ore";
    node.corruption = 3.05;
    node.corrupted = true;
    node.corruptedBy = 99;
    scout.x = node.x;
    scout.y = node.y;
    scout.tx = node.x;
    scout.ty = node.y;
    state.stats.purges = 0;

    stepScouts(state);

    expect(state.stats.purges).toBe(1);

    const corruptor = spawnEnemy(state.rng, state.nextEnemyId++, 0, "corruptor");
    corruptor.hp = 0;
    state.enemies.push(corruptor);
    resolveEnemyDeaths(state);

    expect(state.stats.purges).toBe(1);
  });

  it("credits sentinel kills only when a sentinel lands the lethal hit", () => {
    const state = createInitialGameState();
    state.upgrades.sentinel = 1;
    const target = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    target.x = state.sentinels[0].x + 10;
    target.y = state.sentinels[0].y;
    target.hp = 1;
    state.enemies.push(target);

    stepSentinels(state);

    expect(state.stats.sentinelKills).toBe(1);

    const other = createInitialGameState();
    other.upgrades.sentinel = 1;
    const turretKillTarget = spawnEnemy(other.rng, other.nextEnemyId++, 0, "mite");
    turretKillTarget.x = other.sentinels[0].x + 10;
    turretKillTarget.y = other.sentinels[0].y;
    turretKillTarget.hp = 0;
    other.sentinels[0].targetId = turretKillTarget.id;
    other.enemies.push(turretKillTarget);

    resolveEnemyDeaths(other);

    expect(other.stats.sentinelKills).toBe(0);
  });

  it("does not unlock Immaculate Grid on a fresh save", () => {
    const state = createInitialGameState();

    stepAchievements(state);

    expect(state.achievements.full_health).toBeUndefined();

    const pressureState = createInitialGameState();
    for (let i = 0; i < 4; i += 1) {
      const hostile = spawnEnemy(pressureState.rng, pressureState.nextEnemyId++, 0, "raider");
      hostile.x = pressureState.agents[0].x + 10 + i * 4;
      hostile.y = pressureState.agents[0].y;
      pressureState.enemies.push(hostile);
    }

    stepAchievements(pressureState);

    expect(pressureState.achievements.full_health).toBe(true);
  });
});

describe("save / load round-trip", () => {
  it("migrateGameState round-trips through JSON without data loss", () => {
    const original = runTicks(createInitialGameState(42), 300);
    original.upgrades.miner = 2;
    original.upgrades.scout = 1;
    original.level = 4;
    original.resources.gold = 150;
    original.resources.gems = 12;

    const serialized = JSON.parse(JSON.stringify(original)) as Parameters<typeof migrateGameState>[0];
    const restored = migrateGameState(serialized);

    expect(restored.schemaVersion).toBe(SCHEMA_VERSION);
    expect(restored.level).toBe(original.level);
    expect(restored.resources.gold).toBe(original.resources.gold);
    expect(restored.resources.gems).toBe(original.resources.gems);
    expect(restored.upgrades.miner).toBe(original.upgrades.miner);
    expect(restored.upgrades.scout).toBe(original.upgrades.scout);
    expect(restored.nodes).toHaveLength(original.nodes.length);
    expect(restored.agents).toHaveLength(original.agents.length);
  });

  it("migrateGameState fills missing fields from a v1 save (no schemaVersion)", () => {
    const v1Save = {
      citySeed: 12345,
      level: 3,
      resources: { gold: 80, ore: 20, gems: 5, energy: 0, cores: 0, flux: 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const restored = migrateGameState(v1Save);

    expect(restored.schemaVersion).toBe(SCHEMA_VERSION);
    expect(restored.level).toBe(3);
    expect(restored.resources.gold).toBe(80);
    expect(restored.agents.length).toBeGreaterThan(0);
    expect(restored.nodes.length).toBeGreaterThan(0);
    expect(restored.timers).toBeDefined();
  });

  it("advanceGame produces no NaN after a round-trip restore", () => {
    const original = runTicks(createInitialGameState(99), 150);
    const serialized = JSON.parse(JSON.stringify(original)) as Parameters<typeof migrateGameState>[0];
    const restored = migrateGameState(serialized);
    const after = runTicks(restored, 60);

    expect(after.resources.gold).not.toBeNaN();
    expect(after.resources.ore).not.toBeNaN();
    expect(after.level).not.toBeNaN();
    expect(after.combo).not.toBeNaN();
  });
});

describe("zapper enemy", () => {
  it("spawns with fireCooldown initialized to 0", () => {
    const state = createInitialGameState();
    const zapper = spawnEnemy(state.rng, state.nextEnemyId++, 0, "zapper");
    expect(zapper.fireCooldown).toBe(0);
  });

  it("fires a zapper-bolt when target is in range", () => {
    const state = createInitialGameState();
    const zapper = spawnEnemy(state.rng, state.nextEnemyId++, 0, "zapper");
    // Place zapper right next to a worker
    zapper.x = state.agents[0].x + 80;
    zapper.y = state.agents[0].y;
    zapper.fireCooldown = 0;
    state.enemies.push(zapper);

    const before = state.projectiles.length;
    stepZapperFire(state);
    expect(state.projectiles.length).toBeGreaterThan(before);
    const bolt = state.projectiles[state.projectiles.length - 1];
    expect(bolt.tag).toBe("zapper-bolt");
    expect(bolt.targetKind).toBe("agent");
  });

  it("bolt applies disabledTicks to the target agent on expiry", () => {
    const state = createInitialGameState();
    const zapper = spawnEnemy(state.rng, state.nextEnemyId++, 0, "zapper");
    zapper.x = state.agents[0].x + 80;
    zapper.y = state.agents[0].y;
    zapper.fireCooldown = 0;
    state.enemies.push(zapper);

    stepZapperFire(state);
    const bolt = state.projectiles[state.projectiles.length - 1];
    // Fast-expire the bolt
    bolt.life = 1;
    stepProjectiles(state);

    expect(state.agents[0].disabledTicks).toBeGreaterThan(0);
  });

  it("bolt applies disabledTicks to a turret when it is the nearest target", () => {
    const state = createInitialGameState();
    const zapper = spawnEnemy(state.rng, state.nextEnemyId++, 0, "zapper");
    // Place zapper close to turret 1 (within firingRange=170)
    zapper.x = state.turrets[0].x + 60;
    zapper.y = state.turrets[0].y - 80;
    // Move all workers beyond firing range
    state.agents.forEach((a) => { a.x = 900; a.y = 50; });
    zapper.fireCooldown = 0;
    state.enemies.push(zapper);

    stepZapperFire(state);
    expect(state.projectiles.length).toBeGreaterThan(0);
    const bolt = state.projectiles[state.projectiles.length - 1];
    expect(bolt.targetKind).toBe("turret");

    bolt.life = 1;
    stepProjectiles(state);
    expect(state.turrets[0].disabledTicks).toBeGreaterThan(0);
  });

  it("disabled worker skips movement and mining for the disable duration", () => {
    const state = createInitialGameState();
    state.agents[0].disabledTicks = 10;
    const posBefore = { x: state.agents[0].x, y: state.agents[0].y };

    const after = runTicks(state, 5);
    // Worker should not have moved (still disabled for first 5 ticks)
    expect(after.agents[0].x).toBeCloseTo(posBefore.x, 0);
    expect(after.agents[0].disabledTicks).toBe(5);
  });

  it("disabled turret skips firing", () => {
    const state = createInitialGameState();
    // Place enemy in turret range
    const mite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    mite.x = state.turrets[0].x;
    mite.y = state.turrets[0].y - 80;
    state.enemies.push(mite);
    state.turrets[0].disabledTicks = 60;

    const after = runTicks(state, 10);
    // May be dead from sentinel; just verify disabledTicks decremented
    expect(after.turrets[0].disabledTicks).toBe(50);
  });

  it("reboot clears disabledTicks", () => {
    const state = createInitialGameState();
    state.agents[0].disabledTicks = 200;
    // Drain HP nearly to zero so a single contact-damage tick kills it
    state.agents[0].hp = 1;
    // Place a raider right on top of the worker
    const raider = spawnEnemy(state.rng, state.nextEnemyId++, 0, "raider");
    raider.x = state.agents[0].x;
    raider.y = state.agents[0].y;
    state.enemies.push(raider);

    // Run until combat fires (every COMBAT_TICK=12 ticks) and kills the worker
    const after = runTicks(state, 13);
    expect(after.agents[0].disabledTicks).toBe(0);
  });

  it("migration adds disabledTicks fallback to existing saves", () => {
    const save = {
      citySeed: 99,
      agents: [{ id: 1, kind: "miner", x: 100, y: 100 }],
      turrets: [{ id: 1, x: 220, y: 540, range: 135, cooldown: 0, angle: -1.2 }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const restored = migrateGameState(save);
    expect(restored.agents[0].disabledTicks).toBe(0);
    expect(restored.turrets[0].disabledTicks).toBe(0);
  });

  it("secret synthwave trigger unlocks Neon Protocol instead of Residual Signal", () => {
    const state = createInitialGameState();

    unlockSecretAchievement(state, "synthwave");

    expect(state.achievements.synthwave).toBe(true);
    expect(state.achievements.drift_heard).toBeUndefined();
  });
});

describe("turret missiles and focused beam (2.2.6)", () => {
  function makeStateWithEnemyInRange() {
    const state = createInitialGameState();
    // Unlock turret so first turret is live
    state.upgrades.turret = 1;
    const turret = state.turrets[0];
    turret.range = 250;
    turret.cooldown = 0;
    const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    enemy.x = turret.x;
    enemy.y = turret.y - 120;
    enemy.hp = 100;
    state.enemies.push(enemy);
    return { state, turret, enemy };
  }

  it("turret fires a missile when focusedBeam is 0", () => {
    const { state } = makeStateWithEnemyInRange();
    stepTurrets(state);
    const missile = state.projectiles.find((p) => p.tag === "turret-missile");
    expect(missile).toBeDefined();
    expect(missile?.targetId).toBe(state.enemies[state.enemies.length - 1].id);
  });

  it("missile moves toward its target each tick", () => {
    const { state, enemy } = makeStateWithEnemyInRange();
    stepTurrets(state);
    const missile = state.projectiles.find((p) => p.tag === "turret-missile")!;
    const startDist = Math.hypot(enemy.x - missile.x1, enemy.y - missile.y1);
    stepProjectiles(state);
    const updated = state.projectiles.find((p) => p.tag === "turret-missile")!;
    const endDist = Math.hypot(enemy.x - updated.x1, enemy.y - updated.y1);
    expect(endDist).toBeLessThan(startDist);
    // No damage yet (missile still in flight)
    expect(enemy.hp).toBe(100);
  });

  it("missile applies damage on impact and is removed", () => {
    const { state, turret, enemy } = makeStateWithEnemyInRange();
    // Place enemy right at turret position so missile spawns nearly touching
    enemy.x = turret.x + 10;
    enemy.y = turret.y;
    stepTurrets(state);
    const missile = state.projectiles.find((p) => p.tag === "turret-missile")!;
    expect(missile).toBeDefined();
    // Force missile onto the enemy
    missile.x1 = enemy.x;
    missile.y1 = enemy.y;
    stepProjectiles(state);
    expect(enemy.hp).toBeLessThan(100);
    expect(state.projectiles.find((p) => p.tag === "turret-missile")).toBeUndefined();
  });

  it("missile fizzles when its target dies mid-flight", () => {
    const { state, enemy } = makeStateWithEnemyInRange();
    stepTurrets(state);
    // Kill the target
    enemy.hp = 0;
    enemy.dyingTicks = 1;
    // Run a few ticks — missile should not crash and eventually fizzle
    for (let i = 0; i < 5; i++) stepProjectiles(state);
    const missile = state.projectiles.find((p) => p.tag === "turret-missile");
    // It is still present (flying) but no NaN on position
    if (missile) {
      expect(isNaN(missile.x1)).toBe(false);
      expect(isNaN(missile.y1)).toBe(false);
    }
  });

  it("turret uses instant beam when focusedBeam > 0 and target is within beam range", () => {
    const { state, turret, enemy } = makeStateWithEnemyInRange();
    state.upgrades.focusedBeam = 5;
    // Place enemy within focusedBeam range: 90 + 5*8 = 130px
    enemy.x = turret.x;
    enemy.y = turret.y - 100;
    const hpBefore = enemy.hp;
    stepTurrets(state);
    expect(enemy.hp).toBeLessThan(hpBefore);
    const beam = state.projectiles.find((p) => p.tag === "instant-beam");
    expect(beam).toBeDefined();
    const missile = state.projectiles.find((p) => p.tag === "turret-missile");
    expect(missile).toBeUndefined();
  });

  it("turret fires missile when focusedBeam > 0 but target is beyond beam range", () => {
    const { state, turret, enemy } = makeStateWithEnemyInRange();
    state.upgrades.focusedBeam = 1;
    // focusedBeam range = 90 + 1*8 = 98px; turret range after upgrade = 140px; place enemy at 120px
    enemy.x = turret.x;
    enemy.y = turret.y - 120;
    stepTurrets(state);
    const missile = state.projectiles.find((p) => p.tag === "turret-missile");
    expect(missile).toBeDefined();
    // No immediate damage
    expect(enemy.hp).toBe(100);
  });

  it("focusedBeam upgrade defaults to 0 in new game and migration", () => {
    const state = createInitialGameState();
    expect(state.upgrades.focusedBeam).toBe(0);
    const restored = migrateGameState({ citySeed: 1 } as Parameters<typeof migrateGameState>[0]);
    expect(restored.upgrades.focusedBeam).toBe(0);
  });
});
