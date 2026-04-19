import {
  AUTO_TICK,
  COMBAT_TICK,
  EVADE_BONUS_PER_THREAT,
  EVADE_ENTER_RADIUS,
  EVADE_EXIT_RADIUS,
  EVADE_PERSIST_TICKS,
  EVENT_TICK,
  MINING_TICK,
  TICK_MS,
  TICK_WRAP,
  WORK_TASKS,
  WORLD_H,
  WORLD_W,
} from "@/game/constants";
import { upgradeDefs } from "@/game/data";
import { addProjectile, chooseWorkerTarget, cloneGameState, makeNode, spawnEnemy } from "@/game/factories";
import { computeDerived } from "@/game/selectors";
import type { DerivedState, GameState, UpgradeKey } from "@/game/types";
import { chance, clamp, dist, nextUpgradeCost, normalize, pick, pushLog, rand } from "@/game/utils";

function stepEconomy(state: GameState) {
  const derived = computeDerived(state);

  (Object.keys(state.resources) as Array<keyof GameState["resources"]>).forEach((key) => {
    state.resources[key] += derived.rates[key] * (TICK_MS / 1000);
  });

  state.xp +=
    (0.6 +
      state.upgrades.reactor * 0.08 +
      state.prestige * 0.05 +
      state.upgrades.turret * 0.015 +
      state.upgrades.scout * 0.018) *
    (TICK_MS / 1000) *
    12;

  while (state.xp >= 80 + state.level * 25) {
    state.xp -= 80 + state.level * 25;
    state.level += 1;
    state.combo = clamp(state.combo + 0.15, 1, 9.9);
    state.log = pushLog(state.log, `Sector level up -> ${state.level}`);
  }
}

function stepSpawns(state: GameState) {
  const spawnThreshold = Math.max(80, 220 - state.level * 2 - state.upgrades.bot * 6);
  if (state.timers.enemy < spawnThreshold) return;

  state.timers.enemy = 0;
  if (state.enemies.length > 10 + state.upgrades.turret + state.upgrades.scout) return;

  const wave = Math.floor(state.level / 3) + state.prestige;
  const corruptibleNodes = state.nodes.filter((node) => node.kind !== "gold");
  const existingCorruptors = state.enemies.filter((enemy) => enemy.role === "corruptor").length;
  const shouldSpawnCorruptor =
    corruptibleNodes.length > 0 &&
    state.level >= 3 &&
    existingCorruptors < Math.max(1, Math.ceil(state.level / 8)) &&
    chance(clamp(0.2 + state.level * 0.004, 0.2, 0.45));

  if (shouldSpawnCorruptor) {
    state.enemies.push(spawnEnemy(state.nextEnemyId++, wave, "corruptor"));
    state.log = pushLog(state.log, "Toxic corrupter drifting toward resource lanes.");
    return;
  }

  const count = chance(0.22 + state.level * 0.003) ? 2 : 1;
  for (let index = 0; index < count; index += 1) {
    state.enemies.push(spawnEnemy(state.nextEnemyId++, wave));
  }
  state.log = pushLog(state.log, "Hostile contact detected on perimeter.");
}

function stepWorkers(state: GameState) {
  if (!state.nodes.length) return;
  const combatEnemies = state.enemies.filter((enemy) => enemy.role !== "corruptor");

  state.agents.forEach((agent, index) => {
    const needsTarget =
      agent.target == null ||
      !state.nodes.some((node) => node.id === agent.target) ||
      state.timers.tick % (210 + index * 30) === 0;

    if (needsTarget) {
      agent.target = chooseWorkerTarget(state, agent, index);
    }

    const node =
      state.nodes.find((candidate) => candidate.id === agent.target) ??
      state.nodes[index % state.nodes.length];

    const threatRadius = agent.evadeTicks > 0 ? EVADE_EXIT_RADIUS : EVADE_ENTER_RADIUS;
    const evadeThreats = combatEnemies
      .map((enemy) => {
        const d = dist(enemy.x, enemy.y, agent.x, agent.y);
        return d < threatRadius ? { enemy, d } : null;
      })
      .filter(Boolean) as Array<{ enemy: GameState["enemies"][number]; d: number }>;

    if (evadeThreats.length > 0) {
      let vx = 0;
      let vy = 0;

      evadeThreats.forEach(({ enemy, d }) => {
        const dx = agent.x - enemy.x;
        const dy = agent.y - enemy.y;
        const weight = 1 / Math.max(36, d * d);
        vx += dx * weight;
        vy += dy * weight;
      });

      const nextDirection = normalize(vx, vy, agent.evadeDx, agent.evadeDy);
      const blendedDirection = normalize(
        agent.evadeDx * 0.45 + nextDirection.x * 0.55,
        agent.evadeDy * 0.45 + nextDirection.y * 0.55,
        nextDirection.x,
        nextDirection.y
      );

      agent.evadeDx = blendedDirection.x;
      agent.evadeDy = blendedDirection.y;
      agent.evadeTicks = Math.max(
        agent.evadeTicks,
        EVADE_PERSIST_TICKS + Math.max(0, evadeThreats.length - 1) * EVADE_BONUS_PER_THREAT
      );
    } else if (agent.evadeTicks > 0) {
      agent.evadeTicks -= 1;
    }

    if (agent.evadeTicks > 0) {
      const evadeSpeed = agent.speed * (1.1 + Math.min(0.18, agent.panic / 180));
      agent.x = clamp(agent.x + agent.evadeDx * evadeSpeed, 20, WORLD_W - 20);
      agent.y = clamp(agent.y + agent.evadeDy * evadeSpeed, 50, WORLD_H - 32);
      agent.tx = clamp(agent.x + agent.evadeDx * 84, 20, WORLD_W - 20);
      agent.ty = clamp(agent.y + agent.evadeDy * 84, 50, WORLD_H - 32);
      agent.swing = 0;
      agent.task = "Evading";
      agent.panic = clamp(agent.panic + (evadeThreats.length > 0 ? 1.8 : 0.75), 0, 100);
      agent.hp = clamp(agent.hp + 0.006 + state.upgrades.shield * 0.004, 0, agent.maxHp);
      agent.damageTicks = Math.max(0, agent.damageTicks - 1);
      return;
    }

    const recovering = agent.damageTicks > 0 && agent.hp < agent.maxHp * 0.6;
    const destination = recovering ? { x: agent.homeX, y: agent.homeY, size: 18, corrupted: false } : node;

    const dx = destination.x - agent.x;
    const dy = destination.y - agent.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const workRadius = recovering ? 22 : clamp(destination.size * 0.45, 16, 24);

    if (d <= workRadius) {
      agent.tx = destination.x;
      agent.ty = destination.y;
      agent.swing = recovering ? 0 : (agent.swing + 1) % 24;
      agent.task = recovering
        ? "Recovering"
        : destination.corrupted
          ? "Purging residue"
          : WORK_TASKS[agent.kind] ?? "Working";
      agent.panic = clamp(agent.panic - (recovering ? 3.2 : 2.1), 0, 100);
      agent.hp = clamp(
        agent.hp + (recovering ? 0.08 : 0.028) + state.upgrades.shield * (recovering ? 0.015 : 0.01),
        0,
        agent.maxHp
      );
      agent.damageTicks = Math.max(0, agent.damageTicks - 1);
      return;
    }

    const speedMultiplier = recovering ? 0.66 : agent.damageTicks > 0 ? 0.66 : 0.74;
    agent.x += (dx / d) * agent.speed * speedMultiplier;
    agent.y += (dy / d) * agent.speed * speedMultiplier;
    agent.tx = destination.x;
    agent.ty = destination.y;
    agent.swing = 0;
    agent.task = recovering ? "Recovering" : "Traversing";
    agent.panic = clamp(agent.panic - (recovering ? 1.8 : 1.2), 0, 100);
    agent.hp = clamp(agent.hp + 0.014 + state.upgrades.shield * 0.006, 0, agent.maxHp);
    agent.damageTicks = Math.max(0, agent.damageTicks - 1);
  });
}

function stepEnemies(state: GameState) {
  state.enemies.forEach((enemy) => {
    enemy.flash = Math.max(0, enemy.flash - 1);

    if (enemy.role === "corruptor") {
      const targetableNodes = state.nodes.filter((node) => node.kind !== "gold");
      const currentNode = targetableNodes.find((node) => node.id === enemy.targetNodeId);
      const shouldRetarget =
        !currentNode ||
        (currentNode.corruption >= 100 &&
          targetableNodes.some((node) => node.id !== currentNode.id && node.corruption < 95));

      const preferredNode =
        (!shouldRetarget && currentNode) ||
        [...targetableNodes].sort((a, b) => {
          const corruptionDelta = a.corruption - b.corruption;
          if (corruptionDelta !== 0) return corruptionDelta;
          return dist(a.x, a.y, enemy.x, enemy.y) - dist(b.x, b.y, enemy.x, enemy.y);
        })[0];

      if (!preferredNode) return;

      enemy.targetNodeId = preferredNode.id;
      const dx = preferredNode.x - enemy.x;
      const dy = preferredNode.y - enemy.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const contactRadius = preferredNode.size + 8;

      if (d <= contactRadius) {
        enemy.corruptTicks += 1;
        preferredNode.corruption = clamp(preferredNode.corruption + 0.65 + state.level * 0.01, 0, 100);
        preferredNode.corruptedBy = enemy.id;
        enemy.x += Math.cos((state.timers.tick + enemy.id * 11) / 12) * 0.12;
        enemy.y += Math.sin((state.timers.tick + enemy.id * 7) / 12) * 0.12;

        if (preferredNode.corruption >= 100 && !preferredNode.corrupted) {
          preferredNode.corrupted = true;
          state.stats.corruptions += 1;
          state.log = pushLog(state.log, `${preferredNode.kind} node fully corrupted. Gross.`);
        }
        return;
      }

      enemy.x += (dx / d) * enemy.speed * 0.56;
      enemy.y += (dy / d) * enemy.speed * 0.56;
      return;
    }

    const target = [...state.agents].sort(
      (a, b) => dist(a.x, a.y, enemy.x, enemy.y) - dist(b.x, b.y, enemy.x, enemy.y)
    )[0];

    if (!target) return;

    enemy.targetId = target.id;
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const d = Math.max(1, Math.hypot(dx, dy));

    if (d > 18) {
      enemy.x += (dx / d) * enemy.speed * 0.561;
      enemy.y += (dy / d) * enemy.speed * 0.561;
      const strafe = Math.sin((state.timers.tick + enemy.id * 13) / 14) * 0.18;
      enemy.x += (-dy / d) * strafe;
      enemy.y += (dx / d) * strafe;
    }
  });
}

function stepCorruption(state: GameState) {
  state.nodes.forEach((node) => {
    node.pulse = (node.pulse + 0.04 + node.corruption * 0.002) % (Math.PI * 2);
    const corruptorAttached = state.enemies.some(
      (enemy) =>
        enemy.role === "corruptor" &&
        enemy.targetNodeId === node.id &&
        dist(enemy.x, enemy.y, node.x, node.y) <= node.size + 10
    );

    if (!corruptorAttached && node.corruption > 0) {
      const purgeRate = 0.18 + state.upgrades.arsenal * 0.04 + state.upgrades.shield * 0.01;
      node.corruption = clamp(node.corruption - purgeRate, 0, 100);
      node.corruptedBy = null;
      if (node.corruption <= 3) {
        node.corrupted = false;
        node.corruptedBy = null;
      }
    }
  });
}

function stepTurrets(state: GameState) {
  state.turrets.forEach((turret, index) => {
    const live = index < Math.max(1, Math.min(state.turrets.length, 1 + state.upgrades.turret));
    if (!live) {
      turret.cooldown = 0;
      turret.angle += (-1.57 - turret.angle) * 0.06;
      return;
    }

    turret.range = 125 + state.upgrades.turret * 18;
    turret.cooldown = Math.max(0, turret.cooldown - 1);
    const target = [...state.enemies]
      .filter(
        (enemy) => enemy.role !== "corruptor" && dist(enemy.x, enemy.y, turret.x, turret.y) <= turret.range
      )
      .sort((a, b) => dist(a.x, a.y, turret.x, turret.y) - dist(b.x, b.y, turret.x, turret.y))[0];

    if (target) {
      turret.angle = Math.atan2(target.y - turret.y, target.x - turret.x);
    } else {
      turret.angle += (-1.57 - turret.angle) * 0.06;
    }

    if (target && turret.cooldown <= 0) {
      const damage = 16 + state.upgrades.turret * 6 + state.upgrades.reactor * 2;
      turret.cooldown = Math.max(8, 20 - state.upgrades.turret);
      addProjectile(state, turret.x, turret.y, target.x, target.y, "rgba(255, 255, 255, 0.95)", 2.2, 7);
      target.hp -= damage;
      target.flash = 6;
    }
  });
}

function stepScouts(state: GameState) {
  const corruptors = state.enemies.filter((enemy) => enemy.role === "corruptor");
  const corruptedNodes = [...state.nodes]
    .filter((node) => node.corruption > 8 && node.kind !== "gold")
    .sort((a, b) => b.corruption - a.corruption || a.id - b.id);

  state.scouts.forEach((scout, index) => {
    const live = index < Math.min(state.scouts.length, state.upgrades.scout);
    scout.pulse = (scout.pulse + 0.08) % (Math.PI * 2);
    scout.cooldown = Math.max(0, scout.cooldown - 1);

    if (!live) {
      scout.targetId = null;
      scout.tx = scout.homeX;
      scout.ty = scout.homeY;
      scout.x += (scout.homeX - scout.x) * 0.08;
      scout.y += (scout.homeY - scout.y) * 0.08;
      scout.angle += (-1.2 - scout.angle) * 0.08;
      scout.task = "Standby";
      return;
    }

    const currentTarget = corruptors.find((enemy) => enemy.id === scout.targetId);
    const interceptTarget =
      currentTarget ??
      [...corruptors].sort((a, b) => {
        const aDistance = dist(a.x, a.y, scout.x, scout.y);
        const bDistance = dist(b.x, b.y, scout.x, scout.y);
        return aDistance - bDistance;
      })[Math.min(index, Math.max(0, corruptors.length - 1))];

    if (interceptTarget) {
      scout.targetId = interceptTarget.id;
      scout.tx = interceptTarget.x;
      scout.ty = interceptTarget.y;

      const dx = interceptTarget.x - scout.x;
      const dy = interceptTarget.y - scout.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      scout.angle = Math.atan2(dy, dx);
      const preferredRange = 70 + state.upgrades.arsenal * 8;

      if (d > preferredRange) {
        scout.x += (dx / d) * (scout.speed + state.upgrades.arsenal * 0.14);
        scout.y += (dy / d) * (scout.speed + state.upgrades.arsenal * 0.14);
        scout.task = "Intercepting";
      } else {
        const orbit = Math.sin((state.timers.tick + scout.id * 19) / 14) * 0.9;
        scout.x += (-dy / d) * orbit;
        scout.y += (dx / d) * orbit;
        scout.task = "Purging";
      }

      if (d <= preferredRange + 10 && scout.cooldown <= 0) {
        const damage = 11 + state.upgrades.scout * 2 + state.upgrades.arsenal * 8;
        scout.cooldown = Math.max(7, 18 - state.upgrades.arsenal * 2);
        addProjectile(
          state,
          scout.x,
          scout.y,
          interceptTarget.x,
          interceptTarget.y,
          "rgba(220, 170, 255, 0.95)",
          2.4,
          8
        );
        interceptTarget.hp -= damage;
        interceptTarget.flash = 7;
      }

      return;
    }

    const sweepNode = corruptedNodes[Math.min(index, Math.max(0, corruptedNodes.length - 1))];
    if (sweepNode) {
      scout.targetId = null;
      scout.tx = sweepNode.x;
      scout.ty = sweepNode.y;
      const dx = sweepNode.x - scout.x;
      const dy = sweepNode.y - scout.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      scout.angle = Math.atan2(dy, dx);

      if (d > 28) {
        scout.x += (dx / d) * (0.6 + scout.speed * 0.55);
        scout.y += (dy / d) * (0.6 + scout.speed * 0.55);
      } else {
        const cleanseRate = 0.2 + state.upgrades.arsenal * 0.08;
        sweepNode.corruption = clamp(sweepNode.corruption - cleanseRate, 0, 100);
        if (sweepNode.corruption <= 3) {
          sweepNode.corrupted = false;
          sweepNode.corruptedBy = null;
        }
      }

      scout.task = "Sweeping";
      return;
    }

    const patrolX = scout.homeX + Math.cos((state.timers.tick + scout.id * 21) / 20) * 18;
    const patrolY = scout.homeY - 10 + Math.sin((state.timers.tick + scout.id * 15) / 24) * 12;
    scout.targetId = null;
    scout.tx = patrolX;
    scout.ty = patrolY;
    scout.x += (patrolX - scout.x) * 0.12;
    scout.y += (patrolY - scout.y) * 0.12;
    scout.angle = Math.atan2(patrolY - scout.y, patrolX - scout.x);
    scout.task = "Patrolling";
  });
}

function resolveEnemyDeaths(state: GameState) {
  const killed = state.enemies.filter((enemy) => enemy.hp <= 0);
  if (!killed.length) return;

  const purged = killed.filter((enemy) => enemy.role === "corruptor").length;
  const regular = killed.length - purged;
  const killedIds = new Set(killed.map((enemy) => enemy.id));

  state.stats.hostileKills += killed.length;
  state.stats.purges += purged;
  state.resources.gold += regular * (10 + state.upgrades.turret * 2) + purged * (8 + state.upgrades.scout * 3);
  state.resources.energy +=
    regular * (0.5 + state.upgrades.shield * 0.05) + purged * (0.9 + state.upgrades.arsenal * 0.08);

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

function stepCombat(state: GameState) {
  if (state.timers.tick % COMBAT_TICK !== 0) return;

  state.agents.forEach((agent) => {
    const attackers = state.enemies.filter(
      (enemy) => enemy.role !== "corruptor" && dist(enemy.x, enemy.y, agent.x, agent.y) < 26
    ).length;

    if (!attackers) return;

    const mitigation = state.upgrades.shield * 1.8 + state.upgrades.turret * 0.25;
    const incoming = Math.max(0.8, attackers * 4.2 - mitigation);
    const blocked = Math.max(0, attackers * 4.2 - incoming);
    state.stats.blocked += blocked;

    const nextHp = clamp(agent.hp - incoming, 0, agent.maxHp);
    if (nextHp <= 20 && agent.hp > 20) {
      state.log = pushLog(state.log, `${agent.kind} drone taking heavy fire.`);
    }

    if (nextHp <= 0) {
      agent.x = rand(agent.homeX - 18, agent.homeX + 18);
      agent.y = rand(agent.homeY - 18, agent.homeY + 18);
      agent.tx = agent.homeX;
      agent.ty = agent.homeY;
      agent.hp = clamp(agent.maxHp * (0.55 + state.upgrades.shield * 0.04), 25, agent.maxHp);
      agent.panic = 40;
      agent.evadeTicks = 36;
      agent.evadeDx = 0;
      agent.evadeDy = -1;
      agent.damageTicks = 30;
      agent.target = chooseWorkerTarget(state, agent, agent.id - 1);
      agent.task = "Rebooting";
      state.log = pushLog(state.log, `${agent.kind} drone restored from backup shell.`);
      return;
    }

    agent.hp = nextHp;
    agent.panic = clamp(agent.panic + 6, 0, 100);
    agent.damageTicks = 24;
  });
}

function stepMining(state: GameState) {
  if (state.timers.tick % MINING_TICK !== 0) return;

  state.nodes.forEach((node) => {
    const workers = state.agents.filter(
      (agent) =>
        agent.target === node.id &&
        dist(agent.x, agent.y, node.x, node.y) < Math.max(24, node.size * 0.52) &&
        agent.hp > 30 &&
        agent.evadeTicks <= 0
    ).length;

    if (!workers) {
      node.pulse = (node.pulse + 0.12) % (Math.PI * 2);
      return;
    }

    const damage =
      workers *
      (1 + state.upgrades.miner * 0.08 + state.upgrades.drill * 0.04) *
      (node.corrupted ? 0.78 : 1);

    node.hp -= damage;

    if (node.hp <= 0) {
      const crit = chance(0.18 + state.upgrades.bot * 0.01);
      const baseAmount = node.kind === "gold" ? 14 : node.kind === "ore" ? 10 : node.kind === "gems" ? 3.4 : 5.4;
      const corruptionPenalty = 1 - node.corruption / 170;
      const amount = baseAmount * Math.max(0.45, corruptionPenalty);

      state.resources[node.kind] += amount * state.combo * (crit ? 2 : 1);
      state.stats.mined += amount;
      if (crit) {
        state.stats.crits += 1;
        state.log = pushLog(state.log, `Critical haul on ${node.kind} node.`);
      }

      Object.assign(node, makeNode(node.id));
    } else {
      node.pulse = (node.pulse + 0.2 + node.corruption * 0.003) % (Math.PI * 2);
    }
  });
}

function getAutobuyWeight(state: GameState, derived: DerivedState, key: UpgradeKey) {
  let weight = 1;

  if (state.level < 3 && (key === "miner" || key === "drill")) weight *= 0.8;
  if (state.resources.energy < 10 && key === "reactor") weight *= 0.86;
  if (state.upgrades.turret === 0 && derived.hostilePressure && key === "turret") weight *= 0.45;
  if (state.upgrades.scout === 0 && derived.corruptionPressure && key === "scout") weight *= 0.3;

  if (derived.hostilePressure) {
    if (key === "turret") weight *= 0.52;
    else if (key === "shield") weight *= 0.62;
    else if (key === "reactor") weight *= 0.88;
    else weight *= 1.15;
  }

  if (derived.corruptionPressure) {
    if (key === "scout") weight *= 0.45;
    else if (key === "arsenal") weight *= 0.54;
    else if (key === "shield") weight *= 0.9;
    else if (key === "turret") weight *= 1.08;
  }

  if (key === "bot" && state.upgrades.bot > state.prestige + 2) weight *= 1.2;
  return weight;
}

function stepAutobuy(state: GameState) {
  if (state.timers.auto < AUTO_TICK) return;
  state.timers.auto = 0;

  const derived = computeDerived(state);
  const candidates = upgradeDefs
    .map((def) => ({
      def,
      cost: nextUpgradeCost(def, state.upgrades[def.key]),
    }))
    .filter(({ def, cost }) => {
      const smartGate =
        (def.key !== "bot" || state.upgrades.drill >= 2) &&
        (def.key !== "shield" || state.upgrades.turret >= 1) &&
        (def.key !== "turret" || state.upgrades.reactor >= 1 || state.level >= 3) &&
        (def.key !== "scout" || state.upgrades.reactor >= 1 || state.level >= 4) &&
        (def.key !== "arsenal" || state.upgrades.scout >= 1);

      return smartGate && state.resources.gold >= cost;
    })
    .sort((a, b) => {
      const weightedA = a.cost * getAutobuyWeight(state, derived, a.def.key);
      const weightedB = b.cost * getAutobuyWeight(state, derived, b.def.key);
      return weightedA - weightedB || a.cost - b.cost;
    });

  const chosen = candidates[0];
  if (chosen) {
    state.resources.gold = Math.max(0, state.resources.gold - chosen.cost);
    state.upgrades[chosen.def.key] += 1;
    state.stats.spent += chosen.cost;
    state.log = pushLog(state.log, `Purchased ${chosen.def.label} v${state.upgrades[chosen.def.key]}`);
    return;
  }

  if (
    state.resources.gold > 5200 &&
    state.resources.gems > 24 &&
    state.enemies.length < 3 &&
    derived.corruptedNodes === 0
  ) {
    state.resources.gold *= 0.18;
    state.resources.ore *= 0.15;
    state.resources.gems *= 0.2;
    state.resources.energy *= 0.2;
    state.prestige += 1;
    state.combo = Math.min(state.combo + 0.6, 9.9);
    state.log = pushLog(state.log, "Quantum reset complete. Prestige +1.");
  }
}

function stepProjectiles(state: GameState) {
  state.projectiles = state.projectiles
    .map((projectile) => ({ ...projectile, life: projectile.life - 1 }))
    .filter((projectile) => projectile.life > 0);
}

function stepEvents(state: GameState) {
  if (state.timers.event < EVENT_TICK) return;
  state.timers.event = 0;

  const derived = computeDerived(state);
  const ambientMessages = [
    "AI rerouted workers for better pathing.",
    "Bonus vein detected near lower ridge.",
    "Cache compression improved throughput.",
    "Support drone pretending to be useful.",
    "Energy bloom stabilized reactor output.",
    "Shield harmonics adjusted for worker safety.",
    "Scout wing reports purple sludge where it absolutely should not be.",
  ];

  if (derived.hostilePressure) {
    ambientMessages.push("Perimeter guns are cycling hot against the latest raiders.");
  } else {
    ambientMessages.push("Perimeter defense holding a lazy but confident posture.");
  }

  if (derived.corruptionPressure) {
    ambientMessages.push("Purge wing is tracing toxic residue over the outer nodes.");
  } else {
    ambientMessages.push("Corruption scan clean. For now.");
  }

  if (state.resources.gold > 2200) {
    ambientMessages.push("Treasury overflow routed into colony purchase heuristics.");
  }

  state.log = pushLog(state.log, pick(ambientMessages));
}

export function advanceGame(prev: GameState) {
  const state = cloneGameState(prev);
  state.timers.tick = (state.timers.tick + 1) % TICK_WRAP;
  state.timers.auto += 1;
  state.timers.event += 1;
  state.timers.enemy += 1;

  stepEconomy(state);
  stepSpawns(state);
  stepWorkers(state);
  stepEnemies(state);
  stepCorruption(state);
  stepTurrets(state);
  stepScouts(state);
  resolveEnemyDeaths(state);
  stepCombat(state);
  stepMining(state);
  stepAutobuy(state);
  stepProjectiles(state);
  stepEvents(state);

  return state;
}
