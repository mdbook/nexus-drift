import { describe, expect, it } from "vitest";
import { createInitialGameState, migrateGameState } from "@/game/factories";
import { ALL_ENEMY_KINDS, computeUnlockedLore, LORE_UNLOCKS } from "@/game/lore";
import { HIDDEN_LORE_IDS, WIKI_ENTRY_IDS } from "@/components/WikiOverlay";
import type { GameState } from "@/game/types";

/** JSON round-trip through the migrator, standing in for a save → load cycle. */
function roundTrip(state: GameState): GameState {
  return migrateGameState(JSON.parse(JSON.stringify(state)));
}

describe("archive lore unlocks", () => {
  it("a fresh colony has every gated entry locked", () => {
    const state = createInitialGameState(1);
    const unlocked = computeUnlockedLore(state);
    expect(unlocked.size).toBe(0);
  });

  it("hidden WikiOverlay entries match LORE_UNLOCKS keys exactly (no orphans)", () => {
    const hidden = [...HIDDEN_LORE_IDS].sort();
    const keys = Object.keys(LORE_UNLOCKS).sort();
    expect(hidden).toEqual(keys);
  });

  it("every enemy kind has a Field Entities codex entry", () => {
    const ids = new Set(WIKI_ENTRY_IDS);
    for (const kind of ALL_ENEMY_KINDS) {
      expect(ids.has(kind)).toBe(true);
    }
  });

  it("archive entry ids are unique", () => {
    expect(new Set(WIKI_ENTRY_IDS).size).toBe(WIKI_ENTRY_IDS.length);
  });

  it("keeps a gated entry locked until its trigger, then unlocks it", () => {
    const state = createInitialGameState(2);
    // sec-null gates on witnessing the Null Surge event.
    expect(computeUnlockedLore(state).has("sec-null")).toBe(false);
    state.stats.eventsExperienced = [...state.stats.eventsExperienced, "null_surge"];
    expect(computeUnlockedLore(state).has("sec-null")).toBe(true);
  });

  it("gates world lore on prestige and achievements", () => {
    const state = createInitialGameState(3);
    expect(computeUnlockedLore(state).has("lore-crews")).toBe(false);
    state.prestige = 1;
    expect(computeUnlockedLore(state).has("lore-crews")).toBe(true);

    expect(computeUnlockedLore(state).has("lore-recursion")).toBe(false);
    state.achievements.prestige_3 = true;
    expect(computeUnlockedLore(state).has("lore-recursion")).toBe(true);
  });

  it("unlocks the lost-drone secret on recovery and the bestiary secret on full discovery", () => {
    const state = createInitialGameState(4);
    expect(computeUnlockedLore(state).has("sec-wrk00")).toBe(false);
    state.lostWorkerFound = true;
    expect(computeUnlockedLore(state).has("sec-wrk00")).toBe(true);

    expect(computeUnlockedLore(state).has("sec-pattern")).toBe(false);
    for (const kind of ALL_ENEMY_KINDS) {
      state.discoveredEnemies[kind] = 1;
    }
    expect(computeUnlockedLore(state).has("sec-pattern")).toBe(true);
  });

  it("preserves unlock state across a save / load round-trip", () => {
    const state = createInitialGameState(5);
    state.prestige = 1;
    state.achievements.first_purge = true;
    state.lostWorkerFound = true;
    state.stats.eventsExperienced = [...state.stats.eventsExperienced, "starcall"];

    const before = computeUnlockedLore(state);
    const after = computeUnlockedLore(roundTrip(state));

    expect([...after].sort()).toEqual([...before].sort());
    expect(after.has("lore-crews")).toBe(true);
    expect(after.has("lore-flux")).toBe(true);
    expect(after.has("sec-wrk00")).toBe(true);
    expect(after.has("sec-starcall")).toBe(true);
  });

  it("computes a stable unlock set with no new persisted field on GameState", () => {
    // Guardrail: the unlock layer is derived, not stored. A fresh state carries
    // no `unlockedLore`-style field; the archive is a pure projection of signals.
    const state = createInitialGameState(6) as GameState & { unlockedLore?: unknown };
    expect(state.unlockedLore).toBeUndefined();
  });
});
