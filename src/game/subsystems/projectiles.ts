import type { GameState } from "@/game/types";

export function stepProjectiles(state: GameState) {
  state.projectiles = state.projectiles
    .map((projectile) => ({ ...projectile, life: projectile.life - 1 }))
    .filter((projectile) => projectile.life > 0);
}
