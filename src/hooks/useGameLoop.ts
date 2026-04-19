import { useEffect, useRef, useState } from "react";
import { advanceGame } from "@/game/advanceGame";
import { TICK_MS } from "@/game/constants";
import { createInitialGameState } from "@/game/factories";
import { computeDerived } from "@/game/selectors";
import type { DerivedState, GameState } from "@/game/types";

type Snapshot = { game: GameState; derived: DerivedState };

function snapshotFrom(game: GameState): Snapshot {
  return { game, derived: computeDerived(game) };
}

export function useGameLoop(): Snapshot {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => snapshotFrom(createInitialGameState()));
  const gameRef = useRef<GameState>(snapshot.game);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    // Cap catch-up so hidden-tab drift doesn't cause a huge burst of ticks on wake.
    const maxCatchUp = TICK_MS * 6;

    const frame = (now: number) => {
      accumulator = Math.min(accumulator + (now - lastTime), maxCatchUp);
      lastTime = now;

      let current = gameRef.current;
      let ticked = false;
      while (accumulator >= TICK_MS) {
        current = advanceGame(current);
        accumulator -= TICK_MS;
        ticked = true;
      }

      if (ticked) {
        gameRef.current = current;
        setSnapshot(snapshotFrom(current));
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return snapshot;
}
