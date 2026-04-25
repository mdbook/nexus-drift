import { describe, expect, it } from "vitest";
import { ADMIN_SPEED_PRESETS, executeAdminCommand } from "@/game/adminCommands";
import { createInitialGameState } from "@/game/factories";

describe("admin command terminal", () => {
  it("grants resources and records an admin log entry", () => {
    const state = createInitialGameState(123);
    const result = executeAdminCommand(state, "grant gold 500");

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(state.resources.gold).toBe(560);
    expect(state.log[0].message).toContain("Admin granted gold");
  });

  it("sets and increments upgrade levels", () => {
    const state = createInitialGameState(123);

    expect(executeAdminCommand(state, "upgrade miner +3").ok).toBe(true);
    expect(state.upgrades.miner).toBe(3);

    expect(executeAdminCommand(state, "upgrade miner 1").ok).toBe(true);
    expect(state.upgrades.miner).toBe(1);
  });

  it("triggers and clears timed events with modifier reverts", () => {
    const state = createInitialGameState(123);

    expect(executeAdminCommand(state, "event solar_flare").ok).toBe(true);
    expect(state.activeEvents).toHaveLength(1);
    expect(state.eventModifiers.energyRate).toBe(2);
    expect(state.eventModifiers.turretCooldownScale).toBe(1.2);

    expect(executeAdminCommand(state, "clear events").ok).toBe(true);
    expect(state.activeEvents).toHaveLength(0);
    expect(state.eventModifiers.energyRate).toBe(1);
    expect(state.eventModifiers.turretCooldownScale).toBe(1);
  });

  it("spawns enemies via the seeded factory path", () => {
    const state = createInitialGameState(123);
    state.timers.tick = 42;

    const result = executeAdminCommand(state, "spawn brute 2 10");

    expect(result.ok).toBe(true);
    expect(state.enemies).toHaveLength(2);
    expect(state.enemies[0].kind).toBe("brute");
    expect(state.enemies[0].spawnTick).toBe(42);
    expect(state.nextEnemyId).toBe(3);
  });

  it("clears corruption without changing save schema", () => {
    const state = createInitialGameState(123);
    state.nodes[1].corruption = 95;
    state.nodes[1].corrupted = true;
    state.nodes[1].corruptedBy = 7;
    state.agents[0].corrupted = true;
    state.agents[0].corruptionTicks = 300;
    state.agents[0].corruptingTicks = 120;
    state.agents[0].spottedTicks = 30;

    expect(executeAdminCommand(state, "clear corruption").ok).toBe(true);
    expect(state.nodes[1].corruption).toBe(0);
    expect(state.nodes[1].corrupted).toBe(false);
    expect(state.nodes[1].corruptedBy).toBeNull();
    expect(state.agents[0].corrupted).toBe(false);
    expect(state.agents[0].corruptionTicks).toBe(0);
    expect(state.schemaVersion).toBe(createInitialGameState(123).schemaVersion);
  });

  it("returns shell effects for speed and banner commands", () => {
    const state = createInitialGameState(123);
    const speed = executeAdminCommand(state, "speed 100");
    const unsupportedSpeed = executeAdminCommand(state, "speed 5");
    const banner = executeAdminCommand(state, "banner");

    expect(speed.ok).toBe(true);
    expect(speed.requestedSpeed).toBe(100);
    expect(unsupportedSpeed.ok).toBe(false);
    expect(banner.showPreviewBanner).toBe(true);
    expect(ADMIN_SPEED_PRESETS).toContain(100);
  });
});
