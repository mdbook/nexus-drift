import { ENEMY_SHIELD, ENEMY_SPECIAL } from "@/game/balance";
import type { Enemy } from "@/game/types";

export function isCloaked(enemy: Enemy) {
  return (
    enemy.kind === "phantom" &&
    enemy.cloakTicks !== undefined &&
    enemy.cloakTicks >= ENEMY_SPECIAL.phantom.visibleTicks
  );
}

/**
 * Apply `amount` damage to an enemy, routing it through the shield first.
 * Mutates enemy.shield and enemy.hp in place and resets shieldRegenCooldown
 * on any hit so regen doesn't tick on the same frame as damage.
 *
 * Usage:
 *   damageEnemy(enemy, 25);
 *   // enemy.shield and enemy.hp are updated in place.
 */
export function damageEnemy(enemy: Enemy, amount: number): void {
  if (amount <= 0) return;

  if (enemy.shield !== undefined && enemy.shield > 0) {
    const absorbed = Math.min(enemy.shield, amount);
    enemy.shield -= absorbed;
    amount -= absorbed;
    // Reset regen cooldown on any hit that touches the shield.
    enemy.shieldRegenCooldown = ENEMY_SHIELD.regenDelayTicks;
  }

  if (amount > 0) {
    enemy.hp -= amount;
    // Also reset regen cooldown when raw HP is hit (shield already at 0).
    if (enemy.shieldRegenCooldown !== undefined) {
      enemy.shieldRegenCooldown = ENEMY_SHIELD.regenDelayTicks;
    }
  }
}
