import { FOCUSED_BEAM, TURRET, TURRET_HP } from "@/game/balance";
import { damageEnemy, isCloaked } from "@/game/enemyUtils";
import { addProjectile } from "@/game/factories";
import { computeDerived } from "@/game/selectors";
import type { GameState } from "@/game/types";
import { dist } from "@/game/utils";

// 3.0.0 Step 8: turret coordination uses the worker-pad line, not the city
// damage centroid. The city/combat systems anchor structural hits at y=540,
// while this bonus asks whether a worker is being chased near the defensive
// turret line at y=490.
const HOME_X = 500;
const TURRET_LINE_Y = 490;
const TURRET_COORD_RADIUS = 200;  // px from home centre that qualifies a worker as "near home"
const TURRET_COORD_BONUS  = 60;   // score reduction (lower = higher priority)

export function getTurretTargetScore(state: GameState, turret: GameState["turrets"][number], enemy: GameState["enemies"][number]) {
  const distanceScore = dist(enemy.x, enemy.y, turret.x, turret.y);
  const threatWeight =
    enemy.kind === "raider"
      ? 1.75 + state.upgrades.reactor * 0.22
      : enemy.kind === "wisp"
        ? 1.45 + state.upgrades.turret * 0.18
        : 1.1;

  let score = distanceScore / threatWeight + enemy.hp * 0.1;

  // Coordination bonus: prioritize enemies that are actively chasing workers
  // near the home district. A brute marching toward a miner close to the pad
  // outranks a brute drifting at max range, even if the latter is closer to
  // this turret.
  if (enemy.targetKind === "agent" && enemy.targetId !== null) {
    const victim = state.agents.find((a) => a.id === enemy.targetId && a.active);
    if (victim && Math.hypot(victim.x - HOME_X, victim.y - TURRET_LINE_Y) < TURRET_COORD_RADIUS) {
      score -= TURRET_COORD_BONUS;
    }
  }

  return score;
}

export function stepTurrets(state: GameState) {
  const derived = computeDerived(state);
  state.turrets.forEach((turret, index) => {
    // 3.0.0: recompute maxHp from current upgrades every tick so shield/turret
    // ranks buff structural HP live. We scale current hp proportionally so a
    // mid-combat upgrade doesn't reset damage progress, and clamp to the new
    // ceiling so downgrades (never happens today, future-proofing) stay sane.
    const nextMaxHp =
      TURRET_HP.hpBase +
      state.upgrades.turret * TURRET_HP.hpPerTurretUpgrade +
      state.upgrades.shield * TURRET_HP.hpPerShieldUpgrade;
    if (turret.maxHp !== nextMaxHp && turret.maxHp > 0) {
      const ratio = turret.hp / turret.maxHp;
      turret.hp = nextMaxHp * ratio;
    }
    turret.maxHp = nextMaxHp;
    turret.hp = Math.min(turret.hp, turret.maxHp);

    if (turret.damageTicks > 0) turret.damageTicks -= 1;

    // 3.0.0: activeTurrets already folds in the new TURRET_SLOTS_BY_LEVEL
    // gate, so read it from derived rather than recomputing here.
    const live = index < derived.activeTurrets;
    if (!live) {
      turret.cooldown = 0;
      turret.angle += (-1.57 - turret.angle) * 0.06;
      return;
    }

    if (turret.brokenTicks > 0) {
      turret.brokenTicks -= 1;
      turret.cooldown = 0;
      turret.angle += (-1.57 - turret.angle) * 0.06;
      if (turret.brokenTicks === 0) {
        // Partial restore so chained breaks stay punishing without becoming
        // unrecoverable — re-engages the HP pool at half ceiling.
        turret.hp = turret.maxHp * TURRET_HP.brokenRecoverRatio;
      }
      return;
    }

    if (turret.disabledTicks > 0) {
      turret.disabledTicks -= 1;
      turret.angle += (-1.57 - turret.angle) * 0.06;
      return;
    }

    // 3.0.0 Step 5: focusedBeam now extends acquisition range directly.
    // Turrets always fire instant-hit beams; missiles are silo-only.
    turret.range =
      (TURRET.rangeBase +
        state.upgrades.turret * TURRET.rangePerUpgrade +
        state.upgrades.reactor * TURRET.rangePerReactor +
        state.upgrades.focusedBeam * FOCUSED_BEAM.rangePerLevel) *
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

      // 3.0.0 Step 5: turrets always fire instant-hit beams. Missile
      // capability is now exclusively in the missile silo subsystem.
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
    }
  });
}
