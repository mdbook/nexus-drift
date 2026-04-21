import { ENEMY_BUDGET_COST } from "@/game/balance";
import { spawnEnemy } from "@/game/factories";
import { getCombatEnemyWeights, getCorruptorSpawnChance, getEnemyWavePower } from "@/game/progression";
import { computeDerived } from "@/game/selectors";
import type { DerivedState, EnemyKind, GameState } from "@/game/types";
import { clamp, pushLog } from "@/game/utils";

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

  if (remainingSlots > 0 && state.rng.chance(corruptorChance)) {
    const spawnBlight = derived.progression.tier >= 5 && state.rng.chance(0.35);
    const kind = spawnBlight ? "blight" : "corruptor";
    spawned.push(kind);
    remainingBudget -= ENEMY_BUDGET_COST[kind];
    remainingSlots -= 1;
  }

  const combatWeights = getCombatEnemyWeights(derived.progression);
  while (remainingSlots > 0 && remainingBudget >= 0.85) {
    const candidates = (Object.entries(combatWeights) as Array<[Exclude<EnemyKind, "corruptor" | "blight">, number]>)
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
      if (threshold <= 0) { kind = entry.item; break; }
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
  }

  const message = describeSpawnWave(spawned, derived);
  if (message) {
    state.log = pushLog(state.log, message, "combat", state.timers.tick);
  }
}
