import { COMBAT_TICK } from "@/game/constants";
import { COMBAT, ENEMY_CONTACT_DAMAGE, ENEMY_SPECIAL, FLUX, REWARDS, WORKER, ZAPPER } from "@/game/balance";
import { addProjectile, chooseWorkerTarget } from "@/game/factories";
import type { GameState } from "@/game/types";
import { clamp, dist, pushLog } from "@/game/utils";

const HOME_X = 500;
const HOME_Y = 540;

// How many ticks a dead enemy lingers for its fade-out animation before removal.
const DEATH_FADE_TICKS = 18;

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

  // Count kills attributed to sentinels (sentinel's current target is among the dead).
  const sentinelKillCount = state.sentinels.filter(
    (s) => s.targetId != null && killedIds.has(s.targetId)
  ).length;
  state.stats.sentinelKills += sentinelKillCount;
  let goldReward = 0;
  let energyReward = 0;

  state.stats.hostileKills += killed.length;
  state.stats.totalEnemiesKilled += killed.length;
  state.stats.purges += purged;

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
      const d = dist(agent.x, agent.y, enemy.x, enemy.y);
      if (d < ZAPPER.firingRange && d < bestDist) {
        bestDist = d;
        bestTargetId = agent.id;
        bestTargetKind = "agent";
        bestX = agent.x;
        bestY = agent.y;
      }
    }

    for (const turret of state.turrets) {
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

    const nearWorker = state.agents.some((agent) => agent.active && dist(agent.x, agent.y, enemy.x, enemy.y) < ENEMY_SPECIAL.sapper.triggerRadius);
    if (!nearWorker) continue;

    for (const agent of state.agents) {
      if (!agent.active) continue;
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
    const incoming = Math.max(attackers.length * COMBAT.minPerAttackerDamage, rawIncoming - mitigation);
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
  });
}
