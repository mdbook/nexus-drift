import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSavedState, SAVE_KEY, saveGameState } from "@/game/persistence";
import { createInitialGameState, migrateGameState, SCHEMA_VERSION } from "@/game/factories";
import { advanceGame } from "@/game/advanceGame";

type RawSave = Parameters<typeof migrateGameState>[0];

/** A JSON round-trip of a fresh state, standing in for a serialized save on disk. */
function serializedSave(seed: number): Record<string, unknown> {
  return JSON.parse(JSON.stringify(createInitialGameState(seed))) as Record<string, unknown>;
}

// Vitest runs in the node environment, so localStorage is not present by
// default. The persistence layer is the only entry point that touches the
// browser-side store, so the test file installs a minimal in-memory shim.
function installLocalStorageShim() {
  const store = new Map<string, string>();
  const shim = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { localStorage: typeof shim }).localStorage = shim;
  return shim;
}

describe("persistence load/save round-trip", () => {
  beforeEach(() => {
    installLocalStorageShim();
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it("loadSavedState returns a fresh initial state when nothing is stored", () => {
    const loaded = loadSavedState();
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.resources.gold).toBe(createInitialGameState().resources.gold);
  });

  it("saved state round-trips through save → load with key fields preserved", () => {
    // Run a few ticks so the saved state isn't structurally identical to a
    // fresh init — exercises log entries, tick advancement, and agent state.
    let state = createInitialGameState(42);
    for (let i = 0; i < 25; i++) state = advanceGame(state);
    state.resources.gold = 1234;
    state.level = 4;

    saveGameState(state);
    const loaded = loadSavedState();

    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.resources.gold).toBe(1234);
    expect(loaded.level).toBe(4);
    expect(loaded.timers.tick).toBe(state.timers.tick);
    expect(loaded.agents).toHaveLength(state.agents.length);
    expect(Array.isArray(loaded.log)).toBe(true);
    expect(Array.isArray(loaded.archiveLog)).toBe(true);
    expect(loaded.rng.getState()).toBe(state.rng.getState());
  });

  it("malformed JSON in localStorage falls back to a fresh initial state", () => {
    localStorage.setItem(SAVE_KEY, "{not valid json");
    const loaded = loadSavedState();
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    // Fresh state — the corrupt payload was discarded, not coerced.
    expect(loaded.resources).toEqual(createInitialGameState().resources);
  });

  it("payload missing required shape (no resources/upgrades) returns a fresh initial state", () => {
    // The persistence guard rejects partial saves before they hit the migrator,
    // so an obviously-broken save can't be silently merged into a real state.
    localStorage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION }));
    const loaded = loadSavedState();
    expect(loaded.resources).toEqual(createInitialGameState().resources);
  });
});

describe("v13 autobuy-flag migration", () => {
  it("a pre-13 (3.x) save comes up with master=all, empty flags, and schema 13", () => {
    const raw = serializedSave(7);
    // A real 3.x save predates these fields entirely.
    delete raw.upgradeAutoMaster;
    delete raw.upgradeAutoFlags;
    raw.schemaVersion = 12;

    const migrated = migrateGameState(raw as RawSave);

    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.upgradeAutoMaster).toBe("all"); // returning players keep autobuy-everything
    expect(migrated.upgradeAutoFlags).toEqual({});
  });

  it("a fresh 4.0 state defaults to manual play (master=none, empty flags)", () => {
    const fresh = createInitialGameState();
    expect(fresh.upgradeAutoMaster).toBe("none");
    expect(fresh.upgradeAutoFlags).toEqual({});
  });

  it("a v13 save preserves an explicit master/flags choice through migration", () => {
    const raw = serializedSave(9);
    raw.upgradeAutoMaster = "custom";
    raw.upgradeAutoFlags = { miner: true, reactor: false };

    const migrated = migrateGameState(raw as RawSave);

    expect(migrated.upgradeAutoMaster).toBe("custom");
    expect(migrated.upgradeAutoFlags).toEqual({ miner: true, reactor: false });
  });
});
