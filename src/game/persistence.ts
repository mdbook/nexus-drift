import { createInitialGameState, migrateGameState } from "@/game/factories";
import type { GameState } from "@/game/types";

export const SAVE_KEY = "nexusDriftSave";

export function loadSavedState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createInitialGameState();

    const parsed = JSON.parse(raw) as Partial<GameState> & { rng?: { state?: number } };
    if (!parsed.resources || !parsed.upgrades) return createInitialGameState();
    return migrateGameState(parsed);
  } catch {
    return createInitialGameState();
  }
}

export function saveGameState(state: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures in quota-limited/private environments.
  }
}
