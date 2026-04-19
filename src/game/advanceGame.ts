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
import { addProjectile, chooseWorkerTarget, cloneGameState, respawnNode, spawnEnemy } from "@/game/factories";
import {
  ENEMY_BUDGET_COST,
  ENEMY_CONTACT_DAMAGE,
  getCombatEnemyWeights,
  getCorruptorSpawnChance,
  getEnemyWavePower,
} from "@/game/progression";
import { computeDerived } from "@/game/selectors";
import type { DerivedState, EnemyKind, GameState, UpgradeKey } from "@/game/types";
import { chance, clamp, dist, nextUpgradeCost, normalize, pick, pickWeighted, pushLog, rand } from "@/game/utils";

const upgradeDefByKey = Object.fromEntries(upgradeDefs.map((def) => [def.key, def])) as Record<
  UpgradeKey,
  (typeof upgradeDefs)[number]
>;

type EmergencyUpgradeChoice = { key: UpgradeKey; reason: string };

function pluralize(label: string, count: number) {
  return count === 1 ? label : `${label}s`;
}

function describeSpawnWave(spawned: EnemyKind[], derived: DerivedState) {
  const counts = { mite: 0, raider: 0, wisp: 0, corruptor: 0 };
  spawned.forEach((kind) => {
    counts[kind] += 1;
  });

  const segments = (Object.keys(counts) as EnemyKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${pluralize(kind, counts[kind])}`);

  if (!segments.length) return null;

  const prefix = derived.progression.recoveryMode
    ? "Threat director easing the next wave:"
    : derived.progression.tier >= 4
      ? `${derived.progression.label} wave inbound:`
      : "Perimeter contact:";

  return `${prefix} ${segments.join(", ")}.`;
}

function getTurretTargetScore(state: GameState, turret: GameState["turrets"][number], enemy: GameState["enemies"][number]) {
  const distanceScore = dist(enemy.x, enemy.y, turret.x, turret.y);
  const threatWeight =
    enemy.kind === "raider"
      ? 1.75 + state.upgrades.reactor * 0.22
      : enemy.kind === "wisp"
        ? 1.45 + state.upgrades.turret * 0.18
        : 1.1;

  return distanceScore / threatWeight + enemy.hp * 0.1;
}

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
  const derived = computeDerived(state);
  if (state.timers.enemy < derived.progression.spawnIntervalTicks) return;
  state.timers.enemy = 0;
  if (state.enemies.length >= derived.progression.enemyCap) return;

  const corruptibleNodes = state.nodes.filter((node) => node.kind !== "gold");
  const openSlots = derived.progression.enemyCap - state.enemies.length;
  const wavePower = getEnemyWavePower(state.level, state.prestige, derived.progression);
  const spawned: EnemyKind[] = [];
  let remainingBudget =
    derived.progression.waveBudget * clamp(openSlots / 3, 0.7, derived.progression.recoveryMode ? 1.05 : 1.3);
  let remainingSlots = openSlots;

  const corruptorChance = getCorruptorSpawnChance(
    derived.progression,
    derived.activeCorruptionNodes,
    derived.corruptorCount,
    corruptibleNodes.length
  );

  if (remainingSlots > 0 && chance(corruptorChance)) {
    spawned.push("corruptor");
    remainingBudget -= ENEMY_BUDGET_COST.corruptor;
    remainingSlots -= 1;
  }

  const combatWeights = getCombatEnemyWeights(derived.progression);
  while (remainingSlots > 0 && remainingBudget >= 0.85) {
    const candidates = (Object.entries(combatWeights) as Array<[Exclude<EnemyKind, "corruptor">, number]>)
      .filter(([kind, weight]) => weight > 0 && ENEMY_BUDGET_COST[kind] <= remainingBudget + 0.15)
      .map(([kind, weight]) => ({ item: kind, weight }));

    if (!candidates.length) {
      if (!spawned.length) {
        spawned.push("mite");
      }
      break;
    }

    const kind = pickWeighted(candidates);
    if (!kind) break;

    spawned.push(kind);
    remainingBudget -= ENEMY_BUDGET_COST[kind];
    remainingSlots -= 1;

    if (derived.progression.recoveryMode && spawned.length >= 2 && chance(0.45)) break;
    if (spawned.length >= 4 && chance(0.4)) break;
  }

  if (!spawned.length) return;

  for (const kind of spawned) {
    state.enemies.push(spawnEnemy(state.nextEnemyId++, wavePower, kind));
  }

  const message = describeSpawnWave(spawned, derived);
  if (message) {
    state.log = pushLog(state.log, message);
  }
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
      agent.target = chooseWorkerTarget(state, agent);
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

  // separate overlapping workers
  for (let i = 0; i < state.agents.length; i++) {
    for (let j = i + 1; j < state.agents.length; j++) {
      const a = state.agents[i];
      const b = state.agents[j];
      const minDist = 28;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < minDist && d > 0) {
        const push = (minDist - d) / 2;
        const nx = (dx / d) * push;
        const ny = (dy / d) * push;
        a.x -= nx;
        a.y -= ny;
        b.x += nx;
        b.y += ny;
      }
    }
  }
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
      if (enemy.kind === "wisp") {
        enemy.trail.push([enemy.x, enemy.y]);
        if (enemy.trail.length > 5) enemy.trail.shift();
      }
      enemy.x += (dx / d) * enemy.speed * 0.561;
      enemy.y += (dy / d) * enemy.speed * 0.561;
      const strafe = Math.sin((state.timers.tick + enemy.id * 13) / 14) * 0.18;
      enemy.x += (-dy / d) * strafe;
      enemy.y += (dx / d) * strafe;
    }
  });

  // separate overlapping enemies — two passes for stronger resolution
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < state.enemies.length; i++) {
      for (let j = i + 1; j < state.enemies.length; j++) {
        const a = state.enemies[i];
        const b = state.enemies[j];
        const minDist = 42;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < minDist && d > 0) {
          const push = (minDist - d) / 2;
          const nx = (dx / d) * push;
          const ny = (dy / d) * push;
          a.x -= nx;
          a.y -= ny;
          b.x += nx;
          b.y += ny;
        }
      }
    }
  }
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

    turret.range = 125 + state.upgrades.turret * 15 + state.upgrades.reactor * 6;
    turret.cooldown = Math.max(0, turret.cooldown - 1);
    const target = [...state.enemies]
      .filter(
        (enemy) => enemy.role !== "corruptor" && dist(enemy.x, enemy.y, turret.x, turret.y) <= turret.range
      )
      .sort((a, b) => getTurretTargetScore(state, turret, a) - getTurretTargetScore(state, turret, b))[0];

    if (target) {
      turret.angle = Math.atan2(target.y - turret.y, target.x - turret.x);
    } else {
      turret.angle += (-1.57 - turret.angle) * 0.06;
    }

    if (target && turret.cooldown <= 0) {
      const damage =
        13 +
        state.upgrades.turret * 4 +
        state.upgrades.reactor * 3 +
        (target.kind === "wisp" ? 4 + state.upgrades.turret * 2 : 0) +
        (target.kind === "raider" ? 5 + state.upgrades.reactor * 4 : 0);
      turret.cooldown = Math.max(7, Math.round(21 - state.upgrades.turret * 1.4 - state.upgrades.reactor * 0.45));
      addProjectile(
        state,
        turret.x,
        turret.y,
        target.x,
        target.y,
        "rgba(255, 255, 255, 0.95)",
        target.kind === "raider" ? 2.8 : 2.2,
        7
      );
      target.hp -= damage;
      target.flash = 6;
    }
  });
}

function scoutAvoidance(state: GameState, sx: number, sy: number): { ax: number; ay: number } {
  const AVOID_RADIUS = 90;
  let ax = 0, ay = 0;
  for (const enemy of state.enemies) {
    if (enemy.role === "corruptor") continue;
    const dx = sx - enemy.x;
    const dy = sy - enemy.y;
    const d = Math.hypot(dx, dy);
    if (d < AVOID_RADIUS && d > 0) {
      const strength = (AVOID_RADIUS - d) / AVOID_RADIUS;
      ax += (dx / d) * strength;
      ay += (dy / d) * strength;
    }
  }
  return { ax, ay };
}

function stepScouts(state: GameState) {
  const corruptors = state.enemies.filter((enemy) => enemy.role === "corruptor");
  const corruptedNodes = [...state.nodes]
    .filter((node) => node.corruption > 8 && node.kind !== "gold")
    .sort((a, b) => b.corruption - a.corruption || a.id - b.id);
  const liveScouts = Math.min(state.scouts.length, state.upgrades.scout, 3);

  state.scouts.forEach((scout, index) => {
    const live = index < liveScouts;
    scout.pulse = (scout.pulse + 0.08) % (Math.PI * 2);
    scout.cooldown = Math.max(0, scout.cooldown - 1);

    if (!live) {
      scout.targetId = null;
      scout.tx = scout.homeX;
      scout.ty = scout.homeY;
      const sdx = scout.homeX - scout.x;
      const sdy = scout.homeY - scout.y;
      const sd = Math.hypot(sdx, sdy);
      if (sd > 1) {
        const { ax, ay } = scoutAvoidance(state, scout.x, scout.y);
        const mx = sdx / sd + ax * 1.2;
        const my = sdy / sd + ay * 1.2;
        const ml = Math.max(1, Math.hypot(mx, my));
        const s = Math.min(sd, scout.speed * 0.8);
        scout.x += (mx / ml) * s;
        scout.y += (my / ml) * s;
        scout.angle = Math.atan2(my, mx);
      }
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
      const preferredRange = 68 + state.upgrades.scout * 4 + state.upgrades.arsenal * 8;

      if (d > preferredRange) {
        scout.x += (dx / d) * (scout.speed + state.upgrades.scout * 0.08 + state.upgrades.arsenal * 0.16);
        scout.y += (dy / d) * (scout.speed + state.upgrades.scout * 0.08 + state.upgrades.arsenal * 0.16);
        scout.task = "Intercepting";
      } else {
        const orbit = Math.sin((state.timers.tick + scout.id * 19) / 14) * 0.9;
        scout.x += (-dy / d) * orbit;
        scout.y += (dx / d) * orbit;
        scout.task = "Purging";
      }

      if (d <= preferredRange + 10 && scout.cooldown <= 0) {
        const damage = 10 + state.upgrades.scout * 2.5 + state.upgrades.arsenal * 7;
        scout.cooldown = Math.max(6, Math.round(18 - state.upgrades.scout * 0.5 - state.upgrades.arsenal * 2));
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
    const pdx = patrolX - scout.x;
    const pdy = patrolY - scout.y;
    const pd = Math.hypot(pdx, pdy);
    if (pd > 1) {
      const { ax, ay } = scoutAvoidance(state, scout.x, scout.y);
      const mx = pdx / pd + ax * 1.2;
      const my = pdy / pd + ay * 1.2;
      const ml = Math.max(1, Math.hypot(mx, my));
      const s = Math.min(pd, scout.speed * 0.9);
      scout.x += (mx / ml) * s;
      scout.y += (my / ml) * s;
      scout.angle = Math.atan2(my, mx);
    }
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
    );

    if (!attackers.length) return;

    const rawIncoming = attackers.reduce((sum, enemy) => sum + ENEMY_CONTACT_DAMAGE[enemy.kind], 0);
    const mitigation = attackers.reduce((sum, enemy) => {
      const baseline = state.upgrades.shield * 0.95 + state.upgrades.turret * 0.12;
      const counterMitigation =
        enemy.kind === "mite"
          ? state.upgrades.shield * 0.55
          : enemy.kind === "wisp"
            ? state.upgrades.turret * 0.45 + state.upgrades.shield * 0.15
            : state.upgrades.reactor * 0.55 + state.upgrades.shield * 0.22;

      return sum + baseline + counterMitigation;
    }, 0);
    const incoming = Math.max(attackers.length * 0.6, rawIncoming - mitigation);
    const blocked = Math.max(0, rawIncoming - incoming);
    state.stats.blocked += blocked;

    const nextHp = clamp(agent.hp - incoming, 0, agent.maxHp);
    if (nextHp <= 24 && agent.hp > 24) {
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
      agent.target = chooseWorkerTarget(state, agent);
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

      Object.assign(node, respawnNode(node.id, state.nodes));
    } else {
      node.pulse = (node.pulse + 0.2 + node.corruption * 0.003) % (Math.PI * 2);
    }
  });
}

function getAutobuyWeight(state: GameState, derived: DerivedState, key: UpgradeKey) {
  let weight = 1;

  if (state.level < 3 && (key === "miner" || key === "drill")) weight *= 0.72;
  if (derived.totalIncome < 6 && (key === "miner" || key === "drill")) weight *= 0.86;
  if (state.resources.energy < 10 && key === "reactor") weight *= 0.82;
  if (derived.progression.tier >= 2 && key === "turret" && state.upgrades.turret < 1) weight *= 0.52;
  if (derived.progression.tier >= 2 && key === "reactor" && state.upgrades.reactor < 1) weight *= 0.62;
  if (derived.progression.tier >= 3 && key === "shield" && state.upgrades.shield < 1) weight *= 0.68;

  if (derived.hostilePressure) {
    if (key === "turret") weight *= 0.62;
    else if (key === "shield") weight *= 0.72;
    else if (key === "reactor") weight *= 0.82;
    else if (key === "miner" || key === "drill") weight *= 1.18;
  }

  if (derived.enemyCounts.wisp > 0) {
    if (key === "turret") weight *= 0.36;
    else if (key === "reactor") weight *= 0.76;
  }

  if (derived.enemyCounts.raider > 0) {
    if (key === "reactor") weight *= 0.32;
    else if (key === "shield") weight *= 0.55;
    else if (key === "turret") weight *= 0.78;
  }

  if (derived.corruptionPressure) {
    if (key === "scout") weight *= state.upgrades.scout === 0 ? 0.12 : 0.42;
    else if (key === "arsenal") weight *= state.upgrades.scout > 0 ? 0.28 : 0.9;
    else if (key === "shield") weight *= 0.9;
    else if (key === "turret") weight *= 1.08;
  }

  if (derived.progression.recoveryMode && (key === "miner" || key === "drill")) weight *= 1.18;
  if (key === "bot" && state.upgrades.bot > Math.max(2, state.prestige + 1)) weight *= 1.25;
  if (key === "arsenal" && state.upgrades.scout === 0) weight *= 1.25;

  return weight;
}

function getEmergencyUpgradeChoice(state: GameState, derived: DerivedState): EmergencyUpgradeChoice | null {
  const canAfford = (key: UpgradeKey) => state.resources.gold >= nextUpgradeCost(upgradeDefByKey[key], state.upgrades[key]);

  if (
    (derived.corruptorCount > 0 || derived.activeCorruptionNodes > 0 || derived.progression.tier >= 3) &&
    state.upgrades.scout < 1 &&
    canAfford("scout")
  ) {
    return { key: "scout", reason: "corrupter pressure" };
  }

  if (
    (derived.corruptorCount > 0 || derived.activeCorruptionNodes > 1) &&
    state.upgrades.scout > 0 &&
    state.upgrades.arsenal < state.upgrades.scout + 1 &&
    canAfford("arsenal")
  ) {
    return { key: "arsenal", reason: "purge cleanup" };
  }

  if (
    (derived.enemyCounts.raider > 0 || derived.progression.tier >= 4) &&
    state.upgrades.reactor < Math.max(1, Math.ceil(derived.progression.tier / 2)) &&
    canAfford("reactor")
  ) {
    return { key: "reactor", reason: "heavy-contact pressure" };
  }

  if (
    (derived.enemyCounts.wisp > 0 || derived.combatThreats >= 4) &&
    state.upgrades.turret < Math.max(1, Math.ceil(derived.progression.tier / 2)) &&
    canAfford("turret")
  ) {
    return { key: "turret", reason: "fast-contact pressure" };
  }

  if (
    (derived.enemyCounts.mite + derived.enemyCounts.raider >= 4 || derived.colonyHealth < 70) &&
    state.upgrades.shield < Math.max(1, Math.ceil(derived.progression.tier / 3)) &&
    canAfford("shield")
  ) {
    return { key: "shield", reason: "worker attrition" };
  }

  return null;
}

function stepAutobuy(state: GameState) {
  if (state.timers.auto < AUTO_TICK) return;
  state.timers.auto = 0;

  const derived = computeDerived(state);
  const emergencyChoice = getEmergencyUpgradeChoice(state, derived);
  if (emergencyChoice) {
    const def = upgradeDefByKey[emergencyChoice.key];
    const cost = nextUpgradeCost(def, state.upgrades[def.key]);
    state.resources.gold = Math.max(0, state.resources.gold - cost);
    state.upgrades[def.key] += 1;
    state.stats.spent += cost;
    state.log = pushLog(
      state.log,
      `Ops bot fast-tracked ${def.label} v${state.upgrades[def.key]} for ${emergencyChoice.reason}.`
    );
    return;
  }

  const candidates = upgradeDefs
    .map((def) => ({
      def,
      cost: nextUpgradeCost(def, state.upgrades[def.key]),
    }))
    .filter(({ def, cost }) => {
      const smartGate =
        (def.key !== "bot" || state.upgrades.drill >= 2) &&
        (def.key !== "shield" || state.upgrades.turret >= 1 || derived.progression.tier >= 3) &&
        (def.key !== "turret" || state.upgrades.reactor >= 1 || state.level >= 3 || derived.progression.tier >= 2) &&
        (def.key !== "scout" || state.upgrades.reactor >= 1 || state.level >= 4 || derived.progression.tier >= 3) &&
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
