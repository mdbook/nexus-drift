import { describe, expect, it } from "vitest";
import {
  clickDyingEnemy,
  clickProjectile,
  inspectEventTag,
  recordAchievementsOpen,
  recordChangelogOpen,
  recoverLostDrone,
  spotTourist,
  witnessAnomaly,
} from "@/game/achievements";
import { activateEvent, EVENT_DEFS, getEventDef } from "@/game/events/eventDefs";
import { createInitialGameState, migrateGameState, spawnEnemy } from "@/game/factories";
import { stepAchievements } from "@/game/subsystems/achievements";
import { stepEvents } from "@/game/subsystems/events";
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
    state.level = 60;
    state.prestige = 5;
    for (const key of Object.keys(state.upgrades) as Array<keyof typeof state.upgrades>) {
      state.upgrades[key] = 10;
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
    state.level = 60;
    state.prestige = 5;
    for (const key of Object.keys(state.upgrades) as Array<keyof typeof state.upgrades>) {
      state.upgrades[key] = 10;
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
