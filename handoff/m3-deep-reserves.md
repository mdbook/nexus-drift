# M3 — "Deep Reserves" (v0.1.3)

## Prerequisites
M1 and M2 must be merged first. This milestone assumes:
- `state.resources.cores` and `state.resources.flux` already exist in `GameState` (added in M2 for type safety).
- `state.eventModifiers.fluxPurgeMultiplier` exists (added in M2).
- `ENEMY_SPECIAL` constants are available from M2.

Ship this milestone as its own commit. Update `src/changelog.ts` and `package.json` to `0.1.3`.

---

## Codebase orientation

Key files touched this milestone:
- `src/game/types.ts` — add `Sentinel` entity type, `state.sentinels`, extend `UpgradeKey`
- `src/game/balance.ts` — new FLUX constants, SENTINEL constants, new upgrade cost defs
- `src/game/data.ts` — add 3 new `UpgradeDef` entries; extend cost shape to support multi-resource
- `src/game/factories.ts` — `makeSentinels()` factory
- `src/game/subsystems/economy.ts` — earn flux from purges/kills, archive XP modifier
- `src/game/subsystems/combat.ts` — flux on corruptor kill
- `src/game/subsystems/scouts.ts` — flux on node cleanse
- `src/game/subsystems/mining.ts` — foundry yield modifier
- `src/game/subsystems/autobuy.ts` — extend for new upgrades, multi-resource cost check
- `src/game/subsystems/sentinels.ts` — **new file**, sentinel AI subsystem
- `src/game/advanceGame.ts` — wire in `stepSentinels`
- `src/game/selectors.ts` — derived sentinel count, flux rate
- `src/components/FieldSvg.tsx` — render sentinels and flux HUD pill
- `src/App.tsx` — flux HUD pill, cores HUD pill, new upgrade buttons

---

## Change 1 — Flux earning logic

### 1a. Flux from scout node cleanse (`src/game/subsystems/scouts.ts`)

In the sweep section where `sweepNode.corrupted = false` is set (cleanse completed), award flux:
```ts
if (sweepNode.corruption <= 3) {
  sweepNode.corrupted = false;
  sweepNode.corruptedBy = null;
  // Award flux for full cleanse
  const fluxBase = 3.0;
  const fluxMultiplier = state.eventModifiers?.fluxPurgeMultiplier ?? 1.0;
  state.resources.flux = Math.min(
    FLUX.softCap,
    (state.resources.flux ?? 0) + fluxBase * fluxMultiplier
  );
  state.log = pushLog(state.log, "Node cleansed. Flux recovered.");
}
```

Also award a smaller amount each tick while actively cleansing (not just on completion):
```ts
// In the else branch (within 28u of node, applying cleanse):
const tickFlux = 0.5 * (state.eventModifiers?.fluxPurgeMultiplier ?? 1.0) * (1 + state.upgrades.arsenal * 0.1);
state.resources.flux = Math.min(FLUX.softCap + FLUX.overCapBuffer, (state.resources.flux ?? 0) + tickFlux);
```

### 1b. Flux soft cap decay (`src/game/subsystems/economy.ts`)

In `stepEconomy`, add a soft-cap decay pass. Flux above `FLUX.softCap` earns at reduced rate (already handled inline above), but also apply a gentle decay to prevent indefinite hoarding:
```ts
// Soft cap: over-cap flux decays at 30% rate
if (state.resources.flux > FLUX.softCap) {
  state.resources.flux -= (state.resources.flux - FLUX.softCap) * 0.002;  // slow bleed
}
```

### 1c. Flux from corruptor/blight kills (`src/game/subsystems/combat.ts`, `resolveEnemyDeaths`)

In the loop that processes dead enemies, alongside existing gold/energy rewards:
```ts
if (enemy.role === "corruptor") {
  const fluxReward = enemy.kind === "blight" ? 2.5 : 1.0;
  const multiplier = state.eventModifiers?.fluxPurgeMultiplier ?? 1.0;
  state.resources.flux = Math.min(FLUX.softCap + FLUX.overCapBuffer, (state.resources.flux ?? 0) + fluxReward * multiplier);
}
```

### 1d. Add FLUX constants to `src/game/balance.ts`

```ts
export const FLUX = {
  softCap: 200,
  overCapBuffer: 50,        // can briefly hold up to 250 (over-cap income nearly stops)
  cleanseTickReward: 0.5,   // flux per tick while cleansing
  cleanseCompletionBonus: 3.0,
  corruptorKillReward: 1.0,
  blightKillReward: 2.5,
  arsenalTickBonus: 0.1,    // +10% per arsenal level on cleanse tick reward
  prestigeResetMultiplier: 0.25,
} as const;
```

---

## Change 2 — Multi-resource upgrade costs

### 2a. Extend `UpgradeDef` in `src/game/data.ts`

The current `UpgradeDef` type likely has `baseCost: number` (single gold cost). Extend it to support multi-resource costs:

```ts
// Before (approximate):
type UpgradeDef = {
  key: UpgradeKey;
  label: string;
  baseCost: number;
  growth: number;
  effectText: string;
};

// After:
type UpgradeDef = {
  key: UpgradeKey;
  label: string;
  baseCost: number | Partial<Record<ResourceKey, number>>;  // gold-only (number) or multi-resource
  growth: number;
  effectText: string;
  minTier?: number;     // hide from UI and autobuy until this tier is reached
};
```

For backward compatibility: if `baseCost` is a number, treat it as `{ gold: baseCost }`.

Update `nextUpgradeCost` utility to handle both shapes:
```ts
export function nextUpgradeCost(def: UpgradeDef, currentLevel: number): Partial<Record<ResourceKey, number>> {
  const multiplier = Math.pow(def.growth, currentLevel);
  if (typeof def.baseCost === "number") {
    return { gold: Math.round(def.baseCost * multiplier) };
  }
  const result: Partial<Record<ResourceKey, number>> = {};
  for (const [k, v] of Object.entries(def.baseCost)) {
    result[k as ResourceKey] = Math.round((v as number) * multiplier);
  }
  return result;
}
```

Update the upgrade-purchase check (wherever `state.resources.gold >= cost` is checked) to compare against all resources in the cost object:
```ts
export function canAffordUpgrade(resources: GameState["resources"], cost: Partial<Record<ResourceKey, number>>): boolean {
  return Object.entries(cost).every(([k, v]) => (resources[k as ResourceKey] ?? 0) >= (v ?? 0));
}

export function deductUpgradeCost(resources: GameState["resources"], cost: Partial<Record<ResourceKey, number>>) {
  for (const [k, v] of Object.entries(cost)) {
    resources[k as ResourceKey] = Math.max(0, (resources[k as ResourceKey] ?? 0) - (v ?? 0));
  }
}
```

### 2b. Extend `UpgradeKey` type (`src/game/types.ts`)

```ts
// Before:
export type UpgradeKey = "miner" | "drill" | "reactor" | "bot" | "turret" | "shield" | "scout" | "arsenal";

// After:
export type UpgradeKey = "miner" | "drill" | "reactor" | "bot" | "turret" | "shield" | "scout" | "arsenal"
  | "foundry" | "sentinel" | "archive";
```

Also add `foundry`, `sentinel`, `archive` to `state.upgrades` (initialized to `0` in factories).

### 2c. Add new upgrade defs to `src/game/data.ts`

Append to the `upgradeDefs` array:
```ts
{
  key: "foundry",
  label: "Foundry",
  baseCost: { ore: 200, flux: 4 },
  growth: 1.26,
  effectText: "+12% node yield, +8% node respawn rate per level",
  minTier: 3,
},
{
  key: "sentinel",
  label: "Sentinel Mech",
  baseCost: { gold: 800, cores: 3 },
  growth: 1.35,
  effectText: "Deploys a heavy combat mech (cap 2). Hunts Brutes, Sappers, Leeches.",
  minTier: 5,
},
{
  key: "archive",
  label: "Data Archive",
  baseCost: { flux: 6, cores: 1 },
  growth: 1.30,
  effectText: "+8% XP rate, +0.05 prestige combo per level",
  minTier: 4,
},
```

Also add to `UPGRADES` in `balance.ts` (for growth tracking):
```ts
foundry:   { baseCost: 200, growth: 1.26 },  // ore cost; growth applies to all resources
sentinel:  { baseCost: 800, growth: 1.35 },
archive:   { baseCost: 0,   growth: 1.30 },  // no gold cost; growth tracked here
```

---

## Change 3 — Foundry effect (`src/game/subsystems/mining.ts`)

In the yield calculation, multiply by foundry level:
```ts
// Find the line that calculates yield (roughly):
// const yieldAmount = MINING.yield[node.kind] * corruptionFactor * ...;
// After all existing modifiers, add:
const foundryBonus = 1 + state.upgrades.foundry * 0.12;
const yieldAmount = MINING.yield[node.kind] * corruptionFactor * foundryBonus * eventYieldMultiplier;
```

For node respawn rate, find where nodes respawn after being harvested. There's likely a `respawnCooldown` or the node is immediately replaced. If nodes respawn on a timer (check `stepMining` for a `respawnAt` or similar field), multiply the interval by:
```ts
const respawnScale = 1 / (1 + state.upgrades.foundry * 0.08);  // e.g. level 3 → respawn 24% faster
```
If nodes respawn instantly, skip the respawn rate part — just apply the yield bonus.

---

## Change 4 — Archive effect (`src/game/selectors.ts` + `src/game/subsystems/economy.ts`)

### XP rate bonus in economy.ts
In `stepEconomy`, where XP is calculated:
```ts
// Find: xpGain = (base rate formula) * scale
// After the existing rate calc, multiply by archive bonus:
const archiveBonus = 1 + state.upgrades.archive * 0.08;
xpGain *= archiveBonus;
```

### Prestige combo bonus in selectors.ts
In `computeDerived`, find where `comboBonus` is calculated (prestige combo multiplier):
```ts
// After: const comboBonus = state.prestige * PRESTIGE.comboBonus + level * ECONOMY.levelComboBonus;
// Add archive term:
const comboBonus = state.prestige * PRESTIGE.comboBonus
  + state.level * ECONOMY.levelComboBonus
  + state.upgrades.archive * 0.05;
```

---

## Change 5 — Sentinel mech subsystem (new file `src/game/subsystems/sentinels.ts`)

### 5a. Sentinel type (`src/game/types.ts`)

Add alongside Scout/Turret type definitions:
```ts
export type Sentinel = {
  id: number;
  x: number;
  y: number;
  tx: number;   // current target x
  ty: number;   // current target y
  speed: number;
  cooldown: number;
  angle: number;
  task: string;
  pulse: number;
  homeX: number;
  homeY: number;
  targetId: number | null;
};
```

Add `sentinels: Sentinel[]` to `GameState`.

### 5b. Sentinel factory (`src/game/factories.ts`)

Add `makeSentinels()`:
```ts
export function makeSentinels(): Sentinel[] {
  return [
    { id: 1, x: 300, y: 500, tx: 300, ty: 500, speed: 0.72, cooldown: 0, angle: 0, task: "Standby", pulse: 0, homeX: 300, homeY: 500, targetId: null },
    { id: 2, x: 660, y: 500, tx: 660, ty: 500, speed: 0.68, cooldown: 0, angle: 0, task: "Standby", pulse: 0, homeX: 660, homeY: 500, targetId: null },
  ];
}
```

Initialise in `createInitialState`: `sentinels: makeSentinels()`.

### 5c. SENTINEL balance constants (`src/game/balance.ts`)

```ts
export const SENTINEL = {
  damageBase: 22,
  damagePerSentinel: 5,
  cooldownBase: 28,
  cooldownFloor: 14,
  rangeBase: 140,
  speedBase: 0.70,
  projectileColor: "rgba(251, 191, 36, 0.9)",  // amber
  projectileWidth: 3.2,
  projectileLife: 9,
  capPerUpgrade: 1,    // 1 active per upgrade level, max 2
  patrolRadius: 120,   // midfield patrol band
  patrolY: 350,        // vertical center of patrol band
} as const;
```

### 5d. Sentinel AI (`src/game/subsystems/sentinels.ts`)

Create this file:
```ts
import { SENTINEL } from "@/game/balance";
import { addProjectile } from "@/game/factories";
import { findClosestEnemy } from "@/game/targeting";
import type { GameState } from "@/game/types";
import { dist } from "@/game/utils";

export function stepSentinels(state: GameState) {
  const liveCount = Math.min(state.sentinels.length, state.upgrades.sentinel);

  state.sentinels.forEach((sentinel, index) => {
    const live = index < liveCount;
    sentinel.pulse = (sentinel.pulse + 0.05) % (Math.PI * 2);
    sentinel.cooldown = Math.max(0, sentinel.cooldown - 1);

    if (!live) {
      // Return to home
      const dx = sentinel.homeX - sentinel.x;
      const dy = sentinel.homeY - sentinel.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        sentinel.x += (dx / d) * sentinel.speed * 0.7;
        sentinel.y += (dy / d) * sentinel.speed * 0.7;
      }
      sentinel.task = "Standby";
      return;
    }

    // Priority target: leech > brute > sapper > anything
    const priorityOrder = ["leech", "brute", "sapper"];
    let target = null;
    for (const kind of priorityOrder) {
      target = findClosestEnemy(
        { x: sentinel.x, y: sentinel.y },
        state.enemies,
        e => e.kind === kind && e.hp > 0
      );
      if (target) break;
    }
    // Fall back to any combat enemy
    if (!target) {
      target = findClosestEnemy(
        { x: sentinel.x, y: sentinel.y },
        state.enemies,
        e => e.role === "combat" && e.hp > 0
      );
    }

    if (target) {
      sentinel.targetId = target.id;
      const dx = target.x - sentinel.x;
      const dy = target.y - sentinel.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      sentinel.angle = Math.atan2(dy, dx);
      sentinel.tx = target.x;
      sentinel.ty = target.y;

      const range = SENTINEL.rangeBase;

      if (d > range) {
        // Advance toward target
        sentinel.x += (dx / d) * sentinel.speed;
        sentinel.y += (dy / d) * sentinel.speed;
        sentinel.task = "Pursuing";
      } else {
        // Hold position, track
        sentinel.task = "Engaging";
      }

      if (d <= range && sentinel.cooldown <= 0) {
        const damage = SENTINEL.damageBase + state.upgrades.sentinel * SENTINEL.damagePerSentinel;
        sentinel.cooldown = Math.max(
          SENTINEL.cooldownFloor,
          Math.round(SENTINEL.cooldownBase - state.upgrades.sentinel * 2)
        );
        addProjectile(state, sentinel.x, sentinel.y, target.x, target.y, SENTINEL.projectileColor, SENTINEL.projectileWidth, SENTINEL.projectileLife);
        target.hp -= damage;
        target.flash = 7;
      }
      return;
    }

    // No target — patrol midfield band
    sentinel.targetId = null;
    const patrolX = sentinel.homeX + Math.cos((state.timers.tick + sentinel.id * 31) / 28) * SENTINEL.patrolRadius;
    const patrolY = SENTINEL.patrolY + Math.sin((state.timers.tick + sentinel.id * 23) / 32) * 30;
    sentinel.tx = patrolX;
    sentinel.ty = patrolY;
    const pdx = patrolX - sentinel.x;
    const pdy = patrolY - sentinel.y;
    const pd = Math.hypot(pdx, pdy);
    if (pd > 1) {
      sentinel.x += (pdx / pd) * sentinel.speed * 0.85;
      sentinel.y += (pdy / pd) * sentinel.speed * 0.85;
      sentinel.angle = Math.atan2(pdy, pdx);
    }
    sentinel.task = "Patrolling";
  });
}
```

### 5e. Wire sentinel step into `src/game/advanceGame.ts`

Import and call:
```ts
import { stepSentinels } from "@/game/subsystems/sentinels";

// In the advanceGame function, add after stepScouts:
stepSentinels(state);
```

---

## Change 6 — Autobuy extension (`src/game/subsystems/autobuy.ts`)

### 6a. Multi-resource affordability check

Replace any `state.resources.gold >= cost` checks with `canAffordUpgrade(state.resources, cost)` (imported from data.ts or utils).

### 6b. Emergency rules for new upgrades

In the emergency/priority section, add:
```ts
// Foundry: buy if tier >= 3 and haven't started yet
if (derived.progression.tier >= 3 && state.upgrades.foundry === 0) {
  const cost = nextUpgradeCost(getUpgradeDef("foundry"), 0);
  if (canAffordUpgrade(state.resources, cost)) {
    return "foundry";
  }
}

// Sentinel: buy if 2+ brutes currently alive and can afford
const bruteCount = state.enemies.filter(e => e.kind === "brute").length;
if (derived.progression.tier >= 5 && bruteCount >= 2) {
  const cost = nextUpgradeCost(getUpgradeDef("sentinel"), state.upgrades.sentinel);
  if (state.upgrades.sentinel < 2 && canAffordUpgrade(state.resources, cost)) {
    return "sentinel";
  }
}
```

### 6c. Smart gates

In the section that filters upgrade candidates (around autobuy.ts:127), add:
```ts
// Gate new upgrades behind tier requirements
if (def.minTier !== undefined && derived.progression.tier < def.minTier) continue;
// Gate sentinel behind first brute kill
if (def.key === "sentinel" && (state.stats?.brutesKilled ?? 0) === 0) continue;
```

If `state.stats.brutesKilled` doesn't exist yet, add it — increment in `resolveEnemyDeaths` in combat.ts when a brute dies.

---

## Change 7 — HUD: flux + cores pills (`src/App.tsx` / HUD components)

Find where resource pills are rendered (`ResourcePill` or similar components in `HudPrimitives.tsx` or `App.tsx`). Add two more pills:

```tsx
<ResourcePill
  label="Flux"
  value={derived.resources.flux}
  color="purple"
  icon="⬡"   // or use a Lucide icon
  visible={state.upgrades.scout >= 1}  // only show once scouts are purchased
/>
<ResourcePill
  label="Cores"
  value={derived.resources.cores}
  color="amber"
  icon="◈"
  visible={derived.progression.tier >= 4}  // only show at tier 4+
/>
```

The visibility gates prevent HUD clutter early-game. In `computeDerived` or `selectors.ts`, expose `resources` (raw or derived with rates).

---

## Change 8 — Render sentinels (`src/components/FieldSvg.tsx`)

Find where scouts are rendered and add a similar block for sentinels. Sentinels are heavier ground units — use a distinct shape (e.g. diamond or square-ish polygon):

```tsx
{state.sentinels.slice(0, state.upgrades.sentinel).map(sentinel => {
  const pulse = Math.sin(sentinel.pulse) * 0.15 + 0.85;
  const size = 9;
  // Diamond shape via polygon
  const pts = [
    `${sentinel.x},${sentinel.y - size}`,
    `${sentinel.x + size * 0.7},${sentinel.y}`,
    `${sentinel.x},${sentinel.y + size}`,
    `${sentinel.x - size * 0.7},${sentinel.y}`,
  ].join(" ");
  return (
    <g key={sentinel.id} transform={`rotate(${(sentinel.angle * 180) / Math.PI + 90}, ${sentinel.x}, ${sentinel.y})`}>
      <polygon points={pts} fill="#fbbf24" opacity={pulse} stroke="#f59e0b" strokeWidth={1.5} />
      {sentinel.task === "Engaging" && (
        <circle cx={sentinel.x} cy={sentinel.y} r={SENTINEL.rangeBase} fill="none" stroke="#fbbf24" strokeWidth={0.4} opacity={0.15} />
      )}
    </g>
  );
})}
```

---

## Change 9 — Version bump + changelog

### `package.json`
```json
"version": "0.1.3"
```

### `src/changelog.ts`
Add at the **top** of `CHANGELOG` (above v0.1.2):
```ts
{
  version: "0.1.3",
  badge: "Deep Reserves",
  summary: "Two new resources, three new upgrade tracks, and Sentinel Mechs for the late-game.",
  sections: [
    {
      title: "New Resources",
      items: [
        "Flux: earned by cleansing corrupted nodes and killing Corruptors/Blights. Soft-caps at 200.",
        "Cores: dropped by Brutes, Phantoms, and Echo Signal elites. Spent on Sentinel and Archive upgrades.",
      ],
    },
    {
      title: "New Upgrades",
      items: [
        "Foundry (tier 3): boosts node yield by 12% and respawn speed by 8% per level. Costs Ore + Flux.",
        "Sentinel Mech (tier 5): deploys a heavy ground unit that hunts Brutes, Sappers, and Leeches. Costs Gold + Cores.",
        "Data Archive (tier 4): accelerates XP gain and increases prestige combo bonus. Costs Flux + Cores.",
      ],
    },
    {
      title: "Economy",
      items: [
        "Flux earns from scout cleanse ticks, node purge completions, and corruptor kills",
        "Upgrade costs can now require multiple resource types",
        "Autobuy logic extended to consider Flux and Cores availability",
      ],
    },
  ],
},
```

---

## Verification checklist

1. `npm test` — fix any type errors from new `UpgradeKey` union members. Check that autobuy tests (if any) still pass.
2. `npm run build` — zero TS errors.
3. `npm run dev`:
   - Verify flux HUD pill appears when scout level ≥ 1.
   - Cleanse a corrupted node; confirm flux increments.
   - Reach tier 4 via admin speed; confirm Archive appears in upgrade list.
   - Reach tier 3; confirm Foundry appears; purchase it; confirm mining yields increase (watch resource income rates in sidebar).
   - Kill a Brute (spawn via admin); confirm cores increment.
   - Purchase Sentinel upgrade; confirm diamond mech appears on field patrolling midfield.
   - Spawn a Brute; confirm Sentinel prioritizes it over mites.
   - Reach tier 5 via admin; confirm Sentinel button unlocks after first brute kill.
4. Confirm autobuy purchases Foundry at tier 3 automatically once resources allow.
5. Leave running at 4× speed for 5 min; confirm no console errors or NaN in resource displays.
