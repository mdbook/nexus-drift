import { ENEMY_BUDGET_COST, WARDEN } from "@/game/balance";
import { recordEnemyDiscovery, spawnEnemy } from "@/game/factories";
import { getCombatEnemyWeights, getCorruptorSpawnChance, getEnemyWavePower } from "@/game/progression";
import { computeDerived } from "@/game/selectors";
import type { DerivedState, EnemyKind, GameState } from "@/game/types";
import { clamp, appendLog } from "@/game/utils";

function pluralize(label: string, count: number) {
  return count === 1 ? label : `${label}s`;
}

function describeSpawnWave(spawned: EnemyKind[], derived: DerivedState) {
  const counts: Record<EnemyKind, number> = {
    mite: 0,
    raider: 0,
    wisp: 0,
    corruptor: 0,
    rusher: 0,
    brute: 0,
    sapper: 0,
    blight: 0,
    leech: 0,
    phantom: 0,
    zapper: 0,
    warden: 0,
  };
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

export function stepSpawns(state: GameState) {
  const derived = computeDerived(state);
  if (state.timers.enemy < derived.progression.spawnIntervalTicks) return;
  state.timers.enemy = 0;
  // 3.1.3 audit follow-up: cap checks use live enemies only. Dying enemies
  // still occupy slots in state.enemies for the death-fade window but are
  // invisible to every other sim path — counting them here briefly stalls
  // spawns after kills and paces the director off of corpses.
  const liveEnemyCount = state.enemies.reduce((count, enemy) => count + (enemy.hp > 0 ? 1 : 0), 0);
  if (liveEnemyCount >= derived.progression.enemyCap) return;

  const corruptibleNodes = state.nodes.filter((node) => node.kind !== "gold");
  const openSlots = derived.progression.enemyCap - liveEnemyCount;
  const wavePower = getEnemyWavePower(state.level, state.prestige, derived.progression);
  const spawned: EnemyKind[] = [];
  // 3.1.3: lerp the budget ceiling out of recovery instead of binary flipping.
  // recoveryStrength=0 → ceiling 1.3 (full pressure); strength=1 → 1.05 (eased).
  const budgetCeiling = 1.3 - derived.progression.recoveryStrength * 0.25;
  let remainingBudget = derived.progression.waveBudget * clamp(openSlots / 3, 0.7, budgetCeiling);
  let remainingSlots = openSlots;

  const corruptorChance = getCorruptorSpawnChance(
    derived.progression,
    derived.activeCorruptionNodes,
    derived.corruptorCount,
    corruptibleNodes.length
  );

  if (remainingSlots > 0 && state.rng.chance(corruptorChance)) {
    const spawnBlight = derived.progression.tier >= 5 && state.rng.chance(0.35);
    const kind = spawnBlight ? "blight" : "corruptor";
    spawned.push(kind);
    remainingBudget -= ENEMY_BUDGET_COST[kind];
    remainingSlots -= 1;
  }

  const combatWeights = getCombatEnemyWeights(derived.progression);
  while (remainingSlots > 0 && remainingBudget >= 0.85) {
    const candidates = (
      Object.entries(combatWeights) as Array<[Exclude<EnemyKind, "corruptor" | "blight">, number]>
    )
      .filter(([kind, weight]) => weight > 0 && ENEMY_BUDGET_COST[kind] <= remainingBudget + 0.15)
      .map(([kind, weight]) => ({ item: kind, weight }));

    if (!candidates.length) {
      if (!spawned.length) {
        spawned.push("mite");
      }
      break;
    }

    const total = candidates.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    let threshold = state.rng.next() * total;
    let kind: Exclude<EnemyKind, "corruptor" | "blight"> | null = null;
    for (const entry of candidates) {
      threshold -= Math.max(0, entry.weight);
      if (threshold <= 0) {
        kind = entry.item;
        break;
      }
    }
    if (!kind) kind = candidates[candidates.length - 1]?.item ?? null;
    if (!kind) break;

    spawned.push(kind);
    remainingBudget -= ENEMY_BUDGET_COST[kind];
    remainingSlots -= 1;

    if (derived.progression.recoveryMode && spawned.length >= 2 && state.rng.chance(0.45)) break;
    if (spawned.length >= 4 && state.rng.chance(0.4)) break;
  }

  if (!spawned.length) return;

  for (const kind of spawned) {
    state.enemies.push(spawnEnemy(state.rng, state.nextEnemyId++, wavePower, kind, state.timers.tick));
    recordEnemyDiscovery(state, kind);
  }

  const message = describeSpawnWave(spawned, derived);
  if (message) {
    appendLog(state, message, "combat");
  }
}

/**
 * 3.0.0 Step 7 — Warden spawn gate.
 *
 * Wardens bypass the regular wave budget. They have their own long cooldown
 * (wardenSpawnIntervalTicks) and are gated behind tier threshold. At most one
 * warden is ever on the field at a time. A new warden is blocked only when
 * spawning it could reduce the player to zero healthy workers — specifically,
 * when fewer than 2 healthy workers remain (healthy = active, not corrupted,
 * not rebooting). This lets 2 simultaneous corruptions occur in a larger
 * fleet while always preserving at least 1 uncorrupted worker.
 */
export function stepWardenSpawn(state: GameState) {
  const derived = computeDerived(state);
  if (derived.progression.tier < WARDEN.wardenSpawnTierThreshold) {
    state.timers.warden = 0;
    return;
  }

  const wardenOnField = state.enemies.some((e) => e.kind === "warden" && e.hp > 0);
  const healthyWorkers = state.agents.filter((a) => a.active && !a.corrupted && a.rebootTicks === 0).length;
  if (wardenOnField || healthyWorkers <= 1) {
    // The timer is "time since the field was fully clear and eligible", not
    // time spent waiting behind a blocker. Interruptions reset progress rather
    // than pausing it, which prevents cooldown banking after an infestation.
    // Repeatedly triggering and clearing wardens can therefore delay respawns
    // indefinitely; switch this block to pause if that pacing model changes.
    state.timers.warden = 0;
    return;
  }

  state.timers.warden += 1;
  if (state.timers.warden < WARDEN.wardenSpawnIntervalTicks) return;

  state.timers.warden = 0;
  const wavePower = getEnemyWavePower(state.level, state.prestige, derived.progression);
  state.enemies.push(spawnEnemy(state.rng, state.nextEnemyId++, wavePower, "warden", state.timers.tick));
  recordEnemyDiscovery(state, "warden");
  appendLog(state, "Void warden detected on perimeter. Infestation risk.", "corruption");
}
