import { ENEMY_SHIELD, ENEMY_SPECIAL } from "@/game/balance";
import type { Enemy } from "@/game/types";

export function isCloaked(enemy: Enemy) {
  // 3.1.0 — wardens carry permanentCloak and are invisible to
  // turret/sentinel/missile/scout targeting while roaming.
  //
  // 3.1.5 — once a warden latches onto a worker (parasite attach), it
  // uncloaks for the duration of the attach so defenses get a real window
  // to shoot it off before corruption completes. Worker retaliation during
  // attach still bypasses cloak regardless (see combat.ts).
  if (enemy.permanentCloak) {
    if (enemy.kind === "warden" && enemy.latchedWorkerId != null) return false;
    return true;
  }
  return (
    enemy.kind === "phantom" &&
    enemy.cloakTicks !== undefined &&
    enemy.cloakTicks >= ENEMY_SPECIAL.phantom.visibleTicks
  );
}

/**
 * Apply `amount` damage to an enemy, routing it through the shield first.
 * Shield damage does not spill over into HP in the same hit. Mutates
 * enemy.shield and enemy.hp in place and resets shieldRegenCooldown on any
 * hit so regen doesn't tick on the same frame as damage.
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
    // Reset regen cooldown on any hit that touches the shield.
    enemy.shieldRegenCooldown = ENEMY_SHIELD.regenDelayTicks;
    amount = 0;
  }

  if (amount > 0) {
    enemy.hp -= amount;
    // Also reset regen cooldown when raw HP is hit (shield already at 0).
    if (enemy.shieldRegenCooldown !== undefined) {
      enemy.shieldRegenCooldown = ENEMY_SHIELD.regenDelayTicks;
    }
  }
}
