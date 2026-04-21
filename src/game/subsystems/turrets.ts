import { FOCUSED_BEAM, TURRET } from "@/game/balance";
import { damageEnemy, isCloaked } from "@/game/enemyUtils";
import { addMissile, addProjectile } from "@/game/factories";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";
import { dist } from "@/game/utils";

export function getTurretTargetScore(state: GameState, turret: GameState["turrets"][number], enemy: GameState["enemies"][number]) {
  const distanceScore = dist(enemy.x, enemy.y, turret.x, turret.y);
  const threatWeight =
    enemy.kind === "raider"
      ? 1.75 + state.upgrades.reactor * 0.22
      : enemy.kind === "wisp"
        ? 1.45 + state.upgrades.turret * 0.18
        : 1.1;

  return distanceScore / threatWeight + enemy.hp * 0.1;
}

export function stepTurrets(state: GameState) {
  const derived = computeDerived(state);
  state.turrets.forEach((turret, index) => {
    // 3.0.0: activeTurrets already folds in the new TURRET_SLOTS_BY_LEVEL
    // gate, so read it from derived rather than recomputing here.
    const live = index < derived.activeTurrets;
    if (!live) {
      turret.cooldown = 0;
      turret.angle += (-1.57 - turret.angle) * 0.06;
      return;
    }

    if (turret.disabledTicks > 0) {
      turret.disabledTicks -= 1;
      turret.angle += (-1.57 - turret.angle) * 0.06;
      return;
    }

    turret.range =
      (TURRET.rangeBase + state.upgrades.turret * TURRET.rangePerUpgrade + state.upgrades.reactor * TURRET.rangePerReactor) *
      state.eventModifiers.turretRangeScale;
    turret.cooldown = Math.max(0, turret.cooldown - 1);
    const target = [...state.enemies]
      .filter(
        (enemy) =>
          enemy.role !== "corruptor" &&
          !isCloaked(enemy) &&
          dist(enemy.x, enemy.y, turret.x, turret.y) <= turret.range
      )
      .sort((a, b) => getTurretTargetScore(state, turret, a) - getTurretTargetScore(state, turret, b))[0];

    if (target) {
      turret.angle = Math.atan2(target.y - turret.y, target.x - turret.x);
    } else {
      turret.angle += (-1.57 - turret.angle) * 0.06;
    }

    if (target && turret.cooldown <= 0) {
      const baseDamage =
        TURRET.damageBase +
        state.upgrades.turret * TURRET.damagePerTurret +
        state.upgrades.reactor * TURRET.damagePerReactor +
        (target.kind === "wisp" ? TURRET.damageWispBonusBase + state.upgrades.turret * TURRET.damageWispBonusPerTurret : 0) +
        (target.kind === "raider" ? TURRET.damageRaiderBonusBase + state.upgrades.reactor * TURRET.damageRaiderBonusPerReactor : 0);
      turret.cooldown = Math.max(
        TURRET.cooldownFloor,
        Math.round(
          (TURRET.cooldownBase -
            state.upgrades.turret * TURRET.cooldownPerTurret -
            state.upgrades.reactor * TURRET.cooldownPerReactor -
            Math.floor(derived.progression.tier / 2) * TURRET.cooldownPerTierPair) *
            state.eventModifiers.turretCooldownScale
        )
      );

      const d = dist(turret.x, turret.y, target.x, target.y);
      const instantRange = FOCUSED_BEAM.baseRange + state.upgrades.focusedBeam * FOCUSED_BEAM.rangePerLevel;
      const useBeam = state.upgrades.focusedBeam > 0 && d <= instantRange;

      if (useBeam) {
        addProjectile(
          state,
          turret.x,
          turret.y,
          target.x,
          target.y,
          "rgba(255, 255, 255, 0.95)",
          target.kind === "raider" ? 2.8 : 2.2,
          TURRET.projectileLife,
          "instant-beam"
        );
        damageEnemy(target, baseDamage);
        target.flash = 6;
      } else {
        const vx = (target.x - turret.x) / Math.max(1, d);
        const vy = (target.y - turret.y) / Math.max(1, d);
          addMissile(state, turret.x, turret.y, vx, vy, target.id, Math.round(baseDamage * TURRET.missileDamageBonus));
        }
      }
    });
}
