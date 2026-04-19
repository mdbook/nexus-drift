import { ENEMY_SPECIAL } from "@/game/balance";
import type { Enemy } from "@/game/types";

export function isCloaked(enemy: Enemy) {
  return (
    enemy.kind === "phantom" &&
    enemy.cloakTicks !== undefined &&
    enemy.cloakTicks >= ENEMY_SPECIAL.phantom.visibleTicks
  );
}
