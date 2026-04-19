import { useEffect, useMemo, useRef, useState } from "react";
import { advanceGame } from "@/game/advanceGame";
import { TICK_MS } from "@/game/constants";
import { createInitialGameState } from "@/game/factories";
import { computeDerived } from "@/game/selectors";

export function useGameLoop() {
  const [game, setGame] = useState(createInitialGameState);
  const gameRef = useRef(game);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = advanceGame(gameRef.current);
      gameRef.current = next;
      setGame(next);
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, []);

  const derived = useMemo(() => computeDerived(game), [game]);

  return { game, derived };
}
