import { COMBAT_TICK } from "@/game/constants";
import {
  CITY_HP,
  COMBAT,
  ENEMY_CONTACT_DAMAGE,
  ENEMY_CONTACT_RADIUS,
  ENEMY_SPECIAL,
  FLUX,
  REWARDS,
  SCOUT_HP,
  SENTINEL_HP,
  TARGET_ARMOR,
  TURRET_HP,
  WORKER,
  WORKER_ABILITIES,
  ZAPPER,
} from "@/game/balance";
import { addProjectile } from "@/game/factories";
import { damageEnemy } from "@/game/enemyUtils";
import { chooseWorkerTarget } from "@/game/ai/workerTargeting";
import { computeDerived } from "@/game/selectors";
import type { Agent, GameState, Scout, Sentinel, Turret } from "@/game/types";
import { clamp, dist, pushLog } from "@/game/utils";

const HOME_X = 500;
const HOME_Y = 540;

// How many ticks a dead enemy lingers for its fade-out animation before removal.
const DEATH_FADE_TICKS = 18;

/**
 * 3.0.0 — structural damage funnel for turrets.
 *
 * Mirrors damageEnemy's "single entry point" pattern: all places that deal
 * damage to a turret (enemy contact in stepCombat, future missile splash,
 * etc.) should route through this helper so the break-state + damage-flash
 * bookkeeping stays consistent. While brokenTicks > 0 the turret is already
 * offline, so extra hits do nothing (no stacking break timers).
 */
export function damageTurret(state: GameState, turret: Turret, amount: number) {
  if (amount <= 0) return;
  if (turret.brokenTicks > 0) return;

  turret.hp = Math.max(0, turret.hp - amount);
  turret.damageTicks = TURRET_HP.damageFlashTicks;

  if (turret.hp <= 0) {
    turret.brokenTicks = TURRET_HP.brokenDurationTicks;
    turret.cooldown = 0;
    state.stats.turretsBroken += 1;
    state.log = pushLog(state.log, "Turret structure failed. Recalibrating.", "combat", state.timers.tick);
  }
}

/**
 * 3.0.0 — damage funnel for scouts.
 *
 * Scouts now carry an HP pool. Damage sets the hit-flash and, on reaching 0,
 * knocks the scout offline for SCOUT_HP.rebootDurationTicks; stepScouts
 * handles the timer and respawn at the home pad. Damage landed while
 * rebooting is a no-op. Scouts below the retreat threshold do not take
 * additional structural hits while they're already retreating — they still
 * take the hit flash, but we never double-count them into reboot.
 */
export function damageScout(state: GameState, scout: Scout, amount: number) {
  if (amount <= 0) return;
  if (scout.rebootTicks > 0) return;

  scout.hp = Math.max(0, scout.hp - amount);
  scout.damageTicks = SCOUT_HP.damageFlashTicks;

  if (scout.hp <= 0) {
    scout.rebootTicks = SCOUT_HP.rebootDurationTicks;
    scout.retreating = false;
    scout.targetId = null;
    state.log = pushLog(state.log, "Scout destroyed. Rebuilding at home pad.", "combat", state.timers.tick);
  }
}

/**
 * 3.0.0 — damage funnel for sentinels.
 *
 * Same shape as damageTurret / damageScout. Sentinels are heavily armored,
 * but the armor multiplier is applied on the stepCombat call side (Step 4)
 * rather than here so the funnel stays a single source of truth. Damage
 * while rebooting is a no-op.
 */
export function damageSentinel(state: GameState, sentinel: Sentinel, amount: number) {
  if (amount <= 0) return;
  if (sentinel.rebootTicks > 0) return;

  sentinel.hp = Math.max(0, sentinel.hp - amount);
  sentinel.damageTicks = SENTINEL_HP.damageFlashTicks;

  if (sentinel.hp <= 0) {
    sentinel.rebootTicks = SENTINEL_HP.rebootDurationTicks;
    sentinel.retreating = false;
    sentinel.targetId = null;
    state.log = pushLog(state.log, "Sentinel downed. Rebuilding chassis.", "combat", state.timers.tick);
  }
}

/**
 * 3.0.0 — damage funnel for the home district.
 *
 * Mirrors the entity damage helpers but operates on `state.city` rather than
 * a list entry. Sets `damageTicks` for the visual flash, updates
 * `lastHostileTick` to gate regen (stepCity checks `tick - lastHostileTick`
 * against CITY_HP.regenIdleTicks), and clamps hp at 0. The city never
 * "reboots" — its HP stays at 0 until regen gradually lifts it back.
 */
export function damageCity(state: GameState, amount: number) {
  if (amount <= 0) return;

  state.city.hp = Math.max(0, state.city.hp - amount);
  state.city.damageTicks = CITY_HP.damageFlashTicks;
  state.city.lastHostileTick = state.timers.tick;
}

/**
 * Cleanse damage funnel for corrupted workers.
 *
 * Corrupted workers are immune to regular enemy contact and only sentinel
 * cleanse beams should reduce their HP. Keeping that damage path here gives
 * cleanse hits the same clamp + flash bookkeeping as other combat funnels.
 */
export function damageCorruptedWorker(worker: Agent, amount: number) {
  if (amount <= 0) return;
  if (!worker.corrupted || worker.rebootTicks > 0) return;

  worker.hp = Math.max(0, worker.hp - amount);
  worker.damageTicks = WORKER.combatDamageTicks;
}

export function resolveEnemyDeaths(state: GameState) {
  // Find newly killed enemies (hp ≤ 0 but not yet started dying).
  const killed = state.enemies.filter((enemy) => enemy.hp <= 0 && enemy.dyingTicks === 0);

  // Start the death fade-out countdown for newly killed enemies. They remain
  // in state but are skipped by all sim logic (movement, targeting, combat
  // checks already guard on hp > 0).
  for (const enemy of killed) {
    enemy.dyingTicks = DEATH_FADE_TICKS;
  }

  // Tick down already-dying enemies and remove fully faded ones.
  for (const enemy of state.enemies) {
    if (enemy.dyingTicks > 0) enemy.dyingTicks -= 1;
  }
  state.enemies = state.enemies.filter((enemy) => !(enemy.hp <= 0 && enemy.dyingTicks <= 0));

  if (!killed.length) return;

  const purged = killed.filter((enemy) => enemy.role === "corruptor").length;
  const regular = killed.length - purged;
  const killedIds = new Set(killed.map((enemy) => enemy.id));

  let goldReward = 0;
  let energyReward = 0;

  state.stats.hostileKills += killed.length;
  state.stats.totalEnemiesKilled += killed.length;

  killed.forEach((enemy) => {
    if (enemy.role !== "corruptor") {
      state.agents.forEach((agent) => {
        if (!agent.active) return;
        if (dist(agent.x, agent.y, enemy.x, enemy.y) < 120) {
          agent.killsNearby += 1;
        }
      });
    }

    if (enemy.role === "corruptor") {
      goldReward += REWARDS.goldPerPurgeBase + state.upgrades.scout * REWARDS.goldPerPurgePerScout;
      energyReward += REWARDS.energyPerPurgeBase + state.upgrades.arsenal * REWARDS.energyPerPurgePerArsenal;
      const fluxReward = enemy.kind === "blight" ? FLUX.blightKillReward : FLUX.corruptorKillReward;
      const fluxMultiplier = state.eventModifiers.fluxPurgeMultiplier ?? 1;
      state.resources.flux = Math.min(
        FLUX.softCap + FLUX.overCapBuffer,
        state.resources.flux + fluxReward * fluxMultiplier
      );
    } else {
      const rewardBonus = enemy.goldRewardBonus ?? 1;
      goldReward +=
        (REWARDS.goldPerKillBase + state.upgrades.turret * REWARDS.goldPerKillPerTurret) * rewardBonus;
      energyReward +=
        (REWARDS.energyPerKillBase + state.upgrades.shield * REWARDS.energyPerKillPerShield) * rewardBonus;
    }

    if (enemy.kind === "brute") {
      state.stats.brutesKilled += 1;
    }
    if (enemy.kind === "phantom") {
      state.stats.phantomsKilled += 1;
    }
    if (enemy.kind === "leech") {
      state.stats.leechesKilled += 1;
    }
    if (enemy.kind === "sapper") {
      state.stats.sappersKilled += 1;
    }
    if (enemy.kind === "warden") {
      state.stats.wardensKilled += 1;
    }

    const coreDrop =
      enemy.coreDropOverride ??
      (enemy.kind === "brute" || enemy.kind === "phantom" ? ENEMY_SPECIAL.brute.coreDropAmount : 0);
    if (coreDrop > 0) {
      state.resources.cores += coreDrop;
      state.log = pushLog(
        state.log,
        enemy.kind === "brute"
          ? "Brute destroyed. Core fragment recovered."
          : "Phantom dispersed. Core fragment stabilized.",
        "combat",
        state.timers.tick
      );
    }
  });

  state.resources.gold += goldReward;
  state.resources.energy += energyReward;

  // Clear corruptedBy references for newly-killed enemies.
  state.nodes.forEach((node) => {
    if (node.corruptedBy != null && killedIds.has(node.corruptedBy)) {
      node.corruptedBy = null;
    }
  });

  if (regular > 0 && purged > 0) {
    state.log = pushLog(
      state.log,
      `Defense grid cleared ${regular} hostile${regular > 1 ? "s" : ""}; scouts purged ${purged} corrupter${purged > 1 ? "s" : ""}.`,
      "combat",
      state.timers.tick
    );
  } else if (purged > 0) {
    state.log = pushLog(state.log, `Assault scouts purged ${purged} toxic corrupter${purged > 1 ? "s" : ""}.`, "combat", state.timers.tick);
  } else {
    state.log = pushLog(state.log, `Defense grid cleared ${regular} hostile${regular > 1 ? "s" : ""}.`, "combat", state.timers.tick);
  }

}

export function stepZapperFire(state: GameState) {
  const derived = computeDerived(state);
  for (const enemy of state.enemies) {
    if (enemy.kind !== "zapper" || enemy.hp <= 0) continue;
    if (enemy.fireCooldown === undefined) enemy.fireCooldown = 0;
    if (enemy.fireCooldown > 0) { enemy.fireCooldown -= 1; continue; }

    // Find the nearest eligible target: workers + live turrets within firing range.
    let bestDist = Infinity;
    let bestTargetId: number | null = null;
    let bestTargetKind: "agent" | "turret" = "agent";
    let bestX = 0;
    let bestY = 0;

    for (const agent of state.agents) {
      if (!agent.active) continue;
      if (agent.corrupted || agent.rebootTicks > 0) continue;
      const d = dist(agent.x, agent.y, enemy.x, enemy.y);
      if (d < ZAPPER.firingRange && d < bestDist) {
        bestDist = d;
        bestTargetId = agent.id;
        bestTargetKind = "agent";
        bestX = agent.x;
        bestY = agent.y;
      }
    }

    for (const turret of state.turrets.slice(0, derived.activeTurrets)) {
      const d = dist(turret.x, turret.y, enemy.x, enemy.y);
      if (d < ZAPPER.firingRange && d < bestDist) {
        bestDist = d;
        bestTargetId = turret.id;
        bestTargetKind = "turret";
        bestX = turret.x;
        bestY = turret.y;
      }
    }

    if (bestTargetId === null) continue;

    addProjectile(
      state,
      enemy.x, enemy.y,
      bestX, bestY,
      ZAPPER.boltColor,
      ZAPPER.boltWidth,
      ZAPPER.boltLifeTicks,
      "zapper-bolt",
      bestTargetId,
      bestTargetKind
    );

    enemy.fireCooldown = ZAPPER.fireIntervalTicks;
    state.log = pushLog(state.log, "Zapper fired a disruptor bolt.", "combat", state.timers.tick);
  }
}

export function stepCombat(state: GameState) {
  if (state.timers.tick % COMBAT_TICK !== 0) return;

  for (const enemy of state.enemies) {
    if (enemy.kind !== "sapper" || enemy.hp <= 0) continue;

    const nearWorker = state.agents.some(
      (agent) =>
        agent.active &&
        !agent.corrupted &&
        agent.rebootTicks <= 0 &&
        dist(agent.x, agent.y, enemy.x, enemy.y) < ENEMY_SPECIAL.sapper.triggerRadius
    );
    if (!nearWorker) continue;

    for (const agent of state.agents) {
      if (!agent.active) continue;
      if (agent.corrupted || agent.rebootTicks > 0) continue;
      if (dist(agent.x, agent.y, enemy.x, enemy.y) < ENEMY_SPECIAL.sapper.explosionRadius) {
        agent.hp -= ENEMY_SPECIAL.sapper.explosionDamage;
        agent.damageTicks = WORKER.combatDamageTicks;
      }
    }

    enemy.hp = 0;
    state.log = pushLog(state.log, "Sapper detonated near workers.", "combat", state.timers.tick);
  }

  for (const enemy of state.enemies) {
    if (
      enemy.kind === "leech" &&
      enemy.hp > 0 &&
      dist(enemy.x, enemy.y, HOME_X, HOME_Y) < ENEMY_SPECIAL.leech.drainRadius
    ) {
      state.resources.gold = Math.max(0, state.resources.gold - ENEMY_SPECIAL.leech.goldDrainPerTick);
      state.resources.energy = Math.max(0, state.resources.energy - ENEMY_SPECIAL.leech.energyDrainPerTick);
    }
  }

  state.agents.forEach((agent) => {
    if (!agent.active) return;
    // 3.0.0 Step 7: corrupted workers are immune to enemy contact damage.
    // Only sentinel cleanse attacks (in stepSentinels) can reduce their HP.
    if (agent.corrupted || agent.rebootTicks > 0) return;
    const attackers = state.enemies.filter(
      (enemy) =>
        enemy.hp > 0 &&
        enemy.role !== "corruptor" &&
        dist(enemy.x, enemy.y, agent.x, agent.y) < COMBAT.detectionRadius
    );

    if (!attackers.length) return;

    const rawIncoming = attackers.reduce((sum, enemy) => sum + ENEMY_CONTACT_DAMAGE[enemy.kind], 0);
    const mitigation = attackers.reduce((sum, enemy) => {
      const baseline = state.upgrades.shield * COMBAT.mitigation.baselineShield + state.upgrades.turret * COMBAT.mitigation.baselineTurret;
      const counterMitigation =
        enemy.kind === "mite"
          ? state.upgrades.shield * COMBAT.mitigation.miteShield
          : enemy.kind === "wisp"
            ? state.upgrades.turret * COMBAT.mitigation.wispTurret + state.upgrades.shield * COMBAT.mitigation.wispShield
            : state.upgrades.reactor * COMBAT.mitigation.raiderReactor + state.upgrades.shield * COMBAT.mitigation.raiderShield;

      return sum + baseline + counterMitigation;
    }, 0);
    const surroundBonus = Math.max(0, attackers.length - 1) * COMBAT.surroundBonusPerAttacker;
    const incoming = Math.max(attackers.length * COMBAT.minPerAttackerDamage, rawIncoming - mitigation) * (1 + surroundBonus);
    const blocked = Math.max(0, rawIncoming - incoming);
    state.stats.blocked += blocked;

    const nextHp = clamp(agent.hp - incoming, 0, agent.maxHp);
    if (nextHp <= WORKER.heavyFireThreshold && agent.hp > WORKER.heavyFireThreshold) {
      state.log = pushLog(state.log, `${agent.kind} drone taking heavy fire.`, "combat", state.timers.tick);
    }

    if (nextHp <= 0) {
      agent.x = state.rng.range(agent.homeX - 18, agent.homeX + 18);
      agent.y = state.rng.range(agent.homeY - 18, agent.homeY + 18);
      agent.tx = agent.homeX;
      agent.ty = agent.homeY;
      agent.hp = clamp(agent.maxHp * (WORKER.respawn.hpBase + state.upgrades.shield * WORKER.respawn.hpShieldBonus), WORKER.respawn.hpMin, agent.maxHp);
      agent.panic = WORKER.respawn.panic;
      agent.evadeTicks = WORKER.respawn.evadeTicks;
      agent.evadeDx = 0;
      agent.evadeDy = -1;
      agent.damageTicks = WORKER.respawn.damageTicks;
      agent.disabledTicks = 0;
      agent.spawnTick = state.timers.tick;
      agent.target = chooseWorkerTarget(state, agent);
      agent.task = "Rebooting";
      state.log = pushLog(state.log, `${agent.kind} drone restored from backup shell.`, "combat", state.timers.tick);
      return;
    }

    agent.hp = nextHp;
    agent.panic = clamp(agent.panic + WORKER.panicDelta.damagedBurst, 0, 100);
    agent.damageTicks = WORKER.combatDamageTicks;

    // 3.0.0 Step 6 — Worker self-defense retaliation.
    //
    // Workers that can still fight back deal a small counter-hit to each
    // attacker in the contact cluster. Retaliation is suppressed when the
    // worker is recovering (very low HP), disabled, or corrupted (Step 7 —
    // corrupted workers cannot defend themselves against anything but sentinels).
    const isRecovering = nextHp < agent.maxHp * WORKER.recoveryHpThreshold;
    if (!isRecovering && agent.disabledTicks === 0 && !agent.corrupted) {
      const retDamage = WORKER_ABILITIES.retaliateBase + state.upgrades.bot * WORKER_ABILITIES.retaliatePerBot;
      for (const attacker of attackers) {
        damageEnemy(attacker, retDamage);
      }
    }
  });

  // 3.0.0 Step 4 — non-worker contact damage.
  //
  // Enemies whose targetKind points at a turret/scout/sentinel/city deal
  // contact damage to that structure when they're inside ENEMY_CONTACT_RADIUS.
  // Raw damage is scaled by the target-class armor constant so one set of
  // armor dials ("this is a turret") covers every attacker. The damage
  // itself routes through the existing damageTurret/Scout/Sentinel/City
  // funnels so break / reboot / hostile-tick bookkeeping stays centralized.
  const derived = computeDerived(state);
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.role !== "combat") continue;
    const contactDamage = ENEMY_CONTACT_DAMAGE[enemy.kind];
    if (contactDamage <= 0) continue;

    if (enemy.targetKind === "turret" && enemy.targetId != null) {
      const turretIndex = state.turrets.findIndex((t) => t.id === enemy.targetId);
      if (turretIndex < 0 || turretIndex >= derived.activeTurrets) continue;
      const turret = state.turrets[turretIndex];
      if (!turret) continue;
      if (dist(enemy.x, enemy.y, turret.x, turret.y) > ENEMY_CONTACT_RADIUS.turret) continue;
      damageTurret(state, turret, contactDamage * TARGET_ARMOR.turretArmor);
    } else if (enemy.targetKind === "scout" && enemy.targetId != null) {
      const scoutIndex = state.scouts.findIndex((s) => s.id === enemy.targetId);
      if (scoutIndex < 0 || scoutIndex >= derived.activeScouts) continue;
      const scout = state.scouts[scoutIndex];
      if (!scout) continue;
      if (scout.rebootTicks > 0) continue;
      if (dist(enemy.x, enemy.y, scout.x, scout.y) > ENEMY_CONTACT_RADIUS.scout) continue;
      damageScout(state, scout, contactDamage * TARGET_ARMOR.scoutArmor);
    } else if (enemy.targetKind === "sentinel" && enemy.targetId != null) {
      const sentinelIndex = state.sentinels.findIndex((s) => s.id === enemy.targetId);
      if (sentinelIndex < 0 || sentinelIndex >= derived.activeSentinels) continue;
      const sentinel = state.sentinels[sentinelIndex];
      if (!sentinel) continue;
      if (sentinel.rebootTicks > 0) continue;
      if (dist(enemy.x, enemy.y, sentinel.x, sentinel.y) > ENEMY_CONTACT_RADIUS.sentinel) continue;
      damageSentinel(state, sentinel, contactDamage * TARGET_ARMOR.sentinelArmor);
    } else if (enemy.targetKind === "city") {
      if (dist(enemy.x, enemy.y, HOME_X, HOME_Y) > ENEMY_CONTACT_RADIUS.city) continue;
      damageCity(state, contactDamage * TARGET_ARMOR.cityArmor);
    }
  }
}
