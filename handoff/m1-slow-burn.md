# M1 — "Slow Burn" (v0.1.1)

## Goal
The game currently tops off in ~30–60 minutes. This milestone slows the economy, nerfs anti-corruption drones, and adds a multi-drone synergy mechanic. No new types or systems — pure retuning of existing constants and a targeted logic change in the scout subsystem.

Ship this milestone as its own commit. Update `src/changelog.ts` and `package.json` version to `0.1.1`.

---

## Codebase orientation

- All balance constants live in `src/game/balance.ts`. Every number below maps to an export from that file.
- Scout AI lives entirely in `src/game/subsystems/scouts.ts`.
- Scout unit definitions (including base speed) are in `src/game/factories.ts`, function `makeScouts()` around line 118.
- `src/game/types.ts` defines all types — no changes needed this milestone.
- The admin panel (space × 5) lets you speed up the game and spawn enemies manually — use it to spot-check balance changes quickly.

---

## Change 1 — Economy & progression slowdown (`src/game/balance.ts`)

Apply these exact value changes. Comments explain the intent.

### UPGRADES growth rates (lines 3–12)
Each upgrade's `growth` multiplier compounds per level, so a +0.02 delta becomes significant past level 15 without affecting early game feel.

```ts
// Before → After
miner:   { baseCost: 10,   growth: 1.18 }  →  { baseCost: 10,   growth: 1.20 }
drill:   { baseCost: 80,   growth: 1.22 }  →  { baseCost: 80,   growth: 1.24 }
reactor: { baseCost: 200,  growth: 1.25 }  →  { baseCost: 200,  growth: 1.27 }
bot:     { baseCost: 1100, growth: 1.30 }  →  { baseCost: 1100, growth: 1.32 }
turret:  { baseCost: 180,  growth: 1.23 }  →  { baseCost: 180,  growth: 1.25 }
shield:  { baseCost: 420,  growth: 1.26 }  →  { baseCost: 420,  growth: 1.28 }
scout:   { baseCost: 280,  growth: 1.24 }  →  { baseCost: 280,  growth: 1.26 }
arsenal: { baseCost: 540,  growth: 1.27 }  →  { baseCost: 540,  growth: 1.29 }
```

### ECONOMY rates (lines 158–189)
Ore is the tightest bottleneck — trim it more aggressively than gold. XP scale slows leveling, which delays wave power scaling and stretches mid-game.

```ts
// ECONOMY.rates
goldPerMiner:  0.9  →  0.78
oreBase:       0.4  →  0.32
orePerMiner:   0.35 →  0.30

// ECONOMY.xpRate
scale:  12  →  9.5
```

### PROGRESSION constants (lines 223–295)
Slower spawn intervals, smaller wave budgets, and more score required per tier all stretch the progression curve.

```ts
// PROGRESSION.spawn
baselineInterval:  232  →  280
intervalPerScore:  3.4  →  2.1

// PROGRESSION.wave
budgetPerScore:  0.058  →  0.038
budgetPerTier:   0.33   →  0.24

// PROGRESSION (top-level)
tiersPerScore:  11  →  14
```

### PRESTIGE gates (lines 215–221)
Prestige should feel like a milestone event, not a routine reset every session.

```ts
// PRESTIGE
goldGate:  5200  →  9800
gemsGate:  36    →  70
```

---

## Change 2 — Scout/drone nerfs

### 2a. Base speeds (`src/game/factories.ts`, function `makeScouts()`, ~line 118)

The four scout objects each have a hardcoded `speed` value. Change them:

```ts
// Scout id 1: speed 1.5  → 0.98
// Scout id 2: speed 1.46 → 0.95
// Scout id 3: speed 1.54 → 1.02
// Scout id 4: speed 1.48 → 0.97
```

Example for id 1:
```ts
{
  id: 1,
  x: 220, y: 575, tx: 220, ty: 575,
  speed: 0.98,   // was 1.5
  ...
}
```

### 2b. SCOUT constants (`src/game/balance.ts`, lines 109–128)

```ts
// SCOUT
damageBase:           10    →  6
damagePerScout:       2.5   →  2.0
cooldownBase:         18    →  24
cooldownFloor:        6     →  8
preferredRangeBase:   68    →  56
speedPerScout:        0.08  →  0.05
speedPerArsenal:      0.16  →  0.10
cleanseRateBase:      0.2   →  0.10
capBase:              3     →  2
capBoostThreshold:    5     →  8

// Add this new constant (after capBoostAmount):
cleanseSynergyPerExtra:  0.6
```

The full SCOUT block should look like:
```ts
export const SCOUT = {
  damageBase: 6,
  damagePerScout: 2.0,
  damagePerArsenal: 7,
  cooldownBase: 24,
  cooldownPerScout: 0.5,
  cooldownPerArsenal: 2,
  cooldownFloor: 8,
  preferredRangeBase: 56,
  preferredRangePerScout: 4,
  preferredRangePerArsenal: 8,
  speedPerScout: 0.05,
  speedPerArsenal: 0.10,
  cleanseRateBase: 0.10,
  cleanseRatePerArsenal: 0.08,
  avoidRadius: 90,
  capBase: 2,
  capBoostThreshold: 8,
  capBoostAmount: 1,
  cleanseSynergyPerExtra: 0.6,
} as const;
```

---

## Change 3 — Multi-drone cleanse synergy (`src/game/subsystems/scouts.ts`)

### Current behavior (problem)
Line 106 assigns each scout to a corrupted node via:
```ts
const sweepNode = corruptedNodes[Math.min(index, Math.max(0, corruptedNodes.length - 1))];
```
When there are more scouts than corrupted nodes, extra scouts clamp to the last node — but they all independently apply `cleanseRate` without any stacking boost. This is accidental co-operation with no synergy reward.

### New behavior
1. Build a pre-pass assignment map so we know how many scouts target each node.
2. Apply a synergy multiplier when multiple scouts share a node.
3. Route idle scouts (no corruptor, no unassigned corrupted node) to already-targeted nodes rather than patrolling.

### Full rewrite of `src/game/subsystems/scouts.ts`

Replace the entire file with the following. The structure is identical — only the sweep-node section and its pre-pass are new.

```ts
import { SCOUT } from "@/game/balance";
import { addProjectile } from "@/game/factories";
import type { GameState } from "@/game/types";
import { clamp, dist } from "@/game/utils";

function scoutAvoidance(state: GameState, sx: number, sy: number): { ax: number; ay: number } {
  let ax = 0, ay = 0;
  for (const enemy of state.enemies) {
    if (enemy.role === "corruptor") continue;
    const dx = sx - enemy.x;
    const dy = sy - enemy.y;
    const d = Math.hypot(dx, dy);
    if (d < SCOUT.avoidRadius && d > 0) {
      const strength = (SCOUT.avoidRadius - d) / SCOUT.avoidRadius;
      ax += (dx / d) * strength;
      ay += (dy / d) * strength;
    }
  }
  return { ax, ay };
}

export function stepScouts(state: GameState) {
  const corruptors = state.enemies.filter((enemy) => enemy.role === "corruptor");
  const corruptedNodes = [...state.nodes]
    .filter((node) => node.corruption > 8 && node.kind !== "gold")
    .sort((a, b) => b.corruption - a.corruption || a.id - b.id);
  const liveScouts = Math.min(
    state.scouts.length,
    state.upgrades.scout,
    SCOUT.capBase + (state.upgrades.scout >= SCOUT.capBoostThreshold ? SCOUT.capBoostAmount : 0)
  );

  // Pre-pass: determine which corrupted node each active scout without a corruptor target would sweep.
  // This lets us compute synergy multipliers before the main loop applies cleanse.
  const nodeAssignCounts = new Map<number, number>(); // nodeId → number of scouts assigned
  if (corruptors.length === 0 && corruptedNodes.length > 0) {
    for (let i = 0; i < liveScouts; i++) {
      // Mirror the assignment logic below: scouts without a prior corruptor target get a node.
      // If there are fewer corrupted nodes than live scouts, extra scouts pile onto the last node.
      const nodeIndex = Math.min(i, corruptedNodes.length - 1);
      const nodeId = corruptedNodes[nodeIndex].id;
      nodeAssignCounts.set(nodeId, (nodeAssignCounts.get(nodeId) ?? 0) + 1);
    }
  }

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
      const preferredRange =
        SCOUT.preferredRangeBase +
        state.upgrades.scout * SCOUT.preferredRangePerScout +
        state.upgrades.arsenal * SCOUT.preferredRangePerArsenal;

      if (d > preferredRange) {
        const spd = scout.speed + state.upgrades.scout * SCOUT.speedPerScout + state.upgrades.arsenal * SCOUT.speedPerArsenal;
        scout.x += (dx / d) * spd;
        scout.y += (dy / d) * spd;
        scout.task = "Intercepting";
      } else {
        const orbit = Math.sin((state.timers.tick + scout.id * 19) / 14) * 0.9;
        scout.x += (-dy / d) * orbit;
        scout.y += (dx / d) * orbit;
        scout.task = "Purging";
      }

      if (d <= preferredRange + 10 && scout.cooldown <= 0) {
        const damage =
          SCOUT.damageBase +
          state.upgrades.scout * SCOUT.damagePerScout +
          state.upgrades.arsenal * SCOUT.damagePerArsenal;
        scout.cooldown = Math.max(
          SCOUT.cooldownFloor,
          Math.round(
            SCOUT.cooldownBase -
            state.upgrades.scout * SCOUT.cooldownPerScout -
            state.upgrades.arsenal * SCOUT.cooldownPerArsenal
          )
        );
        addProjectile(state, scout.x, scout.y, interceptTarget.x, interceptTarget.y, "rgba(220, 170, 255, 0.95)", 2.4, 8);
        interceptTarget.hp -= damage;
        interceptTarget.flash = 7;
      }

      return;
    }

    // Route to corrupted node. If no uncontested node exists, double-up on the most-corrupted one
    // rather than patrolling — cooperative cleanse is intentional.
    const sweepNode = corruptedNodes.length > 0
      ? corruptedNodes[Math.min(index, corruptedNodes.length - 1)]
      : null;

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
        const baseCleanseRate = SCOUT.cleanseRateBase + state.upgrades.arsenal * SCOUT.cleanseRatePerArsenal;
        // Synergy: each additional scout on the same node adds 60% of base cleanse rate.
        const assignedCount = nodeAssignCounts.get(sweepNode.id) ?? 1;
        const synergy = 1 + (assignedCount - 1) * SCOUT.cleanseSynergyPerExtra;
        sweepNode.corruption = clamp(sweepNode.corruption - baseCleanseRate * synergy, 0, 100);
        if (sweepNode.corruption <= 3) {
          sweepNode.corrupted = false;
          sweepNode.corruptedBy = null;
        }
      }

      scout.task = "Sweeping";
      return;
    }

    // Patrol — no threats, no corrupted nodes.
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
```

**Key changes vs original:**
- Pre-pass `nodeAssignCounts` map built when corruptors are absent.
- `sweepNode` assignment simplified: always `corruptedNodes[Math.min(index, length - 1)]`, which naturally double-ups.
- Cleanse application multiplies by `synergy = 1 + (assignedCount - 1) * SCOUT.cleanseSynergyPerExtra`.

---

## Change 4 — Changelog + version bump

### `package.json`
Change `"version": "0.1.0"` → `"version": "0.1.1"`.

### `src/changelog.ts`
Add a new entry at the **top** of the `CHANGELOG` array (before the current v0.1.0 entry):

```ts
{
  version: "0.1.1",
  badge: "Slow Burn",
  summary: "Economy and drone rebalance. Slower pacing, weaker early drones, and cooperative cleanse synergy.",
  sections: [
    {
      title: "Balance",
      items: [
        "All upgrade growth rates increased — costs compound harder past level 15",
        "Ore income reduced; XP gain rate lowered for a longer mid-game",
        "Spawn intervals and wave budgets reduced — early game is calmer",
        "Prestige gates raised — prestige is now a meaningful milestone",
      ],
    },
    {
      title: "Anti-Corruption Drones",
      items: [
        "Drone movement speed roughly halved — they drift rather than zip",
        "Base cleanse rate halved; arsenal upgrades matter more",
        "Active drone cap starts at 2 (was 3); 4th active unlocks at scout level 8",
        "Multiple drones on the same corrupted node now cleanse faster (cooperative synergy)",
      ],
    },
  ],
},
```

---

## Verification checklist

1. `npm test` — confirm no assertions break (progression constants may have test coverage).
2. `npm run dev` — start the preview server.
3. Fresh run: confirm the first few minutes feel calmer. Workers should be active before the first big wave.
4. Admin panel (space × 5): set speed to 4×. Watch ~10 minutes compressed. Confirm tier advancement feels stretched relative to before.
5. Admin panel: spawn 2 corruptors near the same node cluster. Confirm two scouts converge on the same node and the corruption bar drops visibly faster than a single scout would.
6. Confirm scout movement — drones should visibly drift across the map, not dart.
7. No TypeScript errors (`npm run build` or `tsc --noEmit`).
