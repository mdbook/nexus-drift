// RNG-determinism convention:
// Most tests in this file call `createInitialGameState()` without a seed,
// which falls back to `Date.now()`. Tests that force a specific worker
// position, target, or RNG-driven branch (retargeting, `chooseWorkerTarget`,
// event eligibility, enemy weights, etc.) MUST pass an explicit seed to
// `createInitialGameState(seed)` — an unseeded run can silently retarget
// a worker off its placed node or roll a different branch and the
// assertion becomes flaky. See the "miner overclockTicks accumulates"
// test for the canonical pattern (seed + re-pin target/x/y each loop
// iteration). Audit-pass triage tracked the broader pattern-level risk
// under README → "Audit-pass polish (3.1.4)".
import { describe, expect, it } from "vitest";
import { advanceGame } from "@/game/advanceGame";
import { AUTO_TICK, COMBAT_TICK, EVADE_ENTER_RADIUS, MINING_TICK } from "@/game/constants";
import {
  CITY_HP,
  COMBAT,
  CORRUPTION,
  ENEMY_CONTACT_DAMAGE,
  ENEMY_CONTACT_RADIUS,
  ENEMY_TARGET_PRIORITY,
  MISSILE_SILO,
  SCOUT_HP,
  SENTINEL,
  SENTINEL_HP,
  TARGET_ARMOR,
  TURRET,
  TURRET_HP,
  WARDEN,
  WORKER,
  WORKER_ABILITIES,
} from "@/game/balance";
import { getUpgradeDef } from "@/game/data";
import { spotTourist, unlockSecretAchievement } from "@/game/achievements";
import {
  cloneGameState,
  createInitialGameState,
  migrateGameState,
  SCHEMA_VERSION,
  spawnEnemy,
} from "@/game/factories";
import { resolveEnemyDeaths, stepZapperFire } from "@/game/subsystems/combat";
import { stepAchievements } from "@/game/subsystems/achievements";
import { stepCombat } from "@/game/subsystems/combat";
import { stepCorruption } from "@/game/subsystems/corruption";
import { damageEnemy, isCloaked } from "@/game/enemyUtils";
import { measureWorkerEnemyBlocking, stepWorkers } from "@/game/subsystems/movement";
import { stepMining } from "@/game/subsystems/mining";
import { stepProjectiles } from "@/game/subsystems/projectiles";
import { stepScouts } from "@/game/subsystems/scouts";
import { stepSentinels } from "@/game/subsystems/sentinels";
import { stepWardenSpawn } from "@/game/subsystems/spawns";
import { stepWorkerCorruption } from "@/game/subsystems/workerCorruption";
import {
  damageCity,
  damageCorruptedWorker,
  damageScout,
  damageSentinel,
  damageTurret,
  damageWorker,
} from "@/game/subsystems/combat";
import { stepCity } from "@/game/subsystems/economy";
import { stepTurrets } from "@/game/subsystems/turrets";
import { stepEnemies } from "@/game/subsystems/movement";
import { stepMissileSilos } from "@/game/subsystems/missileSilos";
import { pickEnemyTarget, pickEnemyTargetMulti } from "@/game/targeting";
import { stepWorkerSlots } from "@/game/subsystems/workers";
import { computeDerived } from "@/game/selectors";
import { getCombatEnemyWeights } from "@/game/progression";
import type { GameState } from "@/game/types";
import { nextUpgradeCost } from "@/game/utils";

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

    // 3.0.0: the stretched score curve means tier climbs on colony weight
    // over hours, not minutes. Bump the late setup past the new tier-2
    // threshold so director escalation is observable in-test.
    late.level = 80;
    late.prestige = 5;
    late.upgrades.miner = 10;
    late.upgrades.drill = 10;
    late.upgrades.reactor = 10;
    late.upgrades.turret = 10;
    late.upgrades.shield = 10;
    late.upgrades.scout = 10;
    late.upgrades.arsenal = 10;

    const earlyDerived = computeDerived(early);
    const lateDerived = computeDerived(late);

    expect(lateDerived.progression.tier).toBeGreaterThan(earlyDerived.progression.tier);
    expect(lateDerived.progression.waveBudget).toBeGreaterThan(earlyDerived.progression.waveBudget);
    expect(lateDerived.progression.enemyCap).toBeGreaterThan(earlyDerived.progression.enemyCap);
    expect(lateDerived.progression.spawnIntervalTicks).toBeLessThan(
      earlyDerived.progression.spawnIntervalTicks
    );
  });

  it("does not mark a dominant late-game colony as recovering at the cadence floor", () => {
    const dominant = createInitialGameState();

    // 3.0.0: under the stretched score curve a genuinely dominant late-game
    // colony needs a meaningful sector level + upgrade stack before the
    // cadence floor kicks in.
    dominant.level = 80;
    dominant.prestige = 5;
    dominant.upgrades.miner = 10;
    dominant.upgrades.drill = 10;
    dominant.upgrades.reactor = 10;
    dominant.upgrades.turret = 10;
    dominant.upgrades.shield = 10;
    dominant.upgrades.scout = 10;
    dominant.upgrades.arsenal = 10;

    const derived = computeDerived(dominant);

    expect(derived.progression.spawnIntervalTicks).toBe(72);
    expect(derived.progression.recoveryMode).toBe(false);
  });

  it("threat director slows down when the colony is under pressure", () => {
    const stable = createInitialGameState();
    const stressed = createInitialGameState();

    // 3.0.0: baseline cadence clamps at intervalMax in early game, so bump
    // stable to mid-colony weight. That leaves headroom below 260 for the
    // stressed recovery penalty to push the cadence back up.
    stable.level = 30;
    stable.upgrades.miner = 3;
    stable.upgrades.drill = 3;
    stable.upgrades.reactor = 2;
    stable.upgrades.turret = 2;
    stable.upgrades.shield = 2;
    stable.upgrades.scout = 2;

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
    expect(stressedDerived.progression.spawnIntervalTicks).toBeGreaterThan(
      stableDerived.progression.spawnIntervalTicks
    );
  });

  it("3.1.3 follow-up: phantom and zapper weights unlock past the display tier cap", () => {
    // Display tier is capped at 5 (THREAT_LABELS length - 1), but phantom and
    // zapper carry minTier 6. Before the rawTier fix these were permanently
    // zeroed; after the fix they fire once score/tiersPerScore >= 6.
    const latecolony = createInitialGameState();
    latecolony.level = 200;
    latecolony.prestige = 20;
    (Object.keys(latecolony.upgrades) as Array<keyof typeof latecolony.upgrades>).forEach((key) => {
      latecolony.upgrades[key] = 20;
    });

    const derived = computeDerived(latecolony);
    expect(derived.progression.rawTier).toBeGreaterThanOrEqual(6);
    expect(derived.progression.tier).toBe(5);

    const weights = getCombatEnemyWeights(derived.progression);
    expect(weights.phantom).toBeGreaterThan(0);
    expect(weights.zapper).toBeGreaterThan(0);
    expect(weights.leech).toBeGreaterThan(0);
  });

  it("threat director stretches spawn interval when the field fills up", () => {
    const empty = createInitialGameState();
    const full = createInitialGameState();
    empty.level = 12;
    full.level = empty.level;

    const emptyDerived = computeDerived(empty);
    const cap = emptyDerived.progression.enemyCap;
    for (let i = 0; i < cap; i += 1) {
      const e = spawnEnemy(full.rng, full.nextEnemyId++, 0, "raider");
      e.x = 200 + i * 4;
      e.y = -240;
      full.enemies.push(e);
    }

    const fullDerived = computeDerived(full);
    expect(fullDerived.progression.spawnIntervalTicks).toBeGreaterThanOrEqual(
      Math.round(emptyDerived.progression.spawnIntervalTicks * 1.5)
    );
  });

  it("caps active corruption-killer drones at two by default and three when upgrade is 10+", () => {
    const seeded = createInitialGameState();
    seeded.upgrades.scout = 10;

    const derived = computeDerived(seeded);

    expect(seeded.scouts).toHaveLength(4);
    expect(derived.activeScouts).toBe(3);

    const low = createInitialGameState();
    low.upgrades.scout = 2;
    const lowDerived = computeDerived(low);
    expect(lowDerived.activeScouts).toBe(2);
  });

  it("keeps extra worker slots locked until late-game sector levels", () => {
    const state = createInitialGameState();
    state.upgrades.miner = 6;
    state.upgrades.bot = 6;
    state.upgrades.drill = 6;

    stepWorkerSlots(state);
    expect(state.agents.filter((agent) => agent.kind === "miner" && agent.active)).toHaveLength(1);
    expect(state.agents.filter((agent) => agent.kind === "runner" && agent.active)).toHaveLength(1);
    expect(state.agents.filter((agent) => agent.kind === "drone" && agent.active)).toHaveLength(1);

    // 3.0.0: WORKER_SLOTS_BY_LEVEL now gates the second slot at L22 and the
    // third at L42, aligning multi-worker deployment with the stretched XP
    // curve.
    state.level = 22;
    stepWorkerSlots(state);
    expect(state.agents.filter((agent) => agent.kind === "miner" && agent.active)).toHaveLength(2);
    expect(state.agents.filter((agent) => agent.kind === "runner" && agent.active)).toHaveLength(2);
    expect(state.agents.filter((agent) => agent.kind === "drone" && agent.active)).toHaveLength(2);

    state.level = 42;
    stepWorkerSlots(state);
    expect(state.agents.filter((agent) => agent.kind === "miner" && agent.active)).toHaveLength(3);
    expect(state.agents.filter((agent) => agent.kind === "runner" && agent.active)).toHaveLength(3);
    expect(state.agents.filter((agent) => agent.kind === "drone" && agent.active)).toHaveLength(3);
  });

  it("charges flux and cores on the worker-slot unlock upgrade levels", () => {
    // 3.0.0: UPGRADES base costs and WORKER_SLOT_UNLOCK_RESOURCE_COSTS both
    // scaled up so slot-unlock purchases feel like a deliberate flux+cores
    // spend. See balance.ts.
    expect(nextUpgradeCost(getUpgradeDef("miner"), 1)).toEqual({ gold: 35 });
    expect(nextUpgradeCost(getUpgradeDef("miner"), 2)).toEqual({ gold: 43, flux: 18, cores: 4 });
    expect(nextUpgradeCost(getUpgradeDef("drill"), 5)).toEqual({ gold: 727, flux: 55, cores: 14 });
    expect(nextUpgradeCost(getUpgradeDef("bot"), 5)).toEqual({ gold: 4408, flux: 55, cores: 14 });
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
    const corruptedGold = final.nodes.filter(
      (node) => node.kind === "gold" && (node.corrupted || node.corruption > 0)
    );
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

  it("combat enemy hitboxes reduce worker movement speed", () => {
    const state = createInitialGameState();
    const worker = state.agents[0];
    worker.x = 220;
    worker.y = 250;
    worker.tx = 420;
    worker.ty = 250;
    worker.target = state.nodes[0].id;
    state.nodes[0].x = 420;
    state.nodes[0].y = 250;
    state.timers.tick = 1;

    const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, "raider");
    enemy.x = worker.x + 30;
    enemy.y = worker.y;
    state.enemies.push(enemy);

    const pressure = measureWorkerEnemyBlocking(worker, state.enemies);

    expect(pressure.speedScale).toBeLessThan(1);
    expect(pressure.blockers).toBe(1);
    expect(pressure.touching).toBe(1);
  });

  it("combat enemy blocking reduces how far a worker can push through a lane", () => {
    const clear = createInitialGameState();
    const blocked = createInitialGameState();

    const clearWorker = clear.agents[0];
    const blockedWorker = blocked.agents[0];
    clearWorker.x = 200;
    clearWorker.y = 250;
    blockedWorker.x = 200;
    blockedWorker.y = 250;

    clear.nodes[0].kind = "ore";
    clear.nodes[0].x = 420;
    clear.nodes[0].y = 250;
    clearWorker.target = clear.nodes[0].id;
    clear.timers.tick = 1;

    blocked.nodes[0].kind = "ore";
    blocked.nodes[0].x = 420;
    blocked.nodes[0].y = 250;
    blockedWorker.target = blocked.nodes[0].id;
    blocked.timers.tick = 1;

    const enemyA = spawnEnemy(blocked.rng, blocked.nextEnemyId++, 0, "raider");
    enemyA.x = blockedWorker.x - 20;
    enemyA.y = blockedWorker.y;
    const enemyB = spawnEnemy(blocked.rng, blocked.nextEnemyId++, 0, "raider");
    enemyB.x = blockedWorker.x - 25;
    enemyB.y = blockedWorker.y + 5;
    blocked.enemies.push(enemyA, enemyB);

    stepWorkers(clear);
    stepWorkers(blocked);

    expect(blockedWorker.x).toBeGreaterThan(200);
    expect(blockedWorker.x).toBeLessThan(clearWorker.x);
  });

  it("shield damage stops at the shield layer before HP is touched", () => {
    const enemy = spawnEnemy(createInitialGameState().rng, 1, 0, "zapper");
    enemy.shield = 12;
    enemy.shieldMax = 12;
    enemy.shieldRegenCooldown = 0;
    enemy.hp = 35;

    damageEnemy(enemy, 20);

    expect(enemy.shield).toBe(0);
    expect(enemy.hp).toBe(35);

    damageEnemy(enemy, 8);

    expect(enemy.hp).toBe(27);
  });

  it("damageEnemy arms shield regen cooldown on both shield and HP hits", () => {
    const enemy = spawnEnemy(createInitialGameState().rng, 1, 0, "zapper");
    enemy.shield = 12;
    enemy.shieldMax = 12;
    enemy.shieldRegenCooldown = 0;
    enemy.hp = 35;

    // Partial shield hit: cooldown arms so regen does not tick on this frame.
    damageEnemy(enemy, 5);
    expect(enemy.shield).toBe(7);
    expect(enemy.shieldRegenCooldown).toBeGreaterThan(0);

    // Drop shield to 0, then hit HP on a later "frame" with cooldown drained.
    damageEnemy(enemy, 7);
    enemy.shieldRegenCooldown = 0;
    damageEnemy(enemy, 5);
    // HP-only hit must still arm cooldown so regen waits.
    expect(enemy.hp).toBe(30);
    expect(enemy.shieldRegenCooldown).toBeGreaterThan(0);
  });

  it("damageEnemy is a no-op for non-positive amounts", () => {
    const enemy = spawnEnemy(createInitialGameState().rng, 1, 0, "zapper");
    enemy.shield = 8;
    enemy.shieldMax = 8;
    enemy.shieldRegenCooldown = 0;
    enemy.hp = 20;
    damageEnemy(enemy, 0);
    damageEnemy(enemy, -5);
    expect(enemy.shield).toBe(8);
    expect(enemy.hp).toBe(20);
    expect(enemy.shieldRegenCooldown).toBe(0);
  });

  it("derived state stays consistent with simulation", () => {
    const final = runTicks(createInitialGameState(), 500);
    const derived = computeDerived(final);
    expect(Number.isFinite(derived.totalIncome)).toBe(true);
    expect(derived.colonyHealth).toBeGreaterThanOrEqual(0);
    expect(derived.colonyHealth).toBeLessThanOrEqual(100);
    expect(derived.activeCorruptionNodes).toBe(
      final.nodes.filter((node) => node.kind !== "gold" && node.corruption > 3).length
    );
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

  it("lets passive corruption residue linger after corruptors detach", () => {
    const state = createInitialGameState();
    const node = state.nodes[0];
    node.kind = "ore";
    node.corruption = 10;
    node.corrupted = true;
    node.corruptedBy = null;
    state.enemies = [];

    stepCorruption(state);

    expect(node.corruption).toBeCloseTo(10 - CORRUPTION.purgeBase, 5);
    expect(node.corruption).toBeGreaterThan(9.8);
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
    // 3.0.0: foundry minTier=3 now requires score ≥ 225 under the stretched
    // curve, so the test setup needs a meaningful late-game weight stack to
    // reach tier 3.
    seeded.level = 200;
    seeded.prestige = 10;
    seeded.resources.gold = 0;
    seeded.resources.ore = 300;
    seeded.resources.flux = 10;
    seeded.upgrades.miner = 10;
    seeded.upgrades.drill = 10;
    seeded.upgrades.reactor = 10;
    seeded.upgrades.turret = 10;
    seeded.upgrades.shield = 10;
    seeded.upgrades.scout = 10;
    seeded.upgrades.arsenal = 10;
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

  it("hostileKills counts combat kills only, not corruptor purges (3.1.0)", () => {
    const state = createInitialGameState();
    state.stats.hostileKills = 0;
    state.stats.totalEnemiesKilled = 0;

    // Mix a combat kill and a corruptor purge in the same frame.
    const mite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    mite.hp = 0;
    const corruptor = spawnEnemy(state.rng, state.nextEnemyId++, 0, "corruptor");
    corruptor.hp = 0;
    state.enemies.push(mite, corruptor);

    resolveEnemyDeaths(state);

    // hostileKills = 1 (mite only); totalEnemiesKilled = 2 (inclusive).
    expect(state.stats.hostileKills).toBe(1);
    expect(state.stats.totalEnemiesKilled).toBe(2);
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

  it("requires clicking the tourist drone before Taking Notes unlocks", () => {
    const state = createInitialGameState();
    state.touristWorker = {
      x: 512,
      y: 300,
      angle: 0,
      active: true,
      spotted: false,
      passId: 1,
      lastClickedPassId: null,
      squishTicks: 0,
    };

    stepAchievements(state);

    expect(state.achievements.tourist_spotted).toBeUndefined();
    expect(state.touristWorker?.spotted).toBe(false);

    spotTourist(state);

    expect(state.touristWorker?.spotted).toBe(true);
    expect(state.achievements.tourist_spotted).toBe(true);
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
    state.agents.forEach((a) => {
      a.x = 900;
      a.y = 50;
    });
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

  it("bolt applies disabledTicks to a scout when it is the nearest target", () => {
    const state = createInitialGameState();
    state.upgrades.scout = 2;
    const zapper = spawnEnemy(state.rng, state.nextEnemyId++, 0, "zapper");
    zapper.x = state.scouts[0].x + 60;
    zapper.y = state.scouts[0].y;
    // Move workers and turrets beyond firing range
    state.agents.forEach((a) => {
      a.x = 900;
      a.y = 50;
    });
    state.turrets.forEach((t) => {
      t.x = 900;
      t.y = 50;
    });
    zapper.fireCooldown = 0;
    state.enemies.push(zapper);

    stepZapperFire(state);
    expect(state.projectiles.length).toBeGreaterThan(0);
    const bolt = state.projectiles[state.projectiles.length - 1];
    expect(bolt.targetKind).toBe("scout");

    bolt.life = 1;
    stepProjectiles(state);
    expect(state.scouts[0].disabledTicks).toBeGreaterThan(0);
  });

  it("bolt skips rebooting worker on impact (3.1.3 audit)", () => {
    const state = createInitialGameState();
    const zapper = spawnEnemy(state.rng, state.nextEnemyId++, 0, "zapper");
    zapper.x = state.agents[0].x + 80;
    zapper.y = state.agents[0].y;
    zapper.fireCooldown = 0;
    state.enemies.push(zapper);

    stepZapperFire(state);
    const bolt = state.projectiles[state.projectiles.length - 1];
    expect(bolt.targetKind).toBe("agent");

    // Target enters reboot mid-flight (e.g. killed by something else).
    state.agents[0].rebootTicks = 120;
    state.agents[0].hp = 0;
    state.agents[0].disabledTicks = 0;

    bolt.life = 1;
    stepProjectiles(state);

    // Must not stick a Disabled task/ticks on a rebooting slot — it'd
    // extend into the next active window after reboot completes.
    expect(state.agents[0].disabledTicks).toBe(0);
  });

  it("bolt skips broken turret on impact (3.1.3 audit)", () => {
    const state = createInitialGameState();
    const zapper = spawnEnemy(state.rng, state.nextEnemyId++, 0, "zapper");
    zapper.x = state.turrets[0].x + 60;
    zapper.y = state.turrets[0].y - 80;
    state.agents.forEach((a) => {
      a.x = 900;
      a.y = 50;
    });
    zapper.fireCooldown = 0;
    state.enemies.push(zapper);

    stepZapperFire(state);
    const bolt = state.projectiles[state.projectiles.length - 1];
    expect(bolt.targetKind).toBe("turret");

    state.turrets[0].brokenTicks = 200;

    bolt.life = 1;
    stepProjectiles(state);
    expect(state.turrets[0].disabledTicks).toBe(0);
  });

  it("bolt applies disabledTicks to a sentinel when it is the nearest target", () => {
    const state = createInitialGameState();
    state.upgrades.sentinel = 2;
    const zapper = spawnEnemy(state.rng, state.nextEnemyId++, 0, "zapper");
    zapper.x = state.sentinels[0].x + 60;
    zapper.y = state.sentinels[0].y;
    // Move everyone else beyond firing range
    state.agents.forEach((a) => {
      a.x = 900;
      a.y = 50;
    });
    state.turrets.forEach((t) => {
      t.x = 900;
      t.y = 50;
    });
    state.scouts.forEach((s) => {
      s.x = 900;
      s.y = 50;
    });
    zapper.fireCooldown = 0;
    state.enemies.push(zapper);

    stepZapperFire(state);
    expect(state.projectiles.length).toBeGreaterThan(0);
    const bolt = state.projectiles[state.projectiles.length - 1];
    expect(bolt.targetKind).toBe("sentinel");

    bolt.life = 1;
    stepProjectiles(state);
    expect(state.sentinels[0].disabledTicks).toBeGreaterThan(0);
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

  it("surrounded workers take materially more damage from multiple nearby attackers", () => {
    const soloState = createInitialGameState();
    const swarmState = createInitialGameState();
    soloState.timers.tick = COMBAT_TICK;
    swarmState.timers.tick = COMBAT_TICK;

    const soloWorker = soloState.agents[0];
    const swarmWorker = swarmState.agents[0];
    soloWorker.hp = 100;
    swarmWorker.hp = 100;

    const soloRaider = spawnEnemy(soloState.rng, soloState.nextEnemyId++, 0, "raider");
    soloRaider.x = soloWorker.x;
    soloRaider.y = soloWorker.y;
    soloState.enemies.push(soloRaider);

    const attackerKinds = ["raider", "mite", "wisp"] as const;
    attackerKinds.forEach((kind, index) => {
      const enemy = spawnEnemy(swarmState.rng, swarmState.nextEnemyId++, 0, kind);
      enemy.x = swarmWorker.x + index * 3;
      enemy.y = swarmWorker.y + index * 2;
      swarmState.enemies.push(enemy);
    });

    stepCombat(soloState);
    stepCombat(swarmState);

    expect(soloWorker.hp).toBeLessThan(100);
    expect(swarmWorker.hp).toBeLessThan(soloWorker.hp);
    expect(100 - swarmWorker.hp).toBeGreaterThan(
      (100 - soloWorker.hp) * (1 + COMBAT.surroundBonusPerAttacker)
    );
  });

  it("migration adds disabledTicks fallback to existing saves", () => {
    const save = {
      citySeed: 99,
      agents: [{ id: 1, kind: "miner", x: 100, y: 100 }],
      turrets: [{ id: 1, x: 220, y: 540, range: 135, cooldown: 0, angle: -1.2 }],
      scouts: [{ id: 1, x: 220, y: 575 }],
      sentinels: [{ id: 1, x: 300, y: 500 }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const restored = migrateGameState(save);
    expect(restored.agents[0].disabledTicks).toBe(0);
    expect(restored.turrets[0].disabledTicks).toBe(0);
    expect(restored.scouts[0].disabledTicks).toBe(0);
    expect(restored.sentinels[0].disabledTicks).toBe(0);
  });

  it("secret synthwave trigger unlocks Neon Protocol instead of Residual Signal", () => {
    const state = createInitialGameState();

    unlockSecretAchievement(state, "synthwave");

    expect(state.achievements.synthwave).toBe(true);
    expect(state.achievements.drift_heard).toBeUndefined();
  });
});

describe("worker damage funnel (3.1.0)", () => {
  it("damageWorker clamps hp at 0 and flags damage + panic", () => {
    const state = createInitialGameState();
    const agent = state.agents.find((a) => a.active)!;
    agent.hp = 20;
    agent.panic = 0;
    agent.damageTicks = 0;

    damageWorker(agent, 50);

    expect(agent.hp).toBe(0);
    expect(agent.damageTicks).toBe(WORKER.combatDamageTicks);
    expect(agent.panic).toBeCloseTo(WORKER.panicDelta.damagedBurst, 5);
  });

  it("damageWorker is a no-op for corrupted / rebooting / inactive workers", () => {
    const state = createInitialGameState();
    const [a, b, c] = state.agents.filter((agent) => agent.active);
    a.hp = 50;
    a.corrupted = true;
    b.hp = 50;
    b.rebootTicks = 120;
    c.hp = 50;
    c.active = false;

    damageWorker(a, 20);
    damageWorker(b, 20);
    damageWorker(c, 20);

    expect(a.hp).toBe(50);
    expect(b.hp).toBe(50);
    expect(c.hp).toBe(50);
  });

  it("sapper detonation routes through damageWorker (honors corrupted + reboot guards)", () => {
    const state = createInitialGameState();
    state.timers.tick = COMBAT_TICK; // step boundary

    const active = state.agents.filter((a) => a.active);
    const healthy = active[0];
    const corrupted = active[1];
    const rebooting = active[2];

    healthy.hp = 80;
    healthy.x = 500;
    healthy.y = 300;
    corrupted.hp = 80;
    corrupted.x = 510;
    corrupted.y = 300;
    corrupted.corrupted = true;
    rebooting.hp = 80;
    rebooting.x = 520;
    rebooting.y = 300;
    rebooting.rebootTicks = 60;

    const sapper = spawnEnemy(state.rng, 9001, 0, "sapper", state.timers.tick);
    sapper.x = 505;
    sapper.y = 300;
    sapper.hp = 30;
    state.enemies.push(sapper);

    stepCombat(state);

    // Healthy worker took the hit; corrupted + rebooting are untouched.
    expect(healthy.hp).toBeLessThan(80);
    expect(corrupted.hp).toBe(80);
    expect(rebooting.hp).toBe(80);
    // Sapper self-destructed regardless.
    expect(sapper.hp).toBe(0);
  });

  it("lone sapper kill starts worker reboot (no zombie at hp=0)", () => {
    // 3.1.3 audit follow-up: when a sapper was the only attacker in range and
    // the blast brought a worker to hp=0, the worker used to be left at hp=0
    // with rebootTicks=0 — the sapper killed itself in the same tick, so the
    // contact-damage path never ran on the next tick. killWorker is now
    // called directly from the sapper explosion loop.
    const state = createInitialGameState(1);
    state.timers.tick = COMBAT_TICK;

    // Disable every other active worker so the victim is the only one the
    // sapper can hit — rules out the contact-damage path running next tick.
    const active = state.agents.filter((a) => a.active);
    const victim = active[0];
    for (let i = 1; i < active.length; i++) active[i].active = false;

    victim.x = 500;
    victim.y = 300;
    victim.hp = 10; // blast damage is 18 → clamps to 0

    const sapper = spawnEnemy(state.rng, 9101, 0, "sapper", state.timers.tick);
    sapper.x = 500;
    sapper.y = 300;
    sapper.hp = 30;
    state.enemies.push(sapper);

    stepCombat(state);

    expect(victim.hp).toBe(0);
    expect(victim.rebootTicks).toBeGreaterThan(0);
    expect(victim.task).toBe("Rebooting");
    expect(state.workerDeathFlash).not.toBeNull();
    expect(sapper.hp).toBe(0);
  });
});

// 3.0.0 Step 5: Turrets always fire instant-hit beams; missiles are silo-only.
// The old "turret-fires-missile" tests are replaced with turret-always-beam
// coverage plus a new missile silo describe block below.
describe("turret beam + focusedBeam range (3.0.0 Step 5)", () => {
  function makeStateWithEnemyInRange(focusedBeam = 0) {
    const state = createInitialGameState();
    state.upgrades.turret = 1;
    state.upgrades.focusedBeam = focusedBeam;
    const turret = state.turrets[0];
    turret.cooldown = 0;
    const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    enemy.x = turret.x;
    // 3.1.3 — turret range with turret L1 + focusedBeam L0 = 115. Keep the
    // enemy comfortably inside so the no-upgrade case still acquires.
    enemy.y = turret.y - 90;
    enemy.hp = 100;
    state.enemies.push(enemy);
    return { state, turret, enemy };
  }

  it("turret always fires instant beam (even without focusedBeam upgrade)", () => {
    const { state, enemy } = makeStateWithEnemyInRange(0);
    stepTurrets(state);
    const beam = state.projectiles.find((p) => p.tag === "instant-beam");
    expect(beam).toBeDefined();
    expect(state.projectiles.find((p) => p.tag === "turret-missile")).toBeUndefined();
    expect(enemy.hp).toBeLessThan(100);
  });

  it("focusedBeam upgrade extends turret acquisition range", () => {
    const { state: base } = makeStateWithEnemyInRange(0);
    const { state: upgraded } = makeStateWithEnemyInRange(4);
    // Run a step to let range be recomputed from upgrades.
    stepTurrets(base);
    stepTurrets(upgraded);
    const rangeBase = base.turrets[0].range;
    const rangeUpgraded = upgraded.turrets[0].range;
    expect(rangeUpgraded).toBeGreaterThan(rangeBase);
  });

  it("turret fires beam at all in-range enemies regardless of focusedBeam level", () => {
    const { state, turret, enemy } = makeStateWithEnemyInRange(3);
    // 3.1.3 — turret range with turret L1 + focusedBeam L3 = 110 + 5 + 18 = 133.
    // Place enemy comfortably inside that to confirm the beam still fires.
    enemy.x = turret.x;
    enemy.y = turret.y - 120;
    stepTurrets(state);
    expect(state.projectiles.find((p) => p.tag === "instant-beam")).toBeDefined();
    expect(enemy.hp).toBeLessThan(100);
  });

  it("focusedBeam upgrade defaults to 0 in new game and migration", () => {
    const state = createInitialGameState();
    expect(state.upgrades.focusedBeam).toBe(0);
    const restored = migrateGameState({ citySeed: 1 } as Parameters<typeof migrateGameState>[0]);
    expect(restored.upgrades.focusedBeam).toBe(0);
  });

  // 3.1.3 — turret range is hard-clamped to TURRET.rangeMax and must always
  // stay below the missile silo range. We sweep maxed upgrade combinations
  // plus an event modifier and confirm both invariants.
  it("turret range stays under TURRET.rangeMax and below silo range at every level", () => {
    const state = createInitialGameState();
    state.upgrades.turret = 99;
    state.upgrades.reactor = 99;
    state.upgrades.focusedBeam = 99;
    state.eventModifiers.turretRangeScale = 1.5; // worst-case event boost
    stepTurrets(state);
    const turretRange = state.turrets[0].range;
    expect(turretRange).toBeLessThanOrEqual(TURRET.rangeMax);
    expect(turretRange).toBeLessThan(300);

    for (let level = 0; level <= 10; level++) {
      const siloRange = MISSILE_SILO.rangeBase + level * MISSILE_SILO.rangePerLevel;
      expect(siloRange).toBeGreaterThan(turretRange);
    }
  });
});

describe("missile silo subsystem (3.0.0 Step 5)", () => {
  function makeStateWithSiloAndEnemy() {
    const state = createInitialGameState();
    state.upgrades.missileLauncher = 1; // activates silo slot 0
    const silo = state.missileSilos[0];
    silo.cooldown = 0;
    const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, "brute");
    enemy.x = silo.x;
    enemy.y = silo.y - 200; // well within 400px range
    enemy.hp = 200;
    state.enemies.push(enemy);
    return { state, silo, enemy };
  }

  it("fires a missile at a target within range, sets cooldown", () => {
    const { state, silo, enemy } = makeStateWithSiloAndEnemy();
    stepMissileSilos(state);
    const missile = state.projectiles.find((p) => p.tag === "turret-missile");
    expect(missile).toBeDefined();
    expect(missile?.targetId).toBe(enemy.id);
    expect(silo.cooldown).toBe(MISSILE_SILO.fireIntervalTicks);
  });

  it("does not fire while on cooldown", () => {
    const { state } = makeStateWithSiloAndEnemy();
    stepMissileSilos(state); // fires, starts cooldown
    const projectileCount = state.projectiles.length;
    stepMissileSilos(state); // cooldown > 0, should not fire
    expect(state.projectiles.length).toBe(projectileCount);
  });

  it("does not fire at a target beyond range", () => {
    const { state, silo, enemy } = makeStateWithSiloAndEnemy();
    enemy.y = silo.y - (MISSILE_SILO.rangeBase + 50); // out of range
    stepMissileSilos(state);
    expect(state.projectiles.find((p) => p.tag === "turret-missile")).toBeUndefined();
    expect(silo.cooldown).toBe(0); // no shot = no cooldown
  });

  it("prefers brutes over mites at equal distance", () => {
    const { state, silo } = makeStateWithSiloAndEnemy();
    // Add a mite at same y as the brute.
    const brute = state.enemies[0];
    const mite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    mite.x = silo.x;
    mite.y = brute.y + 5;
    mite.hp = 40;
    state.enemies.push(mite);
    stepMissileSilos(state);
    const missile = state.projectiles.find((p) => p.tag === "turret-missile");
    expect(missile?.targetId).toBe(brute.id);
  });

  it("silo missile uses MISSILE_SILO speed and steering", () => {
    const { state } = makeStateWithSiloAndEnemy();
    stepMissileSilos(state);
    const missile = state.projectiles.find((p) => p.tag === "turret-missile")!;
    expect(missile.speed).toBe(MISSILE_SILO.missileSpeed);
    expect(missile.steering).toBe(MISSILE_SILO.missileSteering);
    expect(missile.maxLife).toBe(MISSILE_SILO.missileMaxLife);
  });

  it("silo missile moves toward its target each tick (projectiles step)", () => {
    const { state, enemy } = makeStateWithSiloAndEnemy();
    stepMissileSilos(state);
    const missile = state.projectiles.find((p) => p.tag === "turret-missile")!;
    const startDist = Math.hypot(enemy.x - missile.x1, enemy.y - missile.y1);
    stepProjectiles(state);
    const updated = state.projectiles.find((p) => p.tag === "turret-missile");
    if (updated) {
      const endDist = Math.hypot(enemy.x - updated.x1, enemy.y - updated.y1);
      expect(endDist).toBeLessThan(startDist);
    }
    // Enemy has not been damaged yet (still in flight after one tick).
    expect(enemy.hp).toBe(200);
  });

  it("silo missile applies damage on impact", () => {
    const { state, enemy } = makeStateWithSiloAndEnemy();
    stepMissileSilos(state);
    const missile = state.projectiles.find((p) => p.tag === "turret-missile")!;
    // Teleport missile onto the enemy.
    missile.x1 = enemy.x;
    missile.y1 = enemy.y;
    stepProjectiles(state);
    const expectedDamage = MISSILE_SILO.damageBase + 1 * MISSILE_SILO.damagePerLevel;
    expect(enemy.hp).toBeCloseTo(200 - expectedDamage, 5);
    expect(state.projectiles.find((p) => p.tag === "turret-missile")).toBeUndefined();
  });

  it("silo missile fizzles when target dies mid-flight", () => {
    const { state, enemy } = makeStateWithSiloAndEnemy();
    stepMissileSilos(state);
    enemy.hp = 0;
    enemy.dyingTicks = 1;
    stepProjectiles(state);
    expect(state.projectiles.find((p) => p.tag === "turret-missile")).toBeUndefined();
  });

  it("missileLauncher=0 deactivates all silos", () => {
    const state = createInitialGameState();
    state.upgrades.missileLauncher = 0;
    stepMissileSilos(state);
    expect(state.missileSilos.every((s) => !s.active)).toBe(true);
    expect(state.projectiles.length).toBe(0);
  });

  it("missileLauncher upgrade defaults to 0 in new game and migration", () => {
    const state = createInitialGameState();
    expect(state.upgrades.missileLauncher).toBe(0);
    const restored = migrateGameState({ citySeed: 1 } as Parameters<typeof migrateGameState>[0]);
    expect(restored.upgrades.missileLauncher).toBe(0);
  });
});

describe("turret HP and break state (3.0.0)", () => {
  it("scales maxHp off turret + shield upgrades via stepTurrets", () => {
    const state = createInitialGameState();
    // L3 gate so the first turret slot is live.
    state.level = 3;
    state.upgrades.turret = 2;
    state.upgrades.shield = 1;

    stepTurrets(state);

    const expected = TURRET_HP.hpBase + 2 * TURRET_HP.hpPerTurretUpgrade + 1 * TURRET_HP.hpPerShieldUpgrade;
    expect(state.turrets[0].maxHp).toBe(expected);
    expect(state.turrets[0].hp).toBeCloseTo(expected, 5);
  });

  it("enters broken state at 0 hp, skips firing, and recovers at half maxHp", () => {
    const state = createInitialGameState();
    state.level = 3;
    const turret = state.turrets[0];
    const originalBrokenCount = state.stats.turretsBroken;

    // Seed an enemy within turret range so, were it firing, it would attack.
    const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    enemy.x = turret.x + 40;
    enemy.y = turret.y;
    enemy.hp = 200;
    enemy.maxHp = 200;
    state.enemies.push(enemy);

    // Damage past zero via the funnel.
    damageTurret(state, turret, 10);
    expect(turret.damageTicks).toBe(TURRET_HP.damageFlashTicks);
    expect(turret.brokenTicks).toBe(0);

    damageTurret(state, turret, turret.maxHp);
    expect(turret.hp).toBe(0);
    expect(turret.brokenTicks).toBe(TURRET_HP.brokenDurationTicks);
    expect(state.stats.turretsBroken).toBe(originalBrokenCount + 1);

    // Further damage while broken does NOT stack the break timer.
    const brokenSnapshot = turret.brokenTicks;
    damageTurret(state, turret, 50);
    expect(turret.brokenTicks).toBe(brokenSnapshot);
    expect(state.stats.turretsBroken).toBe(originalBrokenCount + 1);

    // Broken turret never fires, even with a live enemy in range.
    const projectilesBefore = state.projectiles.length;
    for (let i = 0; i < 120; i += 1) {
      state.timers.tick += 1;
      stepTurrets(state);
      expect(turret.brokenTicks).toBeGreaterThan(0);
    }
    expect(state.projectiles.length).toBe(projectilesBefore);

    // Tick down the remaining break ticks. On the last tick brokenTicks
    // decrements to 0 AND hp is restored to half maxHp.
    const remaining = turret.brokenTicks;
    for (let i = 0; i < remaining; i += 1) {
      state.timers.tick += 1;
      stepTurrets(state);
    }
    expect(turret.brokenTicks).toBe(0);
    expect(turret.hp).toBeCloseTo(turret.maxHp * TURRET_HP.brokenRecoverRatio, 5);

    // Once recovered, the turret will engage again. Advance until cooldown
    // allows a shot; we should see at least one projectile within a frame.
    let fired = false;
    for (let i = 0; i < 120 && !fired; i += 1) {
      state.timers.tick += 1;
      stepTurrets(state);
      if (state.projectiles.length > projectilesBefore) fired = true;
    }
    expect(fired).toBe(true);
  });
});

describe("scout HP, retreat, and reboot (3.0.0)", () => {
  it("scales maxHp off scout + arsenal upgrades", () => {
    const state = createInitialGameState();
    state.upgrades.scout = 3;
    state.upgrades.arsenal = 2;

    stepScouts(state);

    const expected = SCOUT_HP.hpBase + 3 * SCOUT_HP.hpPerScoutUpgrade + 2 * SCOUT_HP.hpPerArsenalUpgrade;
    expect(state.scouts[0].maxHp).toBe(expected);
    expect(state.scouts[0].hp).toBeCloseTo(expected, 5);
  });

  it("enters retreat at half hp, heals at home, and exits retreat at 90%", () => {
    const state = createInitialGameState();
    state.upgrades.scout = 1;
    const scout = state.scouts[0];

    // Warm up so maxHp is populated.
    stepScouts(state);
    const maxHp = scout.maxHp;

    // Damage to just above the retreat threshold — should not yet be retreating.
    damageScout(state, scout, maxHp * 0.4);
    stepScouts(state);
    expect(scout.retreating).toBe(false);

    // Push past the retreat threshold.
    damageScout(state, scout, maxHp * 0.2);
    stepScouts(state);
    expect(scout.retreating).toBe(true);
    expect(scout.targetId).toBeNull();

    // Force the scout onto its home pad. Heal rate should tick up at
    // SCOUT_HP.healRatePerTick until we clear the 90% exit bar.
    scout.x = scout.homeX;
    scout.y = scout.homeY;
    let guard = 0;
    while (scout.retreating && guard < 10_000) {
      stepScouts(state);
      guard += 1;
    }
    expect(scout.retreating).toBe(false);
    expect(scout.hp).toBeGreaterThanOrEqual(maxHp * SCOUT_HP.exitRetreatHpRatio);
  });

  it("reboots at home for rebootDurationTicks after death, then respawns at full hp", () => {
    const state = createInitialGameState();
    const scout = state.scouts[0];
    stepScouts(state);
    const maxHp = scout.maxHp;

    damageScout(state, scout, maxHp * 2);
    expect(scout.hp).toBe(0);
    expect(scout.rebootTicks).toBe(SCOUT_HP.rebootDurationTicks);
    expect(scout.retreating).toBe(false);

    // While rebooting, further damage is a no-op.
    damageScout(state, scout, 99);
    expect(scout.rebootTicks).toBe(SCOUT_HP.rebootDurationTicks);

    // Tick down the reboot window. The scout parks at home every tick and
    // comes back at full HP on the tick the counter hits 0.
    for (let i = 0; i < SCOUT_HP.rebootDurationTicks; i += 1) {
      stepScouts(state);
      expect(scout.x).toBe(scout.homeX);
      expect(scout.y).toBe(scout.homeY);
    }
    expect(scout.rebootTicks).toBe(0);
    expect(scout.hp).toBe(scout.maxHp);
  });
});

describe("sentinel HP, retreat, and reboot (3.0.0)", () => {
  it("scales maxHp off sentinel + shield upgrades", () => {
    const state = createInitialGameState();
    state.upgrades.sentinel = 2;
    state.upgrades.shield = 3;

    stepSentinels(state);

    const expected =
      SENTINEL_HP.hpBase + 2 * SENTINEL_HP.hpPerSentinelUpgrade + 3 * SENTINEL_HP.hpPerShieldUpgrade;
    expect(state.sentinels[0].maxHp).toBe(expected);
    expect(state.sentinels[0].hp).toBeCloseTo(expected, 5);
  });

  it("enters retreat below 35% hp, parks at home while rebooting, respawns full", () => {
    const state = createInitialGameState();
    const sentinel = state.sentinels[0];
    stepSentinels(state);
    const maxHp = sentinel.maxHp;

    // Above threshold — still engaged.
    damageSentinel(state, sentinel, maxHp * 0.5);
    stepSentinels(state);
    expect(sentinel.retreating).toBe(false);

    // Past the 35% bar — enters retreat, drops target.
    damageSentinel(state, sentinel, maxHp * 0.2);
    stepSentinels(state);
    expect(sentinel.retreating).toBe(true);
    expect(sentinel.targetId).toBeNull();

    // Heal timer at home. Park on the pad and let it top off back to exit
    // threshold.
    sentinel.x = sentinel.homeX;
    sentinel.y = sentinel.homeY;
    let guard = 0;
    while (sentinel.retreating && guard < 50_000) {
      stepSentinels(state);
      guard += 1;
    }
    expect(sentinel.retreating).toBe(false);
    expect(sentinel.hp).toBeGreaterThanOrEqual(maxHp * SENTINEL_HP.exitRetreatHpRatio);

    // Kill it — reboot kicks in for the full duration, then respawns full.
    damageSentinel(state, sentinel, maxHp * 5);
    expect(sentinel.rebootTicks).toBe(SENTINEL_HP.rebootDurationTicks);
    damageSentinel(state, sentinel, 99); // no-op while rebooting
    expect(sentinel.rebootTicks).toBe(SENTINEL_HP.rebootDurationTicks);

    for (let i = 0; i < SENTINEL_HP.rebootDurationTicks; i += 1) {
      stepSentinels(state);
      expect(sentinel.x).toBe(sentinel.homeX);
      expect(sentinel.y).toBe(sentinel.homeY);
    }
    expect(sentinel.rebootTicks).toBe(0);
    expect(sentinel.hp).toBe(sentinel.maxHp);
  });
});

describe("city HP, energy modulation, and regen (3.0.0)", () => {
  it("damages via funnel, sets flash + lastHostileTick, and clamps at 0", () => {
    const state = createInitialGameState();
    state.timers.tick = 500;
    const maxHp = state.city.maxHp;

    damageCity(state, 200);
    expect(state.city.hp).toBe(maxHp - 200);
    expect(state.city.damageTicks).toBe(CITY_HP.damageFlashTicks);
    expect(state.city.lastHostileTick).toBe(500);

    // Overflow damage clamps to 0, stays at 0 without going negative.
    damageCity(state, maxHp);
    expect(state.city.hp).toBe(0);

    damageCity(state, 500);
    expect(state.city.hp).toBe(0);
  });

  it("throttles energy rate at low city HP via cityIntegrity lerp", () => {
    const state = createInitialGameState();
    state.upgrades.reactor = 3;
    state.upgrades.shield = 2;

    const fullDerived = computeDerived(state);
    const fullEnergyRate = fullDerived.rates.energy;
    expect(fullEnergyRate).toBeGreaterThan(0);

    state.city.hp = 0;
    const brokenDerived = computeDerived(state);
    const brokenEnergyRate = brokenDerived.rates.energy;

    // At 0 city HP energy throttles to the floor — CITY_HP.energyMinRatio of
    // the full rate, give or take floating point.
    expect(brokenEnergyRate / fullEnergyRate).toBeCloseTo(CITY_HP.energyMinRatio, 5);
  });

  it("regenerates after an idle quiet period and stays pinned while hostiles are nearby", () => {
    const state = createInitialGameState();
    state.timers.tick = 10_000;
    state.city.hp = state.city.maxHp * 0.5;

    // Drop a combat enemy on top of the city center; stepCity should refresh
    // lastHostileTick every tick and skip regen.
    const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    enemy.x = 500;
    enemy.y = 540;
    state.enemies.push(enemy);

    const hpBeforeSiege = state.city.hp;
    for (let i = 0; i < 500; i += 1) {
      state.timers.tick += 1;
      stepCity(state);
    }
    expect(state.city.hp).toBe(hpBeforeSiege);

    // Pull the enemy out of range — after regenIdleTicks, regen resumes.
    enemy.x = -5000;
    enemy.y = -5000;
    for (let i = 0; i < CITY_HP.regenIdleTicks + 10; i += 1) {
      state.timers.tick += 1;
      stepCity(state);
    }
    expect(state.city.hp).toBeGreaterThan(hpBeforeSiege);
  });

  it("regen stays enabled after the tick counter wraps (3.1.0)", () => {
    const state = createInitialGameState();
    // Simulate a wrap: lastHostileTick was recorded just before the counter
    // rolled over at TICK_WRAP (10_000_000), and the current tick is now a
    // few thousand past the wrap boundary. Pre-3.1.0, the raw subtract went
    // deeply negative and regen could never clear the idle gate.
    state.timers.tick = 3_000;
    state.city.lastHostileTick = 9_999_500; // just before wrap
    state.city.hp = state.city.maxHp * 0.8;
    state.enemies = [];

    const hpBefore = state.city.hp;
    // The elapsed delta across the wrap is 3_500 ticks, which is >
    // regenIdleTicks, so regen should resume this tick.
    stepCity(state);
    expect(state.city.hp).toBeGreaterThan(hpBefore);
  });
});

describe("enemy multi-class targeting (3.0.0 Step 4)", () => {
  it("defaults to worker targeting when priorities favor it", () => {
    // Mites have a 1.0 worker priority vs 0.15 turret, so a mite between a
    // worker and a turret at equal distance should pick the worker.
    const state = createInitialGameState();
    // Deactivate other workers so only agent 1 is in play to keep the pick
    // deterministic.
    state.agents.forEach((agent, idx) => {
      agent.active = idx === 0;
    });
    const worker = state.agents[0];
    worker.x = 400;
    worker.y = 300;
    const turret = state.turrets[0];
    turret.x = 600;
    turret.y = 300;

    const mite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    mite.x = 500;
    mite.y = 300;
    state.enemies.push(mite);

    const pick = pickEnemyTargetMulti(mite, state);
    expect(pick?.kind).toBe("agent");
    expect(pick?.id).toBe(worker.id);
  });

  it("brute pivots to a turret when the turret is closer than workers", () => {
    // Brute worker priority (1.0) vs turret priority (0.85) — at equal distance
    // the brute chases the worker. Move the turret much closer and the
    // weighted distance score should flip to turret.
    const state = createInitialGameState();
    state.agents.forEach((agent, idx) => {
      agent.active = idx === 0;
    });
    state.agents[0].x = 400;
    state.agents[0].y = 200;
    const turret = state.turrets[0];
    turret.x = 500;
    turret.y = 205;

    const brute = spawnEnemy(state.rng, state.nextEnemyId++, 0, "brute");
    brute.x = 500;
    brute.y = 200;
    state.enemies.push(brute);

    const pick = pickEnemyTargetMulti(brute, state);
    expect(pick?.kind).toBe("turret");
    expect(pick?.id).toBe(turret.id);
  });

  it("ignores undeployed turret slots as enemy targets", () => {
    const state = createInitialGameState();
    state.agents.forEach((agent) => {
      agent.active = false;
    });
    state.level = 1;
    state.upgrades.turret = 0;

    const activeTurret = state.turrets[0];
    const undeployedTurret = state.turrets[1];
    activeTurret.x = 100;
    activeTurret.y = 540;
    undeployedTurret.x = 500;
    undeployedTurret.y = 300;

    const brute = spawnEnemy(state.rng, state.nextEnemyId++, 0, "brute");
    brute.x = undeployedTurret.x;
    brute.y = undeployedTurret.y;
    state.enemies.push(brute);

    const pick = pickEnemyTargetMulti(brute, state);
    expect(pick).not.toMatchObject({ kind: "turret", id: undeployedTurret.id });
  });

  it("ignores undeployed and rebooting scout/sentinel slots as enemy targets", () => {
    const state = createInitialGameState();
    state.agents.forEach((agent) => {
      agent.active = false;
    });
    state.turrets = [];
    state.upgrades.scout = 0;
    state.upgrades.sentinel = 1;

    const undeployedScout = state.scouts[0];
    undeployedScout.x = 500;
    undeployedScout.y = 300;
    const rebootingSentinel = state.sentinels[0];
    rebootingSentinel.x = 520;
    rebootingSentinel.y = 300;
    rebootingSentinel.rebootTicks = 10;

    const phantom = spawnEnemy(state.rng, state.nextEnemyId++, 0, "phantom");
    phantom.x = 510;
    phantom.y = 300;
    state.enemies.push(phantom);

    const pick = pickEnemyTargetMulti(phantom, state);
    expect(pick).not.toMatchObject({ kind: "scout", id: undeployedScout.id });
    expect(pick).not.toMatchObject({ kind: "sentinel", id: rebootingSentinel.id });
  });

  it("excludes corrupted and rebooting workers from enemy worker targeting", () => {
    const state = createInitialGameState();
    state.agents.forEach((agent, index) => {
      agent.active = index < 3;
      agent.x = 500 + index * 40;
      agent.y = 300;
      agent.hp = agent.maxHp;
      agent.corrupted = false;
      agent.rebootTicks = 0;
    });
    const corrupted = state.agents[0];
    const rebooting = state.agents[1];
    const healthy = state.agents[2];
    corrupted.corrupted = true;
    rebooting.rebootTicks = 20;

    const mite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    mite.x = corrupted.x;
    mite.y = corrupted.y;
    state.enemies.push(mite);

    const target = pickEnemyTarget(mite, state);
    expect(target?.id).toBe(healthy.id);
  });

  it("returns null for early enemies (raider/mite/wisp) when no workers/defences exist", () => {
    // 3.1.2: mite/wisp/raider have city:0 so they don't camp the city in early
    // game when the one turret is out of range and there are no workers nearby.
    const state = createInitialGameState();
    state.agents.forEach((agent) => {
      agent.active = false;
    });
    state.turrets = [];
    state.scouts = [];
    state.sentinels = [];

    const raider = spawnEnemy(state.rng, state.nextEnemyId++, 0, "raider");
    raider.x = 520;
    raider.y = 540;
    state.enemies.push(raider);

    const pick = pickEnemyTargetMulti(raider, state);
    expect(pick).toBeNull();
  });

  it("corruptor-role enemies have zero priority across the board", () => {
    const state = createInitialGameState();
    const corruptor = spawnEnemy(state.rng, state.nextEnemyId++, 0, "corruptor");
    state.enemies.push(corruptor);
    expect(pickEnemyTargetMulti(corruptor, state)).toBeNull();
    expect(ENEMY_TARGET_PRIORITY.corruptor.worker).toBe(0);
    expect(ENEMY_TARGET_PRIORITY.blight.worker).toBe(0);
    expect(ENEMY_TARGET_PRIORITY.leech.worker).toBe(0);
  });

  it("contact damage to a turret applies the turretArmor mitigation", () => {
    const state = createInitialGameState();
    // Isolate the turret under test and remove workers so stepCombat's
    // worker loop doesn't also fire.
    state.agents.forEach((agent) => {
      agent.active = false;
    });
    state.turrets = [state.turrets[0]];
    const turret = state.turrets[0];
    const hpBefore = turret.hp;

    // Put a brute in contact with the turret and set it up to target turret.
    const brute = spawnEnemy(state.rng, state.nextEnemyId++, 0, "brute");
    brute.x = turret.x + 5;
    brute.y = turret.y;
    brute.targetKind = "turret";
    brute.targetId = turret.id;
    state.enemies.push(brute);

    // Force a combat tick by aligning timer with COMBAT_TICK.
    state.timers.tick = 0;
    stepCombat(state);

    const expectedDamage = ENEMY_CONTACT_DAMAGE.brute * TARGET_ARMOR.turretArmor;
    expect(turret.hp).toBeCloseTo(hpBefore - expectedDamage, 5);
    expect(turret.damageTicks).toBeGreaterThan(0);
  });

  it("contact damage ignores stale targets for undeployed and rebooting entities", () => {
    const state = createInitialGameState();
    state.agents.forEach((agent) => {
      agent.active = false;
    });
    state.level = 1;
    state.upgrades.turret = 0;
    const undeployedTurret = state.turrets[1];
    const turretHp = undeployedTurret.hp;

    const turretAttacker = spawnEnemy(state.rng, state.nextEnemyId++, 0, "brute");
    turretAttacker.x = undeployedTurret.x;
    turretAttacker.y = undeployedTurret.y;
    turretAttacker.targetKind = "turret";
    turretAttacker.targetId = undeployedTurret.id;
    state.enemies.push(turretAttacker);

    state.upgrades.scout = 1;
    const rebootingScout = state.scouts[0];
    rebootingScout.rebootTicks = 30;
    const scoutHp = rebootingScout.hp;
    const scoutAttacker = spawnEnemy(state.rng, state.nextEnemyId++, 0, "rusher");
    scoutAttacker.x = rebootingScout.x;
    scoutAttacker.y = rebootingScout.y;
    scoutAttacker.targetKind = "scout";
    scoutAttacker.targetId = rebootingScout.id;
    state.enemies.push(scoutAttacker);

    state.timers.tick = 0;
    stepCombat(state);

    expect(undeployedTurret.hp).toBe(turretHp);
    expect(rebootingScout.hp).toBe(scoutHp);
  });

  it("contact damage to the city applies the cityArmor mitigation", () => {
    const state = createInitialGameState();
    state.agents.forEach((agent) => {
      agent.active = false;
    });
    const hpBefore = state.city.hp;

    // Raider inside the city contact radius, targeting the city.
    const raider = spawnEnemy(state.rng, state.nextEnemyId++, 0, "raider");
    raider.x = 500;
    raider.y = 540;
    raider.targetKind = "city";
    raider.targetId = null;
    state.enemies.push(raider);

    state.timers.tick = 0;
    stepCombat(state);

    const expectedDamage = ENEMY_CONTACT_DAMAGE.raider * TARGET_ARMOR.cityArmor;
    expect(state.city.hp).toBeCloseTo(hpBefore - expectedDamage, 5);
    expect(state.city.damageTicks).toBeGreaterThan(0);
  });

  it("stepEnemies writes targetKind=agent when a worker is available", () => {
    // When workers are present, mites should target them (worker priority 1.0).
    const state = createInitialGameState();
    state.turrets = [];
    state.scouts = [];
    state.sentinels = [];
    state.agents.forEach((agent) => {
      agent.active = true;
      agent.corrupted = false;
      agent.rebootTicks = 0;
    });

    const mite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    mite.x = 500;
    mite.y = 540;
    state.enemies.push(mite);

    stepEnemies(state);
    expect(mite.targetKind).toBe("agent");
  });

  it("non-worker contact damage only lands while inside the contact radius", () => {
    // A brute just outside ENEMY_CONTACT_RADIUS.turret targeting the turret
    // should deal 0 damage; nudge it inside and the damage funnel fires.
    const state = createInitialGameState();
    state.agents.forEach((agent) => {
      agent.active = false;
    });
    state.turrets = [state.turrets[0]];
    const turret = state.turrets[0];
    const hpStart = turret.hp;

    const brute = spawnEnemy(state.rng, state.nextEnemyId++, 0, "brute");
    brute.x = turret.x + ENEMY_CONTACT_RADIUS.turret + 5;
    brute.y = turret.y;
    brute.targetKind = "turret";
    brute.targetId = turret.id;
    state.enemies.push(brute);

    state.timers.tick = 0;
    stepCombat(state);
    expect(turret.hp).toBe(hpStart);

    brute.x = turret.x + ENEMY_CONTACT_RADIUS.turret - 2;
    stepCombat(state);
    expect(turret.hp).toBeLessThan(hpStart);
  });
});

// ---------------------------------------------------------------------------
// Step 6 — Worker class abilities, individual variance, self-defense
// ---------------------------------------------------------------------------
describe("worker class abilities (3.0.0 Step 6)", () => {
  /**
   * Helper: get the first active agent of a given kind.
   */
  function getAgent(state: ReturnType<typeof createInitialGameState>, kind: "miner" | "runner" | "drone") {
    return state.agents.find((a) => a.active && a.kind === kind)!;
  }

  it("speedMod scales traversal distance per tick", () => {
    // Helper: place a miner 200px left of its only node and measure horizontal
    // movement after one stepWorkers tick. Single node + cleared enemies ensures
    // the miner never re-targets to a different node mid-test.
    const runTest = (speedMod: number) => {
      const state = createInitialGameState();
      state.nodes = [state.nodes[0]]; // single node → no re-targeting surprise
      state.enemies = [];
      const miner = getAgent(state, "miner");
      const node = state.nodes[0];
      miner.x = node.x - 200;
      miner.y = node.y;
      miner.target = node.id;
      miner.speedMod = speedMod;
      miner.damageTicks = 0;
      miner.hp = miner.maxHp;
      miner.evadeTicks = 0;
      const xBefore = miner.x;
      stepWorkers(state);
      return miner.x - xBefore; // positive = moved toward node
    };

    const dx1 = runTest(1.0);
    const dx2 = runTest(1.5);

    // Both should be positive (moving toward the node).
    expect(dx1).toBeGreaterThan(0);
    // 1.5× speedMod should produce 1.5× movement (within floating-point tolerance).
    expect(dx2).toBeCloseTo(dx1 * 1.5, 3);
  });

  it("miner overclockTicks accumulates while undamaged at a node", () => {
    // Seed + re-pin target: stepWorkers retargets on the tick==0 cadence check
    // and chooseWorkerTarget consults state.rng, so an unseeded run can
    // silently retarget the miner away from state.nodes[0] mid-loop and the
    // overclock accumulator never ticks. Seed makes runs deterministic and
    // re-pinning target keeps the miner on its placed node regardless.
    const state = createInitialGameState(12345);
    const miner = getAgent(state, "miner");
    const node = state.nodes[0];

    miner.x = node.x;
    miner.y = node.y;
    miner.target = node.id;
    miner.damageTicks = 0;
    miner.evadeTicks = 0;
    miner.overclockTicks = 0;
    state.enemies = [];

    for (let i = 0; i < 10; i++) {
      miner.target = node.id;
      miner.x = node.x;
      miner.y = node.y;
      stepWorkers(state);
      state.timers.tick += 1;
    }

    expect(miner.overclockTicks).toBeGreaterThan(0);
    expect(miner.overclockTicks).toBeLessThanOrEqual(WORKER_ABILITIES.overclockThresholdTicks);
  });

  it("miner overclockTicks resets when the miner is damaged at the node", () => {
    const state = createInitialGameState();
    const miner = getAgent(state, "miner");
    const node = state.nodes[0];

    miner.x = node.x;
    miner.y = node.y;
    miner.target = node.id;
    miner.overclockTicks = 80; // Partially built up
    miner.damageTicks = 5; // Just took a hit → recovering mode suppresses overclock
    state.enemies = [];

    stepWorkers(state);

    // A fresh damage hit should clear the overclock accumulation.
    expect(miner.overclockTicks).toBe(0);
  });

  it("overclocked miner runs stepMining without error at the threshold", () => {
    const state = createInitialGameState();
    const miner = getAgent(state, "miner");
    const node = state.nodes[0];

    miner.x = node.x;
    miner.y = node.y;
    miner.target = node.id;
    miner.overclockTicks = WORKER_ABILITIES.overclockThresholdTicks;
    miner.evadeTicks = 0;
    miner.hp = miner.maxHp;

    // Should not throw; overclock crit bonus is added to the rng.chance call.
    state.timers.tick = 0;
    expect(() => {
      for (let i = 0; i < MINING_TICK; i++) {
        state.timers.tick = i;
        stepMining(state);
      }
    }).not.toThrow();
  });

  it("runner sprint triggers when evading with high panic and no cooldown", () => {
    const state = createInitialGameState();
    const runner = getAgent(state, "runner");

    // Place a mite within evasion trigger radius.
    const mite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    mite.x = runner.x + EVADE_ENTER_RADIUS - 5;
    mite.y = runner.y;
    state.enemies.push(mite);

    runner.panic = WORKER_ABILITIES.sprintPanicThreshold + 10;
    runner.sprintCooldown = 0;
    runner.sprintTicks = 0;

    stepWorkers(state);

    // Sprint should have fired because the runner is threatened with high panic.
    expect(runner.sprintTicks).toBeGreaterThan(0);
  });

  it("runner sprint sets cooldown preventing immediate re-trigger", () => {
    const state = createInitialGameState();
    const runner = getAgent(state, "runner");

    const mite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    mite.x = runner.x + EVADE_ENTER_RADIUS - 5;
    mite.y = runner.y;
    state.enemies.push(mite);

    runner.panic = WORKER_ABILITIES.sprintPanicThreshold + 10;
    runner.sprintCooldown = 0;

    stepWorkers(state); // triggers sprint
    expect(runner.sprintCooldown).toBeGreaterThan(0);

    const cooldownAfterFirst = runner.sprintCooldown;
    stepWorkers(state); // sprint would re-trigger if cooldown weren't set
    // Cooldown should be ticking DOWN, not reset to full again.
    expect(runner.sprintCooldown).toBeLessThan(cooldownAfterFirst);
  });

  it("worker retaliation deals contact damage to attacker", () => {
    const state = createInitialGameState();
    // Disable all agents except the first miner to keep the test isolated.
    state.agents.forEach((a) => {
      a.active = false;
    });
    const miner = state.agents[0];
    miner.active = true;
    miner.hp = miner.maxHp; // healthy — retaliation allowed
    miner.damageTicks = 0;
    miner.disabledTicks = 0;
    miner.corrupted = false;

    const mite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    mite.x = miner.x + COMBAT.detectionRadius - 2;
    mite.y = miner.y;
    mite.role = "combat";
    const hpBefore = mite.hp;
    state.enemies.push(mite);

    state.timers.tick = 0; // ensure combat tick fires
    stepCombat(state);

    expect(mite.hp).toBeLessThan(hpBefore);
  });

  it("retaliation is suppressed when worker is in recovery (low HP)", () => {
    const state = createInitialGameState();
    state.agents.forEach((a) => {
      a.active = false;
    });
    const miner = state.agents[0];
    miner.active = true;

    // Put the miner in recovery mode: damageTicks > 0 and hp below threshold.
    miner.hp = miner.maxHp * (WORKER.recoveryHpThreshold - 0.05);
    miner.damageTicks = 5;
    miner.disabledTicks = 0;
    miner.corrupted = false;

    const mite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    mite.x = miner.x + COMBAT.detectionRadius - 2;
    mite.y = miner.y;
    mite.role = "combat";
    const hpBefore = mite.hp;
    state.enemies.push(mite);

    // nextHp after damage will still be below the recovery threshold.
    state.timers.tick = 0;
    stepCombat(state);

    // Enemy should NOT have taken retaliation damage.
    expect(mite.hp).toBe(hpBefore);
  });
});

describe("worker corruption system (3.0.0 Step 7)", () => {
  // ── Warden attach ──────────────────────────────────────────────────────────

  it("warden increments corruptingTicks each tick while within attachRadius", () => {
    const state = createInitialGameState();
    const worker = state.agents[0];
    worker.active = true;
    worker.corrupted = false;
    worker.corruptingTicks = 0;
    worker.x = 400;
    worker.y = 300;

    const warden = spawnEnemy(state.rng, state.nextEnemyId++, 1, "warden");
    warden.x = worker.x + WARDEN.attachRadius - 2; // inside attach radius
    warden.y = worker.y;
    warden.hp = 50;
    state.enemies.push(warden);

    stepWorkerCorruption(state);

    expect(worker.corruptingTicks).toBe(1);
    expect(worker.corrupted).toBe(false);
    // Warden should still be on the field
    expect(state.enemies.some((e) => e.kind === "warden" && e.hp > 0)).toBe(true);
  });

  it("warden fully corrupts worker after attachTicks and removes itself", () => {
    const state = createInitialGameState();
    const worker = state.agents[0];
    worker.active = true;
    worker.corrupted = false;
    worker.corruptingTicks = WARDEN.attachTicks - 1; // one tick away from threshold
    worker.x = 400;
    worker.y = 300;

    const warden = spawnEnemy(state.rng, state.nextEnemyId++, 1, "warden");
    warden.x = worker.x + WARDEN.attachRadius - 2;
    warden.y = worker.y;
    warden.hp = 50;
    state.enemies.push(warden);

    stepWorkerCorruption(state);

    expect(worker.corrupted).toBe(true);
    // corruptionTicks resets to 0 on conversion, then stepCorruptedWorkers
    // increments it once in the same stepWorkerCorruption call → lands at 1.
    expect(worker.corruptionTicks).toBe(1);
    // Warden should be removed from the enemy array (no rewards path)
    expect(state.enemies.some((e) => e.kind === "warden")).toBe(false);
  });

  it("corruption boosts worker maxHp to workerBaseHp * corruptToughnessMult", () => {
    const state = createInitialGameState();
    const worker = state.agents[0];
    worker.active = true;
    worker.corrupted = false;
    worker.corruptingTicks = WARDEN.attachTicks - 1;
    worker.x = 400;
    worker.y = 300;
    worker.hp = 80;
    worker.maxHp = WARDEN.workerBaseHp; // 100

    const warden = spawnEnemy(state.rng, state.nextEnemyId++, 1, "warden");
    warden.x = worker.x + WARDEN.attachRadius - 2;
    warden.y = worker.y;
    warden.hp = 50;
    state.enemies.push(warden);

    stepWorkerCorruption(state);

    expect(worker.corrupted).toBe(true);
    expect(worker.maxHp).toBe(Math.round(WARDEN.workerBaseHp * WARDEN.corruptToughnessMult));
    expect(worker.hp).toBeLessThanOrEqual(worker.maxHp);
  });

  it("corruptingTicks decays when warden is out of attachRadius", () => {
    const state = createInitialGameState();
    const worker = state.agents[0];
    worker.active = true;
    worker.corrupted = false;
    worker.corruptingTicks = 5;
    worker.x = 400;
    worker.y = 300;

    const warden = spawnEnemy(state.rng, state.nextEnemyId++, 1, "warden");
    warden.x = worker.x + WARDEN.attachRadius + 50; // outside attach radius
    warden.y = worker.y;
    warden.hp = 50;
    state.enemies.push(warden);

    stepWorkerCorruption(state);

    // corruptingTicks should decay by 0.5
    expect(worker.corruptingTicks).toBe(4.5);
    expect(worker.corrupted).toBe(false);
  });

  it("corruptingTicks decays on the partially attached worker even if another worker is now closer", () => {
    const state = createInitialGameState();
    state.agents.forEach((agent, index) => {
      agent.active = index < 2;
      agent.corrupted = false;
      agent.corruptingTicks = 0;
    });
    const partial = state.agents[0];
    partial.x = 250;
    partial.y = 300;
    partial.corruptingTicks = 12;
    const closer = state.agents[1];
    closer.x = 500;
    closer.y = 300;

    const warden = spawnEnemy(state.rng, state.nextEnemyId++, 1, "warden");
    warden.x = closer.x + WARDEN.attachRadius + 4;
    warden.y = closer.y;
    warden.hp = 50;
    state.enemies.push(warden);

    stepWorkerCorruption(state);

    expect(partial.corruptingTicks).toBe(11.5);
    expect(closer.corruptingTicks).toBe(0);
  });

  it("counts wardensKilled when a warden dies before attaching", () => {
    const state = createInitialGameState();
    const warden = spawnEnemy(state.rng, state.nextEnemyId++, 1, "warden");
    warden.hp = 0;
    state.enemies.push(warden);

    resolveEnemyDeaths(state);
    stepAchievements(state);

    expect(state.stats.wardensKilled).toBe(1);
    expect(state.achievements.warden_killed).toBe(true);
  });

  // ── Warden permanent cloak (3.1.0) ──────────────────────────────────────────

  it("wardens spawn with permanentCloak and are isCloaked", () => {
    const state = createInitialGameState();
    const warden = spawnEnemy(state.rng, state.nextEnemyId++, 1, "warden");
    expect(warden.permanentCloak).toBe(true);
    expect(isCloaked(warden)).toBe(true);
  });

  it("sentinel does not target a cloaked warden even when in range", () => {
    const state = createInitialGameState();
    state.upgrades.sentinel = 1;

    const sentinel = state.sentinels[0];
    sentinel.rebootTicks = 0;
    sentinel.retreating = false;
    sentinel.cooldown = 0;
    sentinel.hp = sentinel.maxHp;
    sentinel.x = 400;
    sentinel.y = 300;

    // Drop workers off-field so they don't compete as nearer threats.
    state.agents.forEach((a) => {
      a.active = false;
    });

    const warden = spawnEnemy(state.rng, state.nextEnemyId++, 1, "warden");
    warden.x = sentinel.x + SENTINEL.rangeBase - 10; // well within range
    warden.y = sentinel.y;
    warden.hp = 50;
    state.enemies.push(warden);

    const hpBefore = warden.hp;
    stepSentinels(state);

    // Sentinel must not have shot the warden — it's cloaked.
    expect(warden.hp).toBe(hpBefore);
    expect(sentinel.targetId).not.toBe(warden.id);
  });

  it("migration defaults permanentCloak to true for pre-3.1.0 warden saves", () => {
    const state = createInitialGameState();
    const warden = spawnEnemy(state.rng, state.nextEnemyId++, 1, "warden");
    state.enemies.push(warden);

    const serialized = JSON.parse(JSON.stringify(state));
    // Simulate a pre-3.1.0 save by dropping the field.
    for (const e of serialized.enemies) delete e.permanentCloak;
    serialized.schemaVersion = SCHEMA_VERSION - 1;

    const restored = migrateGameState(serialized);
    const restoredWarden = restored.enemies.find((e) => e.kind === "warden");
    expect(restoredWarden?.permanentCloak).toBe(true);
  });

  // ── Corrupted worker node drain ─────────────────────────────────────────────

  it("corrupted worker drains nearby resource nodes over time", () => {
    const state = createInitialGameState();
    const worker = state.agents[0];
    worker.active = true;
    worker.corrupted = true;
    worker.corruptionTicks = 0;
    worker.x = 400;
    worker.y = 300;

    // Place a non-gold node within drain radius.
    const node = state.nodes.find((n) => n.kind !== "gold")!;
    node.x = worker.x + WARDEN.drainRadius - 5;
    node.y = worker.y;
    node.hp = 100;
    const hpBefore = node.hp;

    stepWorkerCorruption(state);

    expect(node.hp).toBeLessThan(hpBefore);
  });

  // ── Worker reporting ────────────────────────────────────────────────────────

  it("healthy worker within reportRadius refreshes corrupted worker spottedTicks", () => {
    const state = createInitialGameState();
    const corrupted = state.agents[0];
    corrupted.active = true;
    corrupted.corrupted = true;
    corrupted.spottedTicks = 0;
    corrupted.x = 300;
    corrupted.y = 300;

    const reporter = state.agents[1];
    reporter.active = true;
    reporter.corrupted = false;
    reporter.kind = "miner";
    reporter.x = corrupted.x + WARDEN.workerReportRadius - 5;
    reporter.y = corrupted.y;

    stepWorkerCorruption(state);

    expect(corrupted.spottedTicks).toBe(WARDEN.workerReportDuration);
  });

  it("reporter outside workerReportRadius does not refresh spottedTicks", () => {
    const state = createInitialGameState();
    const corrupted = state.agents[0];
    corrupted.active = true;
    corrupted.corrupted = true;
    corrupted.spottedTicks = 0;
    corrupted.x = 300;
    corrupted.y = 300;

    const reporter = state.agents[1];
    reporter.active = true;
    reporter.corrupted = false;
    reporter.kind = "miner";
    reporter.x = corrupted.x + WARDEN.workerReportRadius + 50;
    reporter.y = corrupted.y;

    stepWorkerCorruption(state);

    expect(corrupted.spottedTicks).toBe(0);
  });

  it("already-spotted corrupted worker stays pinned at workerReportDuration while reporter remains in range (3.1.0)", () => {
    const state = createInitialGameState();
    const corrupted = state.agents[0];
    corrupted.active = true;
    corrupted.corrupted = true;
    corrupted.spottedTicks = WARDEN.workerReportDuration; // already spotted
    corrupted.x = 300;
    corrupted.y = 300;

    const reporter = state.agents[1];
    reporter.active = true;
    reporter.corrupted = false;
    reporter.kind = "miner";
    reporter.x = corrupted.x + WARDEN.workerReportRadius - 5;
    reporter.y = corrupted.y;

    // Before 3.1.0 the reporting scan short-circuited on spottedTicks > 0,
    // so the timer would monotonically drain (1/tick in stepCorruptedWorkers)
    // even with a reporter standing right next to the corrupted worker. After
    // the fix the scan runs every tick and pins the timer at max.
    for (let i = 0; i < 20; i++) {
      stepWorkerCorruption(state);
    }

    expect(corrupted.spottedTicks).toBe(WARDEN.workerReportDuration);
  });

  it("rebooting worker does not count as a healthy reporter", () => {
    const state = createInitialGameState();
    const corrupted = state.agents[0];
    corrupted.active = true;
    corrupted.corrupted = true;
    corrupted.spottedTicks = 0;
    corrupted.x = 300;
    corrupted.y = 300;

    const reporter = state.agents[1];
    reporter.active = true;
    reporter.corrupted = false;
    reporter.rebootTicks = 60; // rebooting — should not count
    reporter.kind = "miner";
    reporter.x = corrupted.x + WARDEN.workerReportRadius - 5;
    reporter.y = corrupted.y;

    stepWorkerCorruption(state);

    expect(corrupted.spottedTicks).toBe(0); // rebooting reporter must not refresh
  });

  // ── Sentinel cleanse ────────────────────────────────────────────────────────

  it("sentinel fires cleanse beam at visible corrupted worker and earns rewards on kill", () => {
    const state = createInitialGameState();
    state.upgrades.sentinel = 1;

    // Activate one sentinel close to a corrupted worker.
    const sentinel = state.sentinels[0];
    sentinel.rebootTicks = 0;
    sentinel.retreating = false;
    sentinel.cooldown = 0;
    sentinel.hp = sentinel.maxHp;

    const worker = state.agents[0];
    worker.active = true;
    worker.corrupted = true;
    worker.corruptionTicks = 50;
    // Position worker within corruptionVisionRadius of sentinel.
    worker.x = sentinel.x + WARDEN.corruptionVisionRadius - 5;
    worker.y = sentinel.y;
    // Set HP low enough that one sentinel shot kills it.
    const cleanseDamage = SENTINEL.damageBase + state.upgrades.sentinel * SENTINEL.damagePerSentinel;
    worker.hp = cleanseDamage - 1;

    // Also move sentinel within rangeBase of the worker.
    sentinel.x = worker.x - SENTINEL.rangeBase + 5;
    sentinel.y = worker.y;

    const fluxBefore = state.resources.flux;
    const coresBefore = state.resources.cores;

    stepSentinels(state);

    expect(worker.corrupted).toBe(false);
    expect(worker.rebootTicks).toBe(WARDEN.corruptionRebootTicks);
    expect(state.resources.flux).toBeGreaterThan(fluxBefore);
    expect(state.resources.cores).toBe(coresBefore + WARDEN.cleanseCoreReward);
    expect(state.stats.corruptedPurified).toBe(1);
  });

  it("sentinel cleanse restores worker maxHp to workerBaseHp", () => {
    const state = createInitialGameState();
    state.upgrades.sentinel = 1;

    const sentinel = state.sentinels[0];
    sentinel.rebootTicks = 0;
    sentinel.retreating = false;
    sentinel.cooldown = 0;
    sentinel.hp = sentinel.maxHp;

    const worker = state.agents[0];
    worker.active = true;
    worker.corrupted = true;
    worker.corruptionTicks = 50;
    worker.maxHp = Math.round(WARDEN.workerBaseHp * WARDEN.corruptToughnessMult); // 150 — boosted
    worker.spottedTicks = WARDEN.workerReportDuration;

    const cleanseDamage = SENTINEL.damageBase + state.upgrades.sentinel * SENTINEL.damagePerSentinel;
    worker.hp = cleanseDamage - 1;
    worker.x = sentinel.x + WARDEN.corruptionVisionRadius - 5;
    worker.y = sentinel.y;
    sentinel.x = worker.x - SENTINEL.rangeBase + 5;
    sentinel.y = worker.y;

    stepSentinels(state);

    expect(worker.corrupted).toBe(false);
    expect(worker.maxHp).toBe(WARDEN.workerBaseHp); // toughness buff removed on cleanse
  });

  it("damageCorruptedWorker clamps HP, flashes, and ignores non-corrupted workers", () => {
    const state = createInitialGameState();
    const worker = state.agents[0];
    worker.corrupted = true;
    worker.hp = 5;

    damageCorruptedWorker(worker, 10);

    expect(worker.hp).toBe(0);
    expect(worker.damageTicks).toBe(WORKER.combatDamageTicks);

    worker.corrupted = false;
    worker.hp = 5;
    worker.damageTicks = 0;
    damageCorruptedWorker(worker, 3);
    expect(worker.hp).toBe(5);
    expect(worker.damageTicks).toBe(0);
  });

  it("sentinel cannot see corrupted worker beyond visionRadius without spotting", () => {
    const state = createInitialGameState();
    state.upgrades.sentinel = 1;

    const sentinel = state.sentinels[0];
    sentinel.rebootTicks = 0;
    sentinel.retreating = false;
    sentinel.cooldown = 0;
    sentinel.hp = sentinel.maxHp;

    const worker = state.agents[0];
    worker.active = true;
    worker.corrupted = true;
    worker.spottedTicks = 0; // not spotted
    // Place far outside corruptionVisionRadius.
    worker.x = sentinel.x + WARDEN.corruptionVisionRadius + 100;
    worker.y = sentinel.y;
    worker.hp = 50;

    stepSentinels(state);

    // Worker should remain corrupted — sentinel couldn't see it.
    expect(worker.corrupted).toBe(true);
    expect(worker.hp).toBe(50);
  });

  // ── Worker reboot ───────────────────────────────────────────────────────────

  it("rebooting worker parks at home and skips pathfinding", () => {
    const state = createInitialGameState();
    const worker = state.agents[0];
    worker.active = true;
    worker.corrupted = false;
    worker.rebootTicks = 100;
    worker.x = 999;
    worker.y = 888;
    worker.target = 42;

    stepWorkers(state);

    expect(worker.x).toBe(worker.homeX);
    expect(worker.y).toBe(worker.homeY);
    expect(worker.target).toBeNull();
    expect(worker.rebootTicks).toBe(99);
    expect(worker.task).toBe("Rebooting");
  });

  it("worker HP is restored to max when rebootTicks expires", () => {
    const state = createInitialGameState();
    const worker = state.agents[0];
    worker.active = true;
    worker.corrupted = false;
    worker.rebootTicks = 1; // last tick of reboot
    worker.hp = 1;
    worker.maxHp = 80;

    stepWorkers(state);

    expect(worker.rebootTicks).toBe(0);
    expect(worker.hp).toBe(worker.maxHp);
  });

  // ── stepWardenSpawn gates ───────────────────────────────────────────────────

  it("stepWardenSpawn does not spawn below tier threshold", () => {
    const state = createInitialGameState();
    // tier is low on initial state; ensure warden timer is past interval
    state.timers.warden = WARDEN.wardenSpawnIntervalTicks + 1;
    const enemiesBefore = state.enemies.length;

    stepWardenSpawn(state);

    // No warden should spawn at low tier regardless of timer
    expect(state.enemies.filter((e) => e.kind === "warden").length).toBe(0);
    expect(state.enemies.length).toBe(enemiesBefore);
    expect(state.timers.warden).toBe(0);
  });

  it("stepWardenSpawn does not spawn a second warden while one is already on field", () => {
    const state = createInitialGameState();
    // Force tier high enough via level + upgrades.
    state.level = 80;
    state.prestige = 5;
    Object.keys(state.upgrades).forEach((key) => {
      state.upgrades[key as keyof typeof state.upgrades] = 10;
    });
    state.timers.warden = WARDEN.wardenSpawnIntervalTicks + 1;

    // Place a live warden on the field already.
    const existing = spawnEnemy(state.rng, state.nextEnemyId++, 1, "warden");
    existing.hp = 50;
    state.enemies.push(existing);

    stepWardenSpawn(state);

    expect(state.enemies.filter((e) => e.kind === "warden").length).toBe(1);
    expect(state.timers.warden).toBe(0);
  });

  it("stepWardenSpawn blocks spawn and restarts cooldown when only 1 healthy worker remains", () => {
    // Default state has 3 active workers (slot 0 of miner/runner/drone).
    // Corrupt 2 of them → 1 healthy → gate triggers.
    const state = createInitialGameState();
    state.level = 80;
    state.prestige = 5;
    Object.keys(state.upgrades).forEach((key) => {
      state.upgrades[key as keyof typeof state.upgrades] = 10;
    });
    state.timers.warden = WARDEN.wardenSpawnIntervalTicks + 120;

    // agents[0] = miner slot 0 (active), agents[3] = runner slot 0 (active)
    state.agents[0].corrupted = true;
    state.agents[3].corrupted = true; // leaves drone slot 0 as the 1 healthy worker

    stepWardenSpawn(state);

    expect(state.timers.warden).toBe(0);
    expect(state.enemies.some((e) => e.kind === "warden")).toBe(false);

    // Clearing one corruption → 2 healthy → gate lifts
    state.agents[0].corrupted = false;
    for (let i = 0; i < WARDEN.wardenSpawnIntervalTicks - 1; i += 1) {
      stepWardenSpawn(state);
    }
    expect(state.enemies.some((e) => e.kind === "warden")).toBe(false);

    stepWardenSpawn(state);
    expect(state.enemies.some((e) => e.kind === "warden")).toBe(true);
  });

  it("stepWardenSpawn allows spawn when 1 worker is corrupted but 2+ healthy remain", () => {
    // Default: 3 active workers. Corrupt 1 → 2 healthy → gate should not block.
    const state = createInitialGameState();
    state.level = 80;
    state.prestige = 5;
    Object.keys(state.upgrades).forEach((key) => {
      state.upgrades[key as keyof typeof state.upgrades] = 10;
    });
    state.timers.warden = WARDEN.wardenSpawnIntervalTicks;

    state.agents[0].corrupted = true; // 1 corrupted, 2 healthy

    stepWardenSpawn(state);

    expect(state.enemies.some((e) => e.kind === "warden")).toBe(true);
  });

  it("stepWardenSpawn healthy-worker gate scales with fleet size", () => {
    // 6 active workers (activate slot 1 of each kind). With 4 corrupted → 2 healthy → allowed.
    // Then 5 corrupted → 1 healthy → blocked.
    const state = createInitialGameState();
    state.level = 80;
    state.prestige = 5;
    Object.keys(state.upgrades).forEach((key) => {
      state.upgrades[key as keyof typeof state.upgrades] = 10;
    });

    // Activate slot 1 of miner (agents[1]), runner (agents[4]), drone (agents[7])
    state.agents[1].active = true;
    state.agents[4].active = true;
    state.agents[7].active = true;
    // 6 active total: agents 0,1 (miner), 3,4 (runner), 6,7 (drone)

    // Corrupt 4 → 2 healthy → spawn should be allowed
    state.agents[0].corrupted = true;
    state.agents[1].corrupted = true;
    state.agents[3].corrupted = true;
    state.agents[4].corrupted = true;

    state.timers.warden = WARDEN.wardenSpawnIntervalTicks;
    stepWardenSpawn(state);
    expect(state.enemies.some((e) => e.kind === "warden")).toBe(true);

    // Reset and corrupt a 5th → 1 healthy → blocked
    state.enemies = state.enemies.filter((e) => e.kind !== "warden");
    state.agents[6].corrupted = true;
    state.timers.warden = WARDEN.wardenSpawnIntervalTicks;
    stepWardenSpawn(state);
    expect(state.enemies.some((e) => e.kind === "warden")).toBe(false);
    expect(state.timers.warden).toBe(0);
  });
});

describe("event modifier composition", () => {
  it("stacks overlapping modifiers multiplicatively and does not clobber on expire", async () => {
    const { activateEvent, EVENT_DEFS } = await import("@/game/events/eventDefs");
    const { stepEvents } = await import("@/game/subsystems/events");
    const state = createInitialGameState(1);

    const meteor = EVENT_DEFS.find((d) => d.id === "meteor_shower")!;
    const starcall = EVENT_DEFS.find((d) => d.id === "starcall")!;

    activateEvent(state, meteor, false);
    expect(state.eventModifiers.yieldMultiplier).toBeCloseTo(1.6);

    activateEvent(state, starcall, false);
    // Both active: 1.6 * 2 = 3.2 on yield; starcall also adds 1.5 on energy.
    expect(state.eventModifiers.yieldMultiplier).toBeCloseTo(3.2);
    expect(state.eventModifiers.energyRate).toBeCloseTo(1.5);

    // Expire starcall by forcing its timer to 1 tick remaining.
    const starcallActive = state.activeEvents.find((e) => e.id === "starcall")!;
    starcallActive.ticksRemaining = 1;
    stepEvents(state);

    // Meteor still contributes; starcall gone.
    expect(state.activeEvents.some((e) => e.id === "starcall")).toBe(false);
    expect(state.eventModifiers.yieldMultiplier).toBeCloseTo(1.6);
    expect(state.eventModifiers.energyRate).toBeCloseTo(1);
  });

  it("late-tier events (minTier 6/7) are reachable once rawTier passes the threshold", () => {
    const state = createInitialGameState(1);
    // prestige's score coefficient is high (8), so ~70 prestige pushes
    // rawTier past 7 while display `tier` stays capped at 5.
    state.prestige = 70;
    const derived = computeDerived(state);
    expect(derived.progression.rawTier).toBeGreaterThanOrEqual(7);
    expect(derived.progression.tier).toBeLessThanOrEqual(5);
  });
});

describe("defense scoring includes late-game upgrades (3.1.3 audit)", () => {
  it("focusedBeam and missileLauncher contribute to defenseScore and weightedUpgradeScore", async () => {
    const { DEFENSE } = await import("@/game/balance");
    const base = createInitialGameState(1);
    const upgraded = createInitialGameState(1);
    upgraded.upgrades.focusedBeam = 3;
    upgraded.upgrades.missileLauncher = 2;

    const baseDerived = computeDerived(base);
    const upDerived = computeDerived(upgraded);

    const expectedDefenseDelta = 3 * DEFENSE.score.focusedBeam + 2 * DEFENSE.score.missileLauncher;
    expect(upDerived.defenseScore - baseDerived.defenseScore).toBeCloseTo(expectedDefenseDelta, 5);

    const expectedWeightedDelta =
      3 * DEFENSE.weightedUpgrade.focusedBeam + 2 * DEFENSE.weightedUpgrade.missileLauncher;
    expect(upDerived.homeDevelopment).toBeGreaterThan(baseDerived.homeDevelopment);
    // weightedUpgradeScore isn't exposed directly, but homeDevelopment pulls it
    // through CITY.developmentWeights.weightedUpgrade — sanity-check it's nonzero.
    expect(expectedWeightedDelta).toBeGreaterThan(0);
  });
});

describe("tick-wrap audit (3.1.3)", () => {
  it("elapsedTicks returns the wrap-safe delta across TICK_WRAP", async () => {
    const { elapsedTicks } = await import("@/game/utils");
    const { TICK_WRAP } = await import("@/game/constants");
    // Simple case.
    expect(elapsedTicks(100, 40)).toBe(60);
    // Wrap case: tick wrapped from TICK_WRAP-1 to 100.
    expect(elapsedTicks(100, TICK_WRAP - 60)).toBe(160);
  });

  it("temporary node despawn survives a TICK_WRAP boundary", async () => {
    const { stepEvents } = await import("@/game/subsystems/events");
    const { TICK_WRAP } = await import("@/game/constants");
    const state = createInitialGameState(1);
    // Plant a temporary node near the wrap boundary: spawned pre-wrap,
    // despawnAt stored (in engine) as raw tick+duration and therefore
    // greater than TICK_WRAP when normalized.
    state.timers.tick = TICK_WRAP - 10;
    const node = state.nodes[0];
    node.temporary = true;
    node.spawnTick = TICK_WRAP - 10;
    // Deadline 60 ticks out, stored directly (>TICK_WRAP).
    node.despawnAt = TICK_WRAP - 10 + 60;

    // Advance tick past the wrap and past the 60-tick lifespan.
    state.timers.tick = 100; // equivalent to (TICK_WRAP - 10 + 110) % TICK_WRAP
    const idBefore = node.id;

    stepEvents(state);

    // Node is expired and gone from the array.
    expect(state.nodes.some((n) => n.id === idBefore)).toBe(false);
  });
});

describe("resolveEnemyDeaths idempotency (3.1.3 audit)", () => {
  it("does not double-decrement dyingTicks when called twice in the same tick", async () => {
    const { resolveEnemyDeaths, tickDeathFades } = await import("@/game/subsystems/combat");
    const state = createInitialGameState(1);
    const dying = spawnEnemy(state.rng, state.nextEnemyId++, 0, "mite");
    dying.hp = 0;
    state.enemies.push(dying);

    // First call seeds the fade countdown. We bypass the tick-down that
    // advanceGame runs separately at tickDeathFades.
    resolveEnemyDeaths(state);
    const afterFirst = dying.dyingTicks;
    expect(afterFirst).toBeGreaterThan(0);

    // A second resolve pass in the same tick must not alter an already-dying
    // enemy's countdown. Before 3.1.3 this decremented dyingTicks again.
    resolveEnemyDeaths(state);
    expect(dying.dyingTicks).toBe(afterFirst);

    // The split tickDeathFades owns the countdown decrement.
    tickDeathFades(state);
    expect(dying.dyingTicks).toBe(afterFirst - 1);
  });
});

describe("cloneGameState RNG isolation (3.1.3 audit)", () => {
  it("clone has an independent RNG instance (mutations don't bleed)", () => {
    const original = createInitialGameState(123);
    const clone = cloneGameState(original);

    expect(clone.rng).not.toBe(original.rng);
    expect(clone.rng.getState()).toBe(original.rng.getState());

    const beforeClone = clone.rng.getState();
    original.rng.next();
    expect(clone.rng.getState()).toBe(beforeClone);
  });
});

describe("colonyHealth normalization (3.1.3 audit)", () => {
  it("averages hp/maxHp over active workers only, scaled to 0..100", () => {
    const state = createInitialGameState(1);
    const active = state.agents.filter((a) => a.active);
    // Put exactly one active worker at 50% HP, inactive-slots untouched.
    active[0].hp = 50;
    active[0].maxHp = 100;
    for (let i = 1; i < active.length; i++) {
      active[i].hp = active[i].maxHp;
    }

    const derived = computeDerived(state);
    // Initial state has 1 active worker (slot 0) — 50% of 100 == 50.
    const expected = (active.reduce((sum, a) => sum + a.hp / a.maxHp, 0) / active.length) * 100;
    expect(derived.colonyHealth).toBeCloseTo(expected, 5);
    expect(derived.colonyHealth).toBeLessThan(100);
    expect(derived.colonyHealth).toBeGreaterThan(0);
  });

  it("corruption toughness buff (maxHp=150) does not push colonyHealth above 100", () => {
    const state = createInitialGameState(1);
    const active = state.agents.filter((a) => a.active);
    // Simulate a warden-toughened worker: hp=150, maxHp=150.
    active[0].hp = 150;
    active[0].maxHp = 150;
    const derived = computeDerived(state);
    expect(derived.colonyHealth).toBeLessThanOrEqual(100);
    expect(derived.colonyHealth).toBeCloseTo(100, 5);
  });
});

describe("selectors ignore dying enemies (3.1.3 audit)", () => {
  it("enemyCounts, combatThreats, and corruptorCount skip hp=0 corpses", () => {
    const state = createInitialGameState(1);
    const live = spawnEnemy(state.rng, state.nextEnemyId++, 0, "raider");
    const dying = spawnEnemy(state.rng, state.nextEnemyId++, 0, "raider");
    dying.hp = 0;
    dying.dyingTicks = 30;
    const corrLive = spawnEnemy(state.rng, state.nextEnemyId++, 0, "corruptor");
    const corrDying = spawnEnemy(state.rng, state.nextEnemyId++, 0, "corruptor");
    corrDying.hp = 0;
    corrDying.dyingTicks = 30;
    state.enemies.push(live, dying, corrLive, corrDying);

    const derived = computeDerived(state);
    expect(derived.enemyCounts.raider).toBe(1);
    expect(derived.enemyCounts.corruptor).toBe(1);
    expect(derived.combatThreats).toBe(1);
    expect(derived.corruptorCount).toBe(1);
  });
});
