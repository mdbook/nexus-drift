import { COMBAT_TICK } from "@/game/constants";
import { COMBAT, ENEMY_CONTACT_DAMAGE, REWARDS, WORKER } from "@/game/balance";
import { chooseWorkerTarget } from "@/game/factories";
import type { GameState } from "@/game/types";
import { clamp, dist, pushLog } from "@/game/utils";

export function resolveEnemyDeaths(state: GameState) {
  const killed = state.enemies.filter((enemy) => enemy.hp <= 0);
  if (!killed.length) return;

  const purged = killed.filter((enemy) => enemy.role === "corruptor").length;
  const regular = killed.length - purged;
  const killedIds = new Set(killed.map((enemy) => enemy.id));

  state.stats.hostileKills += killed.length;
  state.stats.purges += purged;
  state.resources.gold += regular * (REWARDS.goldPerKillBase + state.upgrades.turret * REWARDS.goldPerKillPerTurret) + purged * (REWARDS.goldPerPurgeBase + state.upgrades.scout * REWARDS.goldPerPurgePerScout);
  state.resources.energy +=
    regular * (REWARDS.energyPerKillBase + state.upgrades.shield * REWARDS.energyPerKillPerShield) + purged * (REWARDS.energyPerPurgeBase + state.upgrades.arsenal * REWARDS.energyPerPurgePerArsenal);

  state.nodes.forEach((node) => {
    if (node.corruptedBy != null && killedIds.has(node.corruptedBy)) {
      node.corruptedBy = null;
    }
  });

  if (regular > 0 && purged > 0) {
    state.log = pushLog(
      state.log,
      `Defense grid cleared ${regular} hostile${regular > 1 ? "s" : ""}; scouts purged ${purged} corrupter${purged > 1 ? "s" : ""}.`
    );
  } else if (purged > 0) {
    state.log = pushLog(state.log, `Assault scouts purged ${purged} toxic corrupter${purged > 1 ? "s" : ""}.`);
  } else {
    state.log = pushLog(state.log, `Defense grid cleared ${regular} hostile${regular > 1 ? "s" : ""}.`);
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}

export function stepCombat(state: GameState) {
  if (state.timers.tick % COMBAT_TICK !== 0) return;

  state.agents.forEach((agent) => {
    const attackers = state.enemies.filter(
      (enemy) => enemy.role !== "corruptor" && dist(enemy.x, enemy.y, agent.x, agent.y) < COMBAT.detectionRadius
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
      state.log = pushLog(state.log, `${agent.kind} drone taking heavy fire.`);
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
      agent.target = chooseWorkerTarget(state, agent);
      agent.task = "Rebooting";
      state.log = pushLog(state.log, `${agent.kind} drone restored from backup shell.`);
      return;
    }

    agent.hp = nextHp;
    agent.panic = clamp(agent.panic + WORKER.panicDelta.damagedBurst, 0, 100);
    agent.damageTicks = WORKER.combatDamageTicks;
  });
}
