import { ENEMY_SHIELD } from "@/game/balance";
import type { GameState } from "@/game/types";

/**
 * Ticks shield regen for enemies that carry a shield.
 * Each tick where shieldRegenCooldown is 0, the shield recovers
 * REGEN_RATE_PER_TICK HP (capped at shieldMax).
 * Each tick where shieldRegenCooldown > 0, it decrements by 1.
 *
 * Damage hits reset shieldRegenCooldown via damageEnemy() in enemyUtils.ts.
 */
export function stepEnemyShields(state: GameState) {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (
      enemy.shield === undefined ||
      enemy.shieldMax === undefined ||
      enemy.shieldRegenCooldown === undefined
    )
      continue;

    if (enemy.shieldRegenCooldown > 0) {
      enemy.shieldRegenCooldown -= 1;
    } else if (enemy.shield < enemy.shieldMax) {
      enemy.shield = Math.min(enemy.shieldMax, enemy.shield + ENEMY_SHIELD.regenRatePerTick);
    }
  }
}
