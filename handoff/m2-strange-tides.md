# M2 — "Strange Tides" (v0.1.2)

## Prerequisites
M1 ("Slow Burn") must be merged first. This milestone assumes `flux` and `cores` resources do **not** yet exist — those land in M3. However, `cores` drops are wired here (dropped into `state.resources.cores`) so M3 can just render and use them without touching enemy logic again.

Ship this milestone as its own commit. Update `src/changelog.ts` and `package.json` to `0.1.2`.

---

## Codebase orientation

Key files touched this milestone:
- `src/game/types.ts` — add new `EnemyKind` variants, `ResourceKey` variants, `ActiveEvent` type, `state.activeEvents`
- `src/game/balance.ts` — add stats for 6 new enemy kinds, new combat weight entries
- `src/game/factories.ts` — extend `spawnEnemy()` to handle new kinds
- `src/game/progression.ts` — add tier-gated combat weights for new enemies
- `src/game/subsystems/spawns.ts` — minor: spawn log needs to handle new kind names
- `src/game/subsystems/combat.ts` — sapper explosion logic, phantom cloak, leech drain, brute core drop
- `src/game/subsystems/movement.ts` — phantom cloaking tick in stepEnemies
- `src/game/subsystems/events.ts` — refactor into ambient + mechanical events
- `src/game/selectors.ts` — expose `activeEvents` in DerivedState
- `src/components/FieldSvg.tsx` — render new enemies visually, event status banner
- `src/App.tsx` — event trigger buttons in admin panel

---

## Change 1 — Extend types (`src/game/types.ts`)

### 1a. Extend `EnemyKind`
Find the existing union and add the new kinds:
```ts
// Before:
export type EnemyKind = "mite" | "raider" | "wisp" | "corruptor";

// After:
export type EnemyKind = "mite" | "raider" | "wisp" | "corruptor"
  | "rusher" | "brute" | "sapper" | "blight" | "leech" | "phantom";
```

### 1b. Extend `ResourceKey`
```ts
// Before:
export type ResourceKey = "gold" | "ore" | "gems" | "energy";

// After:
export type ResourceKey = "gold" | "ore" | "gems" | "energy" | "cores" | "flux";
```
Note: `flux` won't have a HUD pill or be earnable until M3, but adding it to the union now means `state.resources` and reset multipliers can include it without a separate PR.

### 1c. Add `cloakTicks` to the `Enemy` type
The `Enemy` type already has fields like `flash`, `hp`, `speed`, etc. Add:
```ts
cloakTicks?: number;  // tracks cloak phase for phantoms (undefined for non-phantoms)
```

### 1d. Add `ActiveEvent` type and `state.activeEvents`
Add near the bottom of the file (before or after the `GameState` definition):
```ts
export type ActiveEvent = {
  id: string;
  label: string;
  ticksRemaining: number;   // counts down to 0, then event is removed
};
```

In `GameState`, add the new fields:
```ts
activeEvents: ActiveEvent[];
timers: {
  // existing fields...
  bigEvent: number;   // add this alongside existing timer fields
};
resources: {
  gold: number; ore: number; gems: number; energy: number;
  cores: number;   // add cores
  flux: number;    // add flux (earnable in M3, exists here for type safety)
};
```

### 1e. Update `createInitialState` / factory
In `src/game/factories.ts`, wherever `GameState` is constructed (function `createInitialState` or similar), initialise the new fields:
```ts
activeEvents: [],
timers: { ..., bigEvent: 0 },
resources: { gold: 0, ore: 0, gems: 0, energy: 0, cores: 0, flux: 0 },
```

---

## Change 2 — New enemy stats (`src/game/balance.ts`)

### 2a. Add to `ENEMY_STATS`
```ts
export const ENEMY_STATS: Record<EnemyKind, { hpBase: number; hpWave: number; speedBase: number; speedWave: number }> = {
  // existing:
  mite:      { hpBase: 40, hpWave: 6,  speedBase: 1.1,  speedWave: 0.02  },
  raider:    { hpBase: 65, hpWave: 5,  speedBase: 0.9,  speedWave: 0.02  },
  wisp:      { hpBase: 30, hpWave: 6,  speedBase: 1.45, speedWave: 0.02  },
  corruptor: { hpBase: 52, hpWave: 5,  speedBase: 1.0,  speedWave: 0.015 },
  // new:
  rusher:    { hpBase: 24, hpWave: 4,  speedBase: 1.85, speedWave: 0.025 },
  brute:     { hpBase: 160, hpWave: 8, speedBase: 0.55, speedWave: 0.01  },
  sapper:    { hpBase: 35, hpWave: 5,  speedBase: 1.1,  speedWave: 0.02  },
  blight:    { hpBase: 95, hpWave: 7,  speedBase: 0.8,  speedWave: 0.012 },
  leech:     { hpBase: 70, hpWave: 6,  speedBase: 0.85, speedWave: 0.015 },
  phantom:   { hpBase: 55, hpWave: 5,  speedBase: 1.3,  speedWave: 0.018 },
};
```

### 2b. Add to `ENEMY_BUDGET_COST`
```ts
export const ENEMY_BUDGET_COST: Record<EnemyKind, number> = {
  mite: 1, wisp: 1.25, raider: 2.35, corruptor: 2.7,
  rusher: 0.9,   // cheap swarm filler
  brute: 3.5,    // expensive, soaks resources
  sapper: 1.6,   // moderate, high threat potential
  blight: 3.2,   // expensive corruptor variant
  leech: 2.8,    // expensive, economic drain
  phantom: 2.6,  // moderate, disrupts targeting
};
```

### 2c. Add to `ENEMY_CONTACT_DAMAGE`
```ts
export const ENEMY_CONTACT_DAMAGE: Record<EnemyKind, number> = {
  mite: 3.4, wisp: 2.6, raider: 6.8, corruptor: 0,
  rusher: 4.0,
  brute: 12.0,
  sapper: 0,       // damage dealt via explosion, not contact
  blight: 0,       // corruptor role
  leech: 2.0,
  phantom: 5.0,
};
```

### 2d. Add new behaviour constants
Add a new `ENEMY_SPECIAL` constant block:
```ts
export const ENEMY_SPECIAL = {
  sapper: {
    explosionRadius: 60,
    explosionDamage: 18,
    triggerRadius: 22,   // distance to worker/turret that triggers explosion
  },
  blight: {
    corruptionRatePerTick: 0.95,      // faster than normal corruptor (0.65)
    scoutDamageResistance: 0.60,      // takes 60% less damage from scouts until arsenal >= 3
    arsenalResistThreshold: 3,
  },
  leech: {
    drainRadius: 100,        // distance from home base at which draining activates
    goldDrainPerTick: 0.4,
    energyDrainPerTick: 0.02,
  },
  phantom: {
    visibleTicks: 90,
    cloakedTicks: 30,
    cycleTicks: 120,         // visibleTicks + cloakedTicks
  },
  brute: {
    coreDropAmount: 1,
  },
} as const;
```

---

## Change 3 — Tier-gated combat weights (`src/game/progression.ts`)

Find the `PROGRESSION.combatWeights` section (or wherever `getCombatEnemyWeights` is implemented) and extend it to include the new enemy kinds with `minTier` gates.

The existing pattern in `balance.ts` has:
```ts
combatWeights: {
  mite:   { base: 2.2, tier: -0.26, pressure: 0.08, min: 0.45, max: 2.4 },
  wisp:   { base: 0.6, tier: 0.32, dominance: 0.08, pressure: -0.02, min: 0.35, max: 3.2, minTier: 1 },
  raider: { base: 0.28, tier: 0.36, dominance: 0.12, pressure: -0.1, min: 0.15, max: 2.8, minTier: 2 },
},
```

Add new entries to this `combatWeights` block in `balance.ts`:
```ts
rusher:  { base: 0.0, tier: 0.28, pressure: 0.12, min: 0.2, max: 2.6, minTier: 3 },
brute:   { base: 0.0, tier: 0.22, dominance: 0.15, pressure: -0.15, min: 0.1, max: 1.8, minTier: 4 },
sapper:  { base: 0.0, tier: 0.18, pressure: 0.08, min: 0.1, max: 1.6, minTier: 5 },
leech:   { base: 0.0, tier: 0.14, dominance: 0.1, min: 0.1, max: 1.4, minTier: 6 },
phantom: { base: 0.0, tier: 0.12, min: 0.08, max: 1.2, minTier: 7 },
```

In `progression.ts`, the `getCombatEnemyWeights` function iterates `PROGRESSION.combatWeights` and skips entries with `weight <= 0` or below `minTier`. Make sure its filter respects `minTier` for all entries. The existing wisp/raider handling already does this — just ensure the function iterates all keys of the (now larger) `combatWeights` object.

For `blight` (corruptor variant): it spawns through the corruptor path, not the combat weights path. In `spawns.ts`, the corruptor spawn decision already rolls a chance. Extend it: at tier 5+, there's a 35% chance the spawned corruptor is a `blight` instead of a regular `corruptor`.

```ts
// In stepSpawns, after: if (remainingSlots > 0 && state.rng.chance(corruptorChance)) {
//   spawned.push("corruptor");
// Change to:
if (remainingSlots > 0 && state.rng.chance(corruptorChance)) {
  const isHighTier = derived.progression.tier >= 5;
  const spawnBlight = isHighTier && state.rng.chance(0.35);
  spawned.push(spawnBlight ? "blight" : "corruptor");
  remainingBudget -= ENEMY_BUDGET_COST[spawnBlight ? "blight" : "corruptor"];
  remainingSlots -= 1;
}
```

---

## Change 4 — Extend `spawnEnemy` factory (`src/game/factories.ts`)

The existing `spawnEnemy` function already takes a `forcedKind` param. The key fix is making sure new kinds are assigned the correct `role`.

Find the line that sets `role` (currently `"combat"` or `"corruptor"` based on kind):
```ts
// Before:
const role = kind === "corruptor" ? "corruptor" : "combat";

// After:
const role = (kind === "corruptor" || kind === "blight") ? "corruptor" : "combat";
```

Also add `cloakTicks` initialisation for phantoms:
```ts
// After constructing the enemy object, add:
if (kind === "phantom") {
  enemy.cloakTicks = 0;  // starts in visible phase
}
```

---

## Change 5 — New enemy behaviours (`src/game/subsystems/combat.ts` and `movement.ts`)

### 5a. Phantom cloaking tick (`src/game/subsystems/movement.ts`, `stepEnemies`)

In the `stepEnemies` function, after updating each enemy's position, add a cloak tick for phantoms:

```ts
// Add near end of enemy movement update loop:
if (enemy.kind === "phantom" && enemy.cloakTicks !== undefined) {
  enemy.cloakTicks = (enemy.cloakTicks + 1) % ENEMY_SPECIAL.phantom.cycleTicks;
}
```

An enemy is "cloaked" when:
```ts
const isCloaked = (e: Enemy) =>
  e.kind === "phantom" &&
  e.cloakTicks !== undefined &&
  e.cloakTicks >= ENEMY_SPECIAL.phantom.visibleTicks;
```

### 5b. Turret targeting skips cloaked phantoms (`src/game/subsystems/turrets.ts`)

In `stepTurrets`, where a target enemy is selected (the `findClosestEnemy`/priority loop), add a filter:
```ts
// Add to the candidate filter:
.filter(enemy => !isCloaked(enemy))
```
Import `isCloaked` from a shared util or inline the check. Scouts ignore cloak (they track by id), so no change needed in scouts.ts.

### 5c. Sapper explosion (`src/game/subsystems/combat.ts`)

In `stepCombat` (or `resolveEnemyDeaths`), add sapper handling. Sappers explode when they come within `triggerRadius` of any worker:

In `stepCombat`, before or after the normal damage loop, add:
```ts
// Sapper check: explode if within trigger radius of any worker
for (const enemy of state.enemies) {
  if (enemy.kind !== "sapper") continue;
  const triggerDist = ENEMY_SPECIAL.sapper.triggerRadius;
  const nearWorker = state.agents.some(agent =>
    dist(agent.x, agent.y, enemy.x, enemy.y) < triggerDist
  );
  if (nearWorker) {
    // AoE damage to all workers within explosion radius
    for (const agent of state.agents) {
      if (dist(agent.x, agent.y, enemy.x, enemy.y) < ENEMY_SPECIAL.sapper.explosionRadius) {
        agent.hp -= ENEMY_SPECIAL.sapper.explosionDamage;
        agent.damageTicks = WORKER.combatDamageTicks;
      }
    }
    // Mark sapper as dead
    enemy.hp = 0;
    state.log = pushLog(state.log, "Sapper detonated near workers.");
    break;
  }
}
```

### 5d. Brute core drop (`src/game/subsystems/combat.ts`, `resolveEnemyDeaths`)

In the loop that processes dead enemies (`hp <= 0`), add a core drop for brutes:
```ts
if (enemy.kind === "brute") {
  state.resources.cores = (state.resources.cores ?? 0) + ENEMY_SPECIAL.brute.coreDropAmount;
  state.log = pushLog(state.log, "Brute destroyed. Core fragment recovered.");
}
```

### 5e. Blight: scout damage resistance (`src/game/subsystems/scouts.ts`)

In the section where scout damage is applied to the interceptTarget (currently around line ~99 in the original file, or wherever `interceptTarget.hp -= damage` appears after M1's changes), add:
```ts
let effectiveDamage = damage;
if (interceptTarget.kind === "blight" && state.upgrades.arsenal < ENEMY_SPECIAL.blight.arsenalResistThreshold) {
  effectiveDamage *= (1 - ENEMY_SPECIAL.blight.scoutDamageResistance);
}
interceptTarget.hp -= effectiveDamage;
```

Also, blight uses the higher corruption rate. In `src/game/subsystems/corruption.ts`, where corruption is applied per attached corruptor:
```ts
const ratePerTick = enemy.kind === "blight"
  ? ENEMY_SPECIAL.blight.corruptionRatePerTick
  : CORRUPTION.ratePerTick;
```
Find the `ratePerTick` application and make this swap.

### 5f. Leech resource drain (`src/game/subsystems/combat.ts` or a new step in `advanceGame.ts`)

The simplest placement is in `stepCombat` (runs every COMBAT_TICK):
```ts
// Leech drain — check leeches near home base
const HOME_X = 500; // approximate center of home district
const HOME_Y = 540;
for (const enemy of state.enemies) {
  if (enemy.kind !== "leech") continue;
  if (dist(enemy.x, enemy.y, HOME_X, HOME_Y) < ENEMY_SPECIAL.leech.drainRadius) {
    state.resources.gold = Math.max(0, state.resources.gold - ENEMY_SPECIAL.leech.goldDrainPerTick);
    state.resources.energy = Math.max(0, state.resources.energy - ENEMY_SPECIAL.leech.energyDrainPerTick);
  }
}
```

---

## Change 6 — Random events system

### 6a. Event definitions (new file `src/game/events/eventDefs.ts`)

```ts
import type { GameState } from "@/game/types";

export type EventDef = {
  id: string;
  label: string;
  description: string;
  durationTicks: number;   // 0 = instant (no revert needed)
  weight: number;
  minTier: number;
  apply: (state: GameState) => void;
  revert: (state: GameState) => void;
};

// Ticks per second ≈ 30 (33ms per tick)
const TICKS_PER_SEC = 30;

export const EVENT_DEFS: EventDef[] = [
  {
    id: "meteor_shower",
    label: "Meteor Shower",
    description: "Node yields boosted ×1.6 for 60s.",
    durationTicks: 60 * TICKS_PER_SEC,
    weight: 1.0,
    minTier: 0,
    apply: (state) => { state.eventModifiers = { ...state.eventModifiers, yieldMultiplier: 1.6 }; },
    revert: (state) => { state.eventModifiers = { ...state.eventModifiers, yieldMultiplier: 1.0 }; },
  },
  {
    id: "solar_flare",
    label: "Solar Flare",
    description: "Energy ×2 but turret cooldowns +20% for 45s.",
    durationTicks: 45 * TICKS_PER_SEC,
    weight: 0.9,
    minTier: 1,
    apply: (state) => { state.eventModifiers = { ...state.eventModifiers, energyRate: 2.0, turretCooldownScale: 1.2 }; },
    revert: (state) => { state.eventModifiers = { ...state.eventModifiers, energyRate: 1.0, turretCooldownScale: 1.0 }; },
  },
  {
    id: "cache_discovery",
    label: "Cache Discovery",
    description: "A bonus high-yield node appeared.",
    durationTicks: 0,   // instant — node added and will despawn naturally or after 3 minutes
    weight: 0.8,
    minTier: 0,
    apply: (state) => {
      // Spawn a temporary bonus node
      // Use state.rng to pick a position away from home
      const x = state.rng.range(100, 900);
      const y = state.rng.range(100, 450);
      state.nodes.push({
        id: state.nextNodeId++,
        kind: "gems",  // high-value
        x, y,
        hp: 80, maxHp: 80, size: 14,
        corruption: 0, corrupted: false, corruptedBy: null,
        pulse: 0,
        temporary: true,   // add this flag to Node type if not present
        despawnAt: state.timers.tick + 180 * TICKS_PER_SEC,
      });
    },
    revert: () => {},  // node expires naturally
  },
  {
    id: "pirate_caravan",
    label: "Pirate Caravan",
    description: "Off-schedule raider wave — double kill rewards.",
    durationTicks: 0,
    weight: 0.7,
    minTier: 2,
    apply: (state) => {
      // Force spawn 3–5 raiders
      const count = 3 + Math.floor(state.rng.next() * 3);
      for (let i = 0; i < count; i++) {
        const enemy = spawnEnemy(state.rng, state.nextEnemyId++, 0, "raider");
        enemy.goldRewardBonus = 2.0;  // double kill reward flag (add to Enemy type)
        state.enemies.push(enemy);
      }
      state.log = pushLog(state.log, "Pirate caravan inbound — raiders carrying bonus loot.");
    },
    revert: () => {},
  },
  {
    id: "xeno_bloom",
    label: "Xeno Bloom",
    description: "Corruption spreads faster but purges yield 3× flux for 90s.",
    durationTicks: 90 * TICKS_PER_SEC,
    weight: 0.6,
    minTier: 3,
    apply: (state) => { state.eventModifiers = { ...state.eventModifiers, corruptionRate: 1.5, fluxPurgeMultiplier: 3.0 }; },
    revert: (state) => { state.eventModifiers = { ...state.eventModifiers, corruptionRate: 1.0, fluxPurgeMultiplier: 1.0 }; },
  },
  {
    id: "dust_storm",
    label: "Dust Storm",
    description: "Turret range −25%, enemy speed −20% for 60s.",
    durationTicks: 60 * TICKS_PER_SEC,
    weight: 0.7,
    minTier: 2,
    apply: (state) => { state.eventModifiers = { ...state.eventModifiers, turretRangeScale: 0.75, enemySpeedScale: 0.8 }; },
    revert: (state) => { state.eventModifiers = { ...state.eventModifiers, turretRangeScale: 1.0, enemySpeedScale: 1.0 }; },
  },
  {
    id: "echo_signal",
    label: "Echo Signal",
    description: "An elite signal emerges from the noise.",
    durationTicks: 0,
    weight: 0.2,   // rare
    minTier: 5,
    apply: (state) => {
      const elite = spawnEnemy(state.rng, state.nextEnemyId++, 0, "brute");
      elite.hp *= 2;
      elite.maxHp = elite.hp;
      elite.coreDropOverride = 5;  // drops 5 cores on death (add field to Enemy type)
      state.enemies.push(elite);
      state.log = pushLog(state.log, "Echo Signal: elite signature detected on approach.");
    },
    revert: () => {},
  },
];
```

You'll need to:
- Add `state.eventModifiers` to `GameState` (new field, initialized to all-1.0 multipliers).
- Add `temporary`, `despawnAt` fields to the `Node` type.
- Add `goldRewardBonus`, `coreDropOverride` fields to the `Enemy` type (optional/undefined by default).

### 6b. `state.eventModifiers` type and initial value

Add to `GameState`:
```ts
eventModifiers: {
  yieldMultiplier: number;
  energyRate: number;
  turretCooldownScale: number;
  turretRangeScale: number;
  enemySpeedScale: number;
  corruptionRate: number;
  fluxPurgeMultiplier: number;
};
```

Initial value (in factory):
```ts
eventModifiers: {
  yieldMultiplier: 1.0,
  energyRate: 1.0,
  turretCooldownScale: 1.0,
  turretRangeScale: 1.0,
  enemySpeedScale: 1.0,
  corruptionRate: 1.0,
  fluxPurgeMultiplier: 1.0,
},
```

### 6c. Apply modifiers in subsystems

Each modifier needs to be consumed where relevant:
- `yieldMultiplier`: `src/game/subsystems/mining.ts` — multiply node yield by `state.eventModifiers.yieldMultiplier`.
- `energyRate`: `src/game/subsystems/economy.ts` — multiply energy income by `state.eventModifiers.energyRate`.
- `turretCooldownScale`: `src/game/subsystems/turrets.ts` — multiply computed cooldown by this scale.
- `turretRangeScale`: `src/game/subsystems/turrets.ts` — multiply range by this scale.
- `enemySpeedScale`: `src/game/subsystems/movement.ts` (stepEnemies) — multiply enemy movement step by this scale.
- `corruptionRate`: `src/game/subsystems/corruption.ts` — multiply corruption tick rate.
- `fluxPurgeMultiplier`: used in M3 when flux is earned (wire in then).

### 6d. Refactor `src/game/subsystems/events.ts`

Current file fires ambient log messages every 145 ticks. Keep that behaviour and layer a second timer for big events.

```ts
import { EVENT_DEFS } from "@/game/events/eventDefs";
import type { GameState } from "@/game/types";
import { pushLog } from "@/game/utils";
import { computeDerived } from "@/game/selectors";

const AMBIENT_TICK = 145;
const BIG_EVENT_TICK_MIN = 30 * 30;   // 30s
const BIG_EVENT_TICK_MAX = 90 * 30;   // 90s

// ... keep existing ambientMessages and ambientStep logic ...

export function stepEvents(state: GameState) {
  // --- Existing ambient log messages (unchanged) ---
  stepAmbientMessages(state);   // extract existing logic into this helper

  // --- Tick down active events ---
  const expiredIds: string[] = [];
  for (const active of state.activeEvents) {
    active.ticksRemaining -= 1;
    if (active.ticksRemaining <= 0) {
      expiredIds.push(active.id);
    }
  }
  for (const id of expiredIds) {
    const def = EVENT_DEFS.find(d => d.id === id);
    def?.revert(state);
    state.activeEvents = state.activeEvents.filter(a => a.id !== id);
    state.log = pushLog(state.log, `${def?.label ?? id} has ended.`);
  }

  // --- Tick temporary nodes ---
  state.nodes = state.nodes.filter(node => {
    if (node.temporary && node.despawnAt !== undefined && state.timers.tick >= node.despawnAt) {
      return false;   // remove expired temp nodes
    }
    return true;
  });

  // --- Roll big event ---
  state.timers.bigEvent += 1;
  if (state.timers.bigEvent >= state.nextBigEventInterval) {
    state.timers.bigEvent = 0;
    // Next interval is random in [30s, 90s]
    state.nextBigEventInterval = Math.floor(
      BIG_EVENT_TICK_MIN + state.rng.next() * (BIG_EVENT_TICK_MAX - BIG_EVENT_TICK_MIN)
    );

    const derived = computeDerived(state);
    const tier = derived.progression.tier;

    // Eligible events: correct tier, not already active
    const activeIds = new Set(state.activeEvents.map(a => a.id));
    const eligible = EVENT_DEFS.filter(d => d.minTier <= tier && !activeIds.has(d.id));
    if (!eligible.length) return;

    // Weighted pick
    const total = eligible.reduce((s, d) => s + d.weight, 0);
    let threshold = state.rng.next() * total;
    let chosen: typeof EVENT_DEFS[0] | null = null;
    for (const def of eligible) {
      threshold -= def.weight;
      if (threshold <= 0) { chosen = def; break; }
    }
    if (!chosen) chosen = eligible[eligible.length - 1];

    chosen.apply(state);
    state.log = pushLog(state.log, `Event: ${chosen.label} — ${chosen.description}`);

    if (chosen.durationTicks > 0) {
      state.activeEvents.push({ id: chosen.id, label: chosen.label, ticksRemaining: chosen.durationTicks });
    }
  }
}
```

Add `nextBigEventInterval` to `GameState` (initialized to a random value in `[BIG_EVENT_TICK_MIN, BIG_EVENT_TICK_MAX]` at creation time using `state.rng`).

---

## Change 7 — HUD: active events banner (`src/App.tsx` and `src/components/FieldSvg.tsx`)

### Active events in DerivedState (`src/game/selectors.ts`)
Expose `activeEvents` in derived state so components can read it:
```ts
// In computeDerived, add:
activeEvents: state.activeEvents,
```

### Event banner in HUD (`src/App.tsx`)
In the HUD, add a small banner row that shows active events. Place it just above the event log. Example:
```tsx
{derived.activeEvents.length > 0 && (
  <div className="flex gap-2 flex-wrap px-3 py-1">
    {derived.activeEvents.map(ev => (
      <span key={ev.id} className="text-xs px-2 py-0.5 rounded bg-yellow-900/60 text-yellow-200 border border-yellow-700/40">
        {ev.label} ({Math.ceil(ev.ticksRemaining / 30)}s)
      </span>
    ))}
  </div>
)}
```

### Admin panel event triggers
In the admin panel (inside the `adminOpen` block in `App.tsx`), add event trigger buttons:
```tsx
<div className="flex flex-col gap-1 mt-2">
  <div className="text-xs text-gray-400">Trigger Event</div>
  {EVENT_DEFS.map(def => (
    <button
      key={def.id}
      className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded"
      onClick={() => {
        setGameState(prev => {
          const next = cloneGameState(prev);
          def.apply(next);
          if (def.durationTicks > 0) {
            next.activeEvents.push({ id: def.id, label: def.label, ticksRemaining: def.durationTicks });
          }
          return next;
        });
      }}
    >
      {def.label}
    </button>
  ))}
</div>
```

---

## Change 8 — Render new enemies (`src/components/FieldSvg.tsx`)

The existing enemy renderer draws enemies as circles with role-based colors. Extend it to handle new kinds. Find the enemy rendering section (look for `enemy.role === "corruptor"` or similar color switches) and add:

```tsx
// Color map per kind
const enemyColor: Record<string, string> = {
  mite: "#f87171",       // red
  wisp: "#a78bfa",       // purple
  raider: "#fb923c",     // orange
  corruptor: "#4ade80",  // green
  rusher: "#facc15",     // yellow — fast, bright
  brute: "#6b7280",      // gray — heavy, dull
  sapper: "#f43f5e",     // rose — danger
  blight: "#86efac",     // pale green — corrupted variant
  leech: "#818cf8",      // indigo — drains
  phantom: "#e2e8f0",    // near-white — ghostly
};

// For cloaked phantoms: render at low opacity
const opacity = isCloaked(enemy) ? 0.2 : 1.0;

// Size hint (brutes should appear larger)
const radius = enemy.kind === "brute" ? 10 : enemy.kind === "sapper" ? 5 : 7;
```

Implement `isCloaked` as a pure helper at the top of the component:
```tsx
const isCloaked = (e: Enemy) =>
  e.kind === "phantom" &&
  e.cloakTicks !== undefined &&
  e.cloakTicks >= 90;  // ENEMY_SPECIAL.phantom.visibleTicks — hardcode or import
```

For sappers, draw a small warning ring to telegraph the explosion:
```tsx
{enemy.kind === "sapper" && (
  <circle cx={enemy.x} cy={enemy.y} r={60} fill="none" stroke="#f43f5e" strokeWidth={0.5} opacity={0.3} />
)}
```

---

## Change 9 — Version bump + changelog

### `package.json`
```json
"version": "0.1.2"
```

### `src/changelog.ts`
Add at the **top** of `CHANGELOG` (above v0.1.1):
```ts
{
  version: "0.1.2",
  badge: "Strange Tides",
  summary: "Six new enemy types, Cores resource, and a live random-event system.",
  sections: [
    {
      title: "New Enemies",
      items: [
        "Rusher (tier 3): fast straight-line darters that pressure turret clusters",
        "Brute (tier 4): slow tank that absorbs turret fire — drops Core fragments",
        "Sapper (tier 5): suicide unit that detonates near workers",
        "Blight (tier 5): heavy corruptor resistant to scouts until arsenal level 3",
        "Leech (tier 6): drains gold and energy when near the home district",
        "Phantom (tier 7): periodically cloaks, invisible to turrets during cloak phase",
      ],
    },
    {
      title: "Resources",
      items: [
        "New: Cores — rare fragments dropped by Brutes and Phantoms. Used to unlock late-game upgrades.",
      ],
    },
    {
      title: "Random Events",
      items: [
        "Live event system: Meteor Shower, Solar Flare, Cache Discovery, Pirate Caravan, Xeno Bloom, Dust Storm, Echo Signal",
        "Active events shown as HUD banners with countdowns",
        "Events are tier-gated and use the seeded RNG for reproducibility",
      ],
    },
  ],
},
```

---

## Verification checklist

1. `npm test` — type errors expected from new `EnemyKind` / `ResourceKey` variants until all switch statements are updated. Fix exhaustive checks.
2. `npm run build` (or `tsc --noEmit`) — zero type errors before calling this milestone done.
3. `npm run dev` + admin panel:
   - Trigger each event manually; confirm HUD banner appears and countdown decrements.
   - Force-spawn a Brute; confirm `cores` counter in resources (even if no HUD pill yet) increments.
   - Force-spawn a Phantom; watch turrets — confirm they stop targeting during cloak phase (low-opacity enemy).
   - Force-spawn a Sapper near workers; confirm explosion log line fires.
   - Let a Blight attach to a node with 0 arsenal; confirm it resists scout damage (corruption bar drops slowly on the node).
4. Reach tier 5+ via admin speed; confirm Rushers and Sappers start appearing naturally.
5. Confirm temporary cache-discovery node disappears after 3 minutes (use 4× speed to compress).
