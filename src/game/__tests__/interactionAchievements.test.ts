import { describe, expect, it } from "vitest";
import {
  clickDyingEnemy,
  clickProjectile,
  inspectEventTag,
  recordAchievementsOpen,
  recordChangelogOpen,
  recordManualPurchase,
  recoverLostDrone,
  spotTourist,
  witnessAnomaly,
} from "@/game/achievements";
import { activateEvent, EVENT_DEFS, getEventDef } from "@/game/events/eventDefs";
import { createInitialGameState, migrateGameState, spawnEnemy } from "@/game/factories";
import { stepAchievements } from "@/game/subsystems/achievements";
import { stepAutobuy } from "@/game/subsystems/autobuy";
import { stepEvents } from "@/game/subsystems/events";
import { ACHIEVEMENTS } from "@/game/balance";
import { AUTO_TICK } from "@/game/constants";
import { recordManualOverrideClick, INITIAL_MANUAL_OVERRIDE_SEQUENCE } from "@/lib/manualOverride";

describe("interaction achievement helpers", () => {
  it("counts tourist clicks separately from distinct passes", () => {
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

    spotTourist(state);
    spotTourist(state);

    expect(state.stats.touristClicks).toBe(2);
    expect(state.stats.touristPassesClicked).toBe(1);
    expect(state.achievements.tourist_spotted).toBe(true);
    expect(state.achievements.tour_guide).toBeUndefined();

    state.touristWorker.passId = 2;
    spotTourist(state);
    state.touristWorker.passId = 3;
    spotTourist(state);

    expect(state.stats.touristPassesClicked).toBe(3);
    expect(state.achievements.tour_guide).toBe(true);

    while (state.stats.touristClicks < 50) {
      spotTourist(state);
    }

    expect(state.achievements.tourist_clicks_50).toBe(true);
  });

  it("tracks inspected event cards across all 12 defs and only storm events unlock Stormwatch", () => {
    const state = createInitialGameState();

    inspectEventTag(state, "meteor_shower");
    expect(state.achievements.stormwatch).toBeUndefined();

    inspectEventTag(state, "dust_storm");
    expect(state.achievements.stormwatch).toBe(true);

    EVENT_DEFS.forEach((eventDef) => {
      inspectEventTag(state, eventDef.id);
    });

    expect(state.stats.eventTagsInspected).toHaveLength(EVENT_DEFS.length);
    expect(state.achievements.field_report).toBe(true);
  });

  it("unlocks projectile, corpse, modal, and changelog achievements through explicit interaction only", () => {
    const projectileState = createInitialGameState();
    projectileState.projectiles.push(
      {
        id: 1,
        x1: 0,
        y1: 0,
        x2: 10,
        y2: 10,
        life: 2,
        maxLife: 2,
        color: "#fff",
        width: 2,
        tag: "zapper-bolt",
      },
      {
        id: 2,
        x1: 0,
        y1: 0,
        x2: 10,
        y2: 10,
        life: 3,
        maxLife: 3,
        color: "#fff",
        width: 2,
        tag: "turret-missile",
      },
      {
        id: 3,
        x1: 0,
        y1: 0,
        x2: 10,
        y2: 10,
        life: 0,
        maxLife: 1,
        color: "#fff",
        width: 2,
        tag: "zapper-bolt",
      }
    );

    expect(clickProjectile(projectileState, 1)).toBe(true);
    expect(clickProjectile(projectileState, 2)).toBe(true);
    expect(clickProjectile(projectileState, 3)).toBe(false);
    expect(projectileState.achievements.signal_trace).toBe(true);
    expect(projectileState.achievements.warhead_whisperer).toBe(true);

    const enemyState = createInitialGameState();
    const enemy = spawnEnemy(enemyState.rng, enemyState.nextEnemyId++, 0, "mite");
    enemy.hp = 0;
    enemy.dyingTicks = 6;
    enemyState.enemies.push(enemy);

    expect(clickDyingEnemy(enemyState, enemy.id)).toBe(true);
    expect(enemyState.achievements.last_look).toBe(true);

    const uiState = createInitialGameState();
    expect(recordAchievementsOpen(uiState)).toBe(false);
    uiState.achievements.tourist_spotted = true;
    expect(recordAchievementsOpen(uiState)).toBe(true);
    expect(uiState.achievements.archivist).toBe(true);
    expect(recordChangelogOpen(uiState)).toBe(true);
    expect(uiState.achievements.release_reader).toBe(true);
  });
});

describe("event HUD linger and anomaly gating", () => {
  it("keeps one-shot event cards visible for roughly 10 seconds without a revert step", () => {
    const state = createInitialGameState();
    const cacheDiscovery = getEventDef("cache_discovery");
    expect(cacheDiscovery).toBeDefined();

    activateEvent(state, cacheDiscovery!, false);
    state.timers.bigEvent = 0;
    state.nextBigEventInterval = Number.MAX_SAFE_INTEGER;

    expect(state.activeEvents).toHaveLength(1);
    expect(state.activeEvents[0].id).toBe("cache_discovery");
    expect(state.activeEvents[0].revertOnExpire).toBe(false);
    const temporaryNodeCount = state.nodes.filter((node) => node.temporary).length;
    expect(temporaryNodeCount).toBeGreaterThan(0);

    for (let i = 0; i < cacheDiscovery!.hudDurationTicks; i += 1) {
      stepEvents(state);
    }

    expect(state.activeEvents).toHaveLength(0);
    expect(state.nodes.filter((node) => node.temporary)).toHaveLength(temporaryNodeCount);
  });

  it("reverts timed events on HUD expiry and does not unlock anomaly witness passively", () => {
    const state = createInitialGameState();
    const solarFlare = getEventDef("solar_flare");
    expect(solarFlare).toBeDefined();

    activateEvent(state, solarFlare!, false);
    state.timers.bigEvent = 0;
    state.nextBigEventInterval = Number.MAX_SAFE_INTEGER;
    expect(state.eventModifiers.energyRate).toBe(2);
    expect(state.activeEvents[0].revertOnExpire).toBe(true);

    for (let i = 0; i < solarFlare!.hudDurationTicks; i += 1) {
      stepEvents(state);
    }

    expect(state.activeEvents).toHaveLength(0);
    expect(state.eventModifiers.energyRate).toBe(1);
    expect(state.eventModifiers.turretCooldownScale).toBe(1);

    const anomalyState = createInitialGameState();
    anomalyState.activeEvents = EVENT_DEFS.slice(0, 3).map((eventDef, index) => ({
      id: eventDef.id,
      label: eventDef.label,
      ticksRemaining: 300 - index,
      revertOnExpire: true,
    }));

    stepAchievements(anomalyState);
    expect(anomalyState.achievements.event_streak).toBeUndefined();

    witnessAnomaly(anomalyState);
    expect(anomalyState.achievements.event_streak).toBe(true);
  });

  it("uses the full event def list for Strange Tides and Field Report thresholds", () => {
    const state = createInitialGameState();
    state.stats.eventsExperienced = EVENT_DEFS.map((eventDef) => eventDef.id);
    state.stats.eventTagsInspected = EVENT_DEFS.map((eventDef) => eventDef.id);

    stepAchievements(state);

    expect(state.achievements.all_events).toBe(true);
    expect(state.achievements.field_report).toBe(true);
  });

  it("uses uncapped threat rank thresholds for late progression achievements", () => {
    const state = createInitialGameState();
    // 3.0.0: tiersPerScore=75 means tier_10 requires score ≥ 750. Only an
    // extreme multi-session setup clears that bar, which is the whole point
    // of uncapped threat rank.
    state.level = 500;
    state.prestige = 20;
    for (const key of Object.keys(state.upgrades) as Array<keyof typeof state.upgrades>) {
      state.upgrades[key] = 20;
    }

    stepAchievements(state);

    expect(state.achievements.tier_5).toBe(true);
    expect(state.achievements.tier_8).toBe(true);
    expect(state.achievements.tier_10).toBe(true);
  });
});

describe("lost drone spawn and migration", () => {
  it("spawns a broken lost drone on the rare event roll and only recruits it after recovery", () => {
    const state = createInitialGameState();
    // 3.0.0: LOST_DRONE_SCORE_THRESHOLD = 9 * tiersPerScore = 675 under the
    // new curve, so the setup needs extreme late-game weight to unlock the
    // spawn gate.
    state.level = 500;
    state.prestige = 20;
    for (const key of Object.keys(state.upgrades) as Array<keyof typeof state.upgrades>) {
      state.upgrades[key] = 20;
    }
    state.timers.bigEvent = state.nextBigEventInterval;
    state.rng.chance = () => true;

    const startingAgents = state.agents.length;
    stepEvents(state);

    expect(state.lostDrone).not.toBeNull();
    expect(state.agents).toHaveLength(startingAgents);
    expect(state.lostWorkerFound).toBe(false);

    const recruited = recoverLostDrone(state);
    expect(recruited).toBe(true);
    expect(state.lostDrone).toBeNull();
    expect(state.lostWorkerFound).toBe(true);
    expect(state.agents).toHaveLength(startingAgents + 1);
    expect(state.agents[state.agents.length - 1]?.kind).toBe("drone");
    expect(state.achievements.lost_drone).toBe(true);
  });

  it("migrates legacy saves with new interaction defaults and preserves repurposed anomaly unlocks", () => {
    const restored = migrateGameState({
      achievements: { event_streak: true },
      stats: {
        mined: 0,
        spent: 0,
        crits: 0,
        hostileKills: 0,
        totalEnemiesKilled: 0,
        brutesKilled: 0,
        phantomsKilled: 0,
        leechesKilled: 0,
        sappersKilled: 0,
        sentinelKills: 0,
        blocked: 0,
        corruptions: 0,
        purges: 0,
        eventsExperienced: [],
        runtimeMs: 0,
      },
      touristWorker: {
        x: 128,
        y: 256,
        angle: 0.2,
        active: true,
        spotted: true,
      },
      activeEvents: [
        {
          id: "solar_flare",
          label: "Solar Flare",
          ticksRemaining: 120,
        },
      ],
    } as unknown as Parameters<typeof migrateGameState>[0]);

    expect(restored.stats.eventTagsInspected).toEqual([]);
    expect(restored.stats.touristClicks).toBe(0);
    expect(restored.stats.touristPassesClicked).toBe(0);
    expect(restored.touristWorker?.passId).toBe(1);
    expect(restored.touristWorker?.lastClickedPassId).toBeNull();
    expect(restored.touristWorker?.squishTicks).toBe(0);
    expect(restored.lostDrone).toBeNull();
    expect(restored.activeEvents[0].revertOnExpire).toBe(true);
    expect(restored.achievements.event_streak).toBe(true);
  });
});

describe("operator-model achievements (4.0)", () => {
  it("first_manual_purchase fires on a manual buy signal and is idempotent", () => {
    const state = createInitialGameState();
    expect(state.achievements.first_manual_purchase).toBeUndefined();

    expect(recordManualPurchase(state)).toBe(true);
    expect(state.achievements.first_manual_purchase).toBe(true);

    // Second manual buy must NOT re-fire (no double-unlock).
    expect(recordManualPurchase(state)).toBe(false);
  });

  it("first_manual_purchase does NOT fire from autobuy purchases", () => {
    const state = createInitialGameState(1234);
    state.enemies = [];
    // Restore pre-4.0 always-autobuy so the ranking actually buys this tick.
    state.upgradeAutoMaster = "all";
    state.resources.gold = 10_000;
    state.resources.ore = 10_000;
    state.resources.gems = 10_000;
    state.resources.energy = 10_000;
    state.resources.cores = 10_000;
    state.timers.auto = AUTO_TICK;

    const upgradesBefore = Object.values(state.upgrades).reduce((a, b) => a + b, 0);
    stepAutobuy(state);
    const upgradesAfter = Object.values(state.upgrades).reduce((a, b) => a + b, 0);

    // Proof autobuy actually bought something this tick…
    expect(upgradesAfter).toBeGreaterThan(upgradesBefore);
    // …yet the manual-purchase achievement stays locked — autobuy never signals it.
    expect(state.achievements.first_manual_purchase).toBeUndefined();
  });

  it("autobuy_off_milestone fires after the continuous off-tick threshold and resets when autobuy is on", () => {
    const state = createInitialGameState();
    state.upgradeAutoMaster = "none";
    state.stats.autobuyOffTicks = ACHIEVEMENTS.autobuyOffMilestoneTicks - 1;

    stepAchievements(state); // ticks to the threshold
    expect(state.stats.autobuyOffTicks).toBe(ACHIEVEMENTS.autobuyOffMilestoneTicks);
    expect(state.achievements.autobuy_off_milestone).toBe(true);

    // Flipping autobuy back on resets the continuous counter.
    const other = createInitialGameState();
    other.upgradeAutoMaster = "all";
    other.stats.autobuyOffTicks = 5000;
    stepAchievements(other);
    expect(other.stats.autobuyOffTicks).toBe(0);
    expect(other.achievements.autobuy_off_milestone).toBeUndefined();
  });

  it("autobuy_off_milestone does not fire spuriously while autobuy is enabled", () => {
    const state = createInitialGameState();
    state.upgradeAutoMaster = "all";
    for (let i = 0; i < 50; i++) stepAchievements(state);
    expect(state.stats.autobuyOffTicks).toBe(0);
    expect(state.achievements.autobuy_off_milestone).toBeUndefined();
  });

  it("full_manual_run needs both tier 3 AND autobuy off", () => {
    // Extreme late-game weight so the display tier is well past 3.
    const tierThreeState = () => {
      const state = createInitialGameState();
      state.level = 500;
      state.prestige = 20;
      for (const key of Object.keys(state.upgrades) as Array<keyof typeof state.upgrades>) {
        state.upgrades[key] = 20;
      }
      return state;
    };

    // Autobuy on → no unlock even at high tier.
    const autoOn = tierThreeState();
    autoOn.upgradeAutoMaster = "all";
    stepAchievements(autoOn);
    expect(autoOn.achievements.full_manual_run).toBeUndefined();

    // Autobuy off + tier 3 → unlock.
    const manual = tierThreeState();
    manual.upgradeAutoMaster = "none";
    stepAchievements(manual);
    expect(manual.achievements.full_manual_run).toBe(true);
  });

  it("full_manual_run stays locked at low tier even with autobuy off", () => {
    const state = createInitialGameState();
    state.upgradeAutoMaster = "none";
    stepAchievements(state);
    expect(state.achievements.full_manual_run).toBeUndefined();
  });
});

describe("manual override sequence", () => {
  it("only unlocks on 1x -> 4x -> 1x after 10 to 60 seconds with no other speed click in between", () => {
    let result = recordManualOverrideClick(INITIAL_MANUAL_OVERRIDE_SEQUENCE, 1, 4, 0);
    expect(result.unlocked).toBe(false);

    const tooFast = recordManualOverrideClick(result.sequence, 4, 1, 9_000);
    expect(tooFast.unlocked).toBe(false);

    result = recordManualOverrideClick(INITIAL_MANUAL_OVERRIDE_SEQUENCE, 1, 4, 0);
    const success = recordManualOverrideClick(result.sequence, 4, 1, 15_000);
    expect(success.unlocked).toBe(true);

    result = recordManualOverrideClick(INITIAL_MANUAL_OVERRIDE_SEQUENCE, 1, 4, 0);
    const interrupted = recordManualOverrideClick(result.sequence, 4, 2, 12_000);
    expect(interrupted.unlocked).toBe(false);
    expect(interrupted.sequence).toEqual(INITIAL_MANUAL_OVERRIDE_SEQUENCE);

    result = recordManualOverrideClick(INITIAL_MANUAL_OVERRIDE_SEQUENCE, 1, 4, 0);
    const tooSlow = recordManualOverrideClick(result.sequence, 4, 1, 61_000);
    expect(tooSlow.unlocked).toBe(false);
  });
});
