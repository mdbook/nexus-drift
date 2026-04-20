import { useCallback, useEffect, useRef, useState } from "react";
import { advanceGame } from "@/game/advanceGame";
import { TICK_MS } from "@/game/constants";
import { cloneGameState } from "@/game/factories";
import { saveGameState } from "@/game/persistence";
import { computeDerived } from "@/game/selectors";
import type { DerivedState, GameState } from "@/game/types";

type Snapshot = {
  game: GameState;
  derived: DerivedState;
  uiGame: GameState;
  uiDerived: DerivedState;
  mutateGame: (updater: (draft: GameState) => void) => void;
};

function snapshotFrom(game: GameState): Snapshot {
  return {
    game,
    derived: computeDerived(game),
    uiGame: game,
    uiDerived: computeDerived(game),
    mutateGame: () => {},
  };
}

const SAVE_INTERVAL_MS = 30_000;
const UI_REFRESH_MS = 125;

export function useGameLoop(initialGameState: GameState, speedMultiplier = 1): Snapshot {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => snapshotFrom(cloneGameState(initialGameState)));
  const gameRef = useRef<GameState>(snapshot.game);
  const speedRef = useRef(speedMultiplier);
  const animFrameRef = useRef(0);
  const accumulatorRef = useRef(0);
  const lastTimeRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const lastSaveRef = useRef(0);
  const lastUiRefreshRef = useRef(0);
  const runtimeCarryRef = useRef(0);
  useEffect(() => { speedRef.current = speedMultiplier; }, [speedMultiplier]);

  const mutateGame = useCallback((updater: (draft: GameState) => void) => {
    const next = cloneGameState(gameRef.current);
    updater(next);
    const nextDerived = computeDerived(next);
    gameRef.current = next;
    setSnapshot((prev) => ({
      ...prev,
      game: next,
      derived: nextDerived,
      uiGame: next,
      uiDerived: nextDerived,
    }));
  }, []);

  useEffect(() => {
    lastTimeRef.current = performance.now();
    lastSaveRef.current = lastTimeRef.current;
    lastUiRefreshRef.current = lastTimeRef.current;

    const frame = (now: number) => {
      if (document.hidden) {
        animFrameRef.current = requestAnimationFrame(frame);
        return;
      }

      const elapsed = now - lastTimeRef.current;
      lastTimeRef.current = now;
      runtimeCarryRef.current += elapsed;
      const maxCatchUp = TICK_MS * 6 * speedRef.current;
      accumulatorRef.current = Math.min(accumulatorRef.current + elapsed * speedRef.current, maxCatchUp);

      let current = gameRef.current;
      let ticked = false;
      while (accumulatorRef.current >= TICK_MS) {
        current = advanceGame(current);
        accumulatorRef.current -= TICK_MS;
        ticked = true;
      }

      if (ticked) {
        current.stats.runtimeMs += runtimeCarryRef.current;
        runtimeCarryRef.current = 0;
        gameRef.current = current;
        const nextDerived = computeDerived(current);
        const refreshUi = now - lastUiRefreshRef.current >= UI_REFRESH_MS;
        if (refreshUi) {
          lastUiRefreshRef.current = now;
        }
        setSnapshot((prev) => ({
          ...prev,
          game: current,
          derived: nextDerived,
          uiGame: refreshUi ? current : prev.uiGame,
          uiDerived: refreshUi ? nextDerived : prev.uiDerived,
        }));

        if (now - lastSaveRef.current > SAVE_INTERVAL_MS) {
          lastSaveRef.current = now;
          saveGameState(current);
        }
      }

      animFrameRef.current = requestAnimationFrame(frame);
    };

    animFrameRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = performance.now();
      } else if (hiddenAtRef.current !== null) {
        lastTimeRef.current = performance.now();
        accumulatorRef.current = 0;
        hiddenAtRef.current = null;
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return { ...snapshot, mutateGame };
}
