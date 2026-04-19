# M4 — "Long Watch" (v0.1.4)

## Prerequisites
M1, M2, and M3 must be merged first. This milestone assumes all prior systems (flux, cores, sentinels, events, new enemies) are stable.

Ship this milestone as its own commit. Update `src/changelog.ts` and `package.json` to `0.1.4`.

---

## Codebase orientation

Key files touched this milestone:
- `src/hooks/useGameLoop.ts` — pause-on-tab-hidden
- `src/App.tsx` — persistence (save/load), Konami code, achievements ribbon, "drift" keyword, speed presets
- `src/game/types.ts` — achievement state, worker veteran data, cosmetic worker type
- `src/game/factories.ts` — tourist/lost worker factories
- `src/game/subsystems/workers.ts` (or `movement.ts`) — veteran rank tracking, tourist worker movement
- `src/components/FieldSvg.tsx` — day/night palette, worker veteran chevrons, tourist worker, particle bursts
- `src/game/achievements.ts` — new file for achievement definitions
- `localStorage` — save/load serialization

---

## Change 1 — Pause on tab hidden (`src/hooks/useGameLoop.ts`)

Currently the RAF loop ticks even when the tab is hidden, causing a large catch-up burst on refocus and wasting CPU/battery.

Find the RAF loop (around line 20–48). Add a `visibilitychange` listener that pauses the accumulator:

```ts
// Inside the hook, add alongside the existing useEffect:
useEffect(() => {
  const onVisibility = () => {
    if (document.hidden) {
      // Store the time we went hidden; we'll discard elapsed time on return
      hiddenAtRef.current = performance.now();
    } else if (hiddenAtRef.current !== null) {
      // On return: reset lastTime so the accumulator doesn't see the hidden gap
      lastTimeRef.current = performance.now();
      hiddenAtRef.current = null;
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => document.removeEventListener("visibilitychange", onVisibility);
}, []);
```

Add `hiddenAtRef = useRef<number | null>(null)` alongside existing refs. In the RAF callback, also add an early return if the tab is hidden:
```ts
if (document.hidden) {
  animFrameRef.current = requestAnimationFrame(tick);
  return;
}
```

---

## Change 2 — Persistence (localStorage save/load)

### 2a. Save every 30 seconds

In `useGameLoop.ts`, add a save timer alongside the RAF loop:

```ts
const SAVE_INTERVAL_MS = 30_000;
const lastSaveRef = useRef(0);

// Inside the RAF tick, after advancing game state:
const now = performance.now();
if (now - lastSaveRef.current > SAVE_INTERVAL_MS) {
  lastSaveRef.current = now;
  try {
    localStorage.setItem("nexusDriftSave", JSON.stringify(gameStateRef.current));
  } catch {
    // Storage quota exceeded or private mode — fail silently
  }
}
```

### 2b. Load on startup

In `App.tsx` (or wherever initial state is created), attempt to load from localStorage:

```ts
function loadSavedState(): GameState | null {
  try {
    const raw = localStorage.getItem("nexusDriftSave");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    // Minimal validation: check version compatibility
    if (!parsed.resources || !parsed.upgrades) return null;
    return parsed;
  } catch {
    return null;
  }
}

// In initial state creation:
const initialState = loadSavedState() ?? createInitialState();
```

### 2c. "Fresh run" button

In `App.tsx`, add a small "New Game" button (can be in the admin panel or as a subtle corner UI element):

```tsx
<button
  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
  onClick={() => {
    localStorage.removeItem("nexusDriftSave");
    window.location.reload();
  }}
>
  New Game
</button>
```

**Important:** Ensure that when loading a saved state, all new fields added across M1–M4 are initialized with defaults if missing (for save file forward-compatibility):
```ts
function migrateState(state: GameState): GameState {
  // Fill in any fields that might be missing from older saves
  state.resources.cores ??= 0;
  state.resources.flux ??= 0;
  state.activeEvents ??= [];
  state.eventModifiers ??= { yieldMultiplier: 1, energyRate: 1, turretCooldownScale: 1, turretRangeScale: 1, enemySpeedScale: 1, corruptionRate: 1, fluxPurgeMultiplier: 1 };
  state.upgrades.foundry ??= 0;
  state.upgrades.sentinel ??= 0;
  state.upgrades.archive ??= 0;
  state.sentinels ??= makeSentinels();
  state.achievements ??= {};
  return state;
}
```

---

## Change 3 — Achievements system

### 3a. Achievement definitions (new file `src/game/achievements.ts`)

```ts
export type AchievementId =
  | "first_prestige" | "kill_100_enemies" | "kill_10_brutes"
  | "all_events" | "max_foundry" | "max_archive"
  | "tier_5" | "tier_8" | "long_watch" | "drift_heard"
  | "first_core" | "tourist_spotted";

export type AchievementDef = {
  id: AchievementId;
  label: string;
  description: string;
};

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: "first_prestige",   label: "Clean Slate",      description: "Complete your first prestige reset." },
  { id: "kill_100_enemies", label: "Century",           description: "Destroy 100 enemies." },
  { id: "kill_10_brutes",   label: "Heavy Lifting",     description: "Destroy 10 Brutes." },
  { id: "all_events",       label: "Strange Tides",     description: "Experience all 7 random events in a single run." },
  { id: "max_foundry",      label: "Overclock",         description: "Reach Foundry level 10." },
  { id: "max_archive",      label: "Deep Memory",       description: "Reach Archive level 10." },
  { id: "tier_5",           label: "Pressure Front",    description: "Reach threat tier 5." },
  { id: "tier_8",           label: "Siege Protocol",    description: "Reach threat tier 8." },
  { id: "long_watch",       label: "Long Watch",        description: "Keep the colony alive for 1 hour." },
  { id: "drift_heard",      label: "Residual Signal",   description: "The drift remembers." },
  { id: "first_core",       label: "Fragment Zero",     description: "Recover your first Core fragment." },
  { id: "tourist_spotted",  label: "Taking Notes",      description: "Spot the tourist drone." },
];
```

### 3b. Achievement state in `GameState` (`src/game/types.ts`)

Add to `GameState`:
```ts
achievements: Partial<Record<AchievementId, true>>;
stats: {
  totalEnemiesKilled: number;
  brutesKilled: number;
  eventsExperienced: Set<string>;  // or string[] — use Array for JSON serialization
  runtimeMs: number;               // total real-time ms the colony has been alive
};
```

Initialize in factories:
```ts
achievements: {},
stats: { totalEnemiesKilled: 0, brutesKilled: 0, eventsExperienced: [], runtimeMs: 0 },
```

### 3c. Increment stats in subsystems

- `totalEnemiesKilled`: in `resolveEnemyDeaths` (combat.ts), increment for each killed enemy.
- `brutesKilled`: same, filter by `enemy.kind === "brute"`.
- `eventsExperienced`: in events.ts, when a big event fires: `state.stats.eventsExperienced = [...new Set([...state.stats.eventsExperienced, chosen.id])]`.
- `runtimeMs`: in `useGameLoop.ts`, add elapsed ms each tick.

### 3d. Achievement unlock check

Add a function (call from `stepEconomy` or a new `stepAchievements`) that checks and unlocks:

```ts
// src/game/subsystems/achievements.ts (new file)
import { ACHIEVEMENT_DEFS } from "@/game/achievements";
import type { GameState } from "@/game/types";
import { pushLog } from "@/game/utils";

export function stepAchievements(state: GameState) {
  function unlock(id: string) {
    if (state.achievements[id as keyof typeof state.achievements]) return;
    state.achievements[id as keyof typeof state.achievements] = true;
    const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
    if (def) state.log = pushLog(state.log, `Achievement unlocked: ${def.label}`);
  }

  if (state.prestige >= 1) unlock("first_prestige");
  if (state.stats.totalEnemiesKilled >= 100) unlock("kill_100_enemies");
  if (state.stats.brutesKilled >= 10) unlock("kill_10_brutes");
  if (state.stats.eventsExperienced.length >= 7) unlock("all_events");
  if (state.upgrades.foundry >= 10) unlock("max_foundry");
  if (state.upgrades.archive >= 10) unlock("max_archive");
  if (state.resources.cores >= 1) unlock("first_core");
  if (state.stats.runtimeMs >= 3_600_000) unlock("long_watch");  // 1 hour
}
```

Wire into `advanceGame.ts` — call `stepAchievements(state)` near the end.

### 3e. Achievements ribbon UI (`src/App.tsx`)

Add a thin ribbon below the resource bar:

```tsx
{Object.keys(state.achievements).length > 0 && (
  <div
    className="flex gap-1.5 overflow-x-auto px-3 py-1 cursor-pointer"
    onClick={() => setAchievementsOpen(true)}
    title="View achievements"
  >
    {Object.keys(state.achievements).map(id => {
      const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
      return (
        <span key={id} className="text-xs px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-200 border border-indigo-700/30 whitespace-nowrap">
          {def?.label ?? id}
        </span>
      );
    })}
  </div>
)}
```

Add a modal for the full achievements panel (similar to the changelog modal):
```tsx
{achievementsOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setAchievementsOpen(false)}>
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
      <h2 className="text-lg font-semibold text-white mb-4">Achievements</h2>
      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
        {ACHIEVEMENT_DEFS.map(def => {
          const unlocked = !!state.achievements[def.id];
          return (
            <div key={def.id} className={`flex gap-3 items-start p-2 rounded ${unlocked ? "bg-indigo-900/30 text-white" : "opacity-40 text-gray-400"}`}>
              <span className="text-lg">{unlocked ? "✓" : "○"}</span>
              <div>
                <div className="text-sm font-medium">{def.label}</div>
                <div className="text-xs text-gray-400">{def.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
)}
```

---

## Change 4 — Easter eggs

### 4a. Konami code — synthwave palette

In `App.tsx`, add a Konami code listener:

```ts
const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
const konamiRef = useRef<string[]>([]);
const [synthwave, setSynthwave] = useState(false);

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    konamiRef.current = [...konamiRef.current, e.key].slice(-KONAMI.length);
    if (konamiRef.current.join(",") === KONAMI.join(",")) {
      setSynthwave(v => !v);
      konamiRef.current = [];
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

Apply the palette via a CSS class on the root element:
```tsx
<div className={`... ${synthwave ? "synthwave" : ""}`}>
```

In your CSS (or Tailwind config), add a `.synthwave` override that swaps the color palette — e.g. hot-pink/cyan/purple tones on backgrounds, text, and borders.

Also unlock the "Residual Signal" achievement when Konami fires:
```ts
setSynthwave(v => {
  if (!v) {
    setGameState(prev => {
      const next = cloneGameState(prev);
      next.achievements["drift_heard"] = true;
      next.log = pushLog(next.log, "Synthwave protocol engaged.");
      return next;
    });
  }
  return !v;
});
```

### 4b. "drift" keyword listener

In `App.tsx`, track consecutive typed characters:

```ts
const driftRef = useRef("");

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    driftRef.current = (driftRef.current + e.key).slice(-5).toLowerCase();
    if (driftRef.current === "drift") {
      setGameState(prev => {
        const next = cloneGameState(prev);
        next.log = pushLog(next.log, "The drift remembers.");
        next.achievements["drift_heard"] = true;
        return next;
      });
      driftRef.current = "";
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

### 4c. Tourist worker cosmetic

The tourist is a non-functional worker that wanders the field. It appears after city stage 5 has been active for 15 real-time minutes.

Add to `GameState`:
```ts
touristWorker: { x: number; y: number; angle: number; active: boolean } | null;
```

In `useGameLoop.ts` (or `stepEvents`), check the condition and activate:
```ts
// In stepEvents or economy:
const minutesAlive = state.stats.runtimeMs / 60_000;
if (!state.touristWorker && derived.cityStage >= 5 && minutesAlive >= 15) {
  state.touristWorker = { x: -30, y: 300, angle: 0, active: true };
}
```

Update the tourist's position each tick (add to a lightweight step or inline in advanceGame):
```ts
if (state.touristWorker?.active) {
  const t = state.touristWorker;
  // Wander sinusoidally across the field
  t.x += 0.3;
  t.y = 300 + Math.sin(state.timers.tick / 45) * 80;
  t.angle = Math.atan2(Math.cos(state.timers.tick / 45) * 80 / 45, 0.3);
  // Reset when they exit the field
  if (t.x > 1050) t.x = -30;
}
```

Render in `FieldSvg.tsx`:
```tsx
{state.touristWorker?.active && (() => {
  const t = state.touristWorker!;
  return (
    <g transform={`translate(${t.x}, ${t.y}) rotate(${(t.angle * 180) / Math.PI})`}>
      <circle r={5} fill="#fde68a" stroke="#f59e0b" strokeWidth={1} />
      {/* Tiny camera shape */}
      <rect x={5} y={-3} width={6} height={4} rx={1} fill="#374151" />
      <circle cx={8} cy={-1} r={1.5} fill="#60a5fa" />
    </g>
  );
})()}
```

When the tourist is first spotted (visible on screen), unlock the "tourist_spotted" achievement. Check by seeing if `touristWorker.x > 0 && touristWorker.x < 1024`:
```ts
// In stepAchievements:
if (state.touristWorker?.active && state.touristWorker.x > 0 && state.touristWorker.x < 1024) {
  unlock("tourist_spotted");
}
```

### 4d. "Lost worker" — permanent bonus drone at tier 9+

At tier 9+, there's a 1% chance per big-event roll to find a lost drone. It joins the colony permanently.

Add to `GameState`:
```ts
lostWorkerFound: boolean;
```

In events.ts, inside the big-event roll section, add after the event fires:
```ts
const derived = computeDerived(state);
if (!state.lostWorkerFound && derived.progression.tier >= 9 && state.rng.chance(0.01)) {
  state.lostWorkerFound = true;
  // Spawn a 4th worker from the edge
  // (Requires adding a 4th worker to agents array — currently 3 workers are hardcoded)
  // Add a new worker of kind "drone" starting at x:-30, y:300 with task "Traversing"
  const lostWorker = makeWorker("drone", state.agents.length + 1);
  lostWorker.x = -30;
  lostWorker.y = 300;
  state.agents.push(lostWorker);
  state.log = pushLog(state.log, "A damaged drone emerged from the outer zone — folded into the roster.");
}
```

`makeWorker` would be a new small helper in factories.ts that creates a worker from a `WorkerKind`. Currently workers are created inline; extract them if not already factored.

---

## Change 5 — Day/night cycle (`src/components/FieldSvg.tsx`)

The cycle is 30 real-time minutes (1800 seconds). It's purely visual.

### 5a. Pass runtime to FieldSvg

In the props or derived state passed to `FieldSvg`, include:
```ts
runtimeMs: state.stats.runtimeMs,
```

### 5b. Compute day phase in FieldSvg

```ts
const DAY_CYCLE_MS = 30 * 60 * 1000;  // 30 minutes
const dayPhase = (runtimeMs % DAY_CYCLE_MS) / DAY_CYCLE_MS;  // 0.0 = dawn, 0.5 = noon, 1.0 = midnight
const nightFactor = Math.sin(dayPhase * Math.PI * 2) * 0.5 + 0.5;  // 0 = darkest night, 1 = full day
```

### 5c. Apply to sky/background

In the SVG background rect (or `Background.tsx`), interpolate the fill color:

```tsx
// dayFactor ranges 0 (night) to 1 (day)
const skyLight = Math.round(nightFactor * 18);   // 0 to 18
const skyColor = `rgb(${skyLight}, ${skyLight + 4}, ${skyLight + 10})`;

<rect width={WORLD_W} height={WORLD_H} fill={skyColor} />
```

For the city buildings, darken windows at night (most windows dark, a few lit):
```tsx
const windowOpacity = 0.05 + nightFactor * 0.2;  // dimmer at night
```

For ambient effect, add a soft overlay for "night" (deep blue gradient):
```tsx
{nightFactor < 0.5 && (
  <rect
    width={WORLD_W} height={WORLD_H}
    fill="rgba(15, 20, 60, 0.4)"
    opacity={1 - nightFactor * 2}   // fades in as night deepens
    style={{ pointerEvents: "none" }}
  />
)}
```

### 5d. Event probability modifier for night

In `events.ts`, pass `nightFactor` to the event roll (computed from `state.stats.runtimeMs`):
```ts
const dayPhase = (state.stats.runtimeMs % (30 * 60_000)) / (30 * 60_000);
const isNight = Math.sin(dayPhase * Math.PI * 2) < 0;

// Adjust weights for night events:
const adjustedWeight = (def: EventDef) => {
  if (isNight && (def.id === "xeno_bloom" || def.id === "dust_storm")) return def.weight * 1.8;
  return def.weight;
};
```

---

## Change 6 — Public speed presets

Currently speed is only accessible via the admin panel. Add discrete preset buttons to the main UI (e.g. in the sidebar or as a small toolbar):

```tsx
const speeds = [1, 2, 4];
const [speedPreset, setSpeedPreset] = useState(1);

// In game loop, multiply tick accumulation by speedPreset
// (In useGameLoop.ts, the fixed-step accumulator already supports a speed multiplier;
//  if it doesn't, add one by scaling the delta: effectiveDelta = delta * speedPreset)
```

UI:
```tsx
<div className="flex gap-1">
  {[1, 2, 4].map(s => (
    <button
      key={s}
      className={`text-xs px-2 py-0.5 rounded border ${speedPreset === s ? "bg-white/10 border-white/30 text-white" : "border-white/10 text-gray-400 hover:text-white"}`}
      onClick={() => setSpeedPreset(s)}
    >
      {s}×
    </button>
  ))}
</div>
```

Pass `speedPreset` to `useGameLoop` (or store in a ref accessible to the tick function).

---

## Change 7 — Worker veteran ranks

Workers track nearby kills and gain a visual rank badge at thresholds.

### 7a. Add to `Agent` type (`src/game/types.ts`)
```ts
killsNearby: number;   // enemies killed while worker was at node (roughly)
veteranRank: 0 | 1 | 2 | 3;
```
Initialize both to `0` in the worker factory.

### 7b. Increment kill count (`src/game/subsystems/combat.ts`)

In `resolveEnemyDeaths`, when a combat enemy dies, check if any worker is within 120 units:
```ts
for (const agent of state.agents) {
  if (dist(agent.x, agent.y, enemy.x, enemy.y) < 120) {
    agent.killsNearby = (agent.killsNearby ?? 0) + 1;
  }
}
```

### 7c. Rank up thresholds

In `stepAchievements` or a small inline check in `resolveEnemyDeaths`:
```ts
for (const agent of state.agents) {
  const kills = agent.killsNearby ?? 0;
  agent.veteranRank = kills >= 50 ? 3 : kills >= 20 ? 2 : kills >= 5 ? 1 : 0;
}
```

### 7d. Speed bonus
In `src/game/subsystems/movement.ts` (stepWorkers), multiply worker speed by a small bonus:
```ts
const veteranBonus = 1 + (agent.veteranRank ?? 0) * 0.05;
// Multiply movement step speed by veteranBonus
```

### 7e. Render chevrons (`src/components/FieldSvg.tsx`)

Near each worker circle, draw tiny chevron marks based on rank:
```tsx
{agent.veteranRank > 0 && Array.from({ length: agent.veteranRank }).map((_, i) => (
  <path
    key={i}
    d={`M ${agent.x - 3 + i * 3} ${agent.y - 10} l 2 -3 l 2 3`}
    stroke="#fde68a"
    strokeWidth={0.8}
    fill="none"
    opacity={0.7}
  />
))}
```

---

## Change 8 — Version bump + changelog

### `package.json`
```json
"version": "0.1.4"
```

### `src/changelog.ts`
Add at the **top** of `CHANGELOG` (above v0.1.3):
```ts
{
  version: "0.1.4",
  badge: "Long Watch",
  summary: "Save persistence, day/night cycle, achievements, easter eggs, and idle-friendly UX polish.",
  sections: [
    {
      title: "Idle-Friendly",
      items: [
        "Colony state saves to localStorage every 30 seconds — restores on page reload",
        "Pause on tab hidden: no catch-up burst when you return to the tab",
        "Speed presets (1×/2×/4×) available directly in the UI",
        "Day/night cycle over 30 real-time minutes with subtle sky and city palette shift",
      ],
    },
    {
      title: "Achievements",
      items: [
        "12 achievements tracked across gameplay milestones",
        "Achievement ribbon in HUD — click to open full panel",
        "Achievements persist across saves",
      ],
    },
    {
      title: "Easter Eggs",
      items: [
        "Konami code toggles synthwave palette",
        "Type 'drift' anywhere to receive a message from the field",
        "A tourist drone wanders through city stage 5 colonies after 15 minutes",
        "At tier 9+, a lost drone may emerge from the outer zone and join your colony permanently",
      ],
    },
    {
      title: "Polish",
      items: [
        "Workers accumulate veteran ranks from nearby kills — gain speed and visual chevrons",
        "Improved event log with color-coded entries",
      ],
    },
  ],
},
```

---

## Verification checklist

1. **Pause-on-hidden**: Open DevTools → switch to another tab for 30s → return. Confirm no large time-skip in game state (colony looks like 30s passed, not 30s of catch-up burst).
2. **Persistence**: Let the game run for 35s, reload the page. Confirm resources, upgrades, and level all restore correctly. Confirm save migrates gracefully (no console errors).
3. **New Game button**: Click "New Game", confirm fresh colony starts at zero.
4. **Konami code**: Type the sequence on keyboard, confirm palette swaps and the event log shows the message.
5. **"drift" keyword**: Focus the browser tab, type the letters d-r-i-f-t. Confirm "The drift remembers." appears in the event log.
6. **Achievements**: Confirm achievements unlock and appear in the ribbon. Open the panel and confirm all 12 are listed (with unearned ones greyed out).
7. **Tourist worker**: Use admin panel to advance to city stage 5 and 4× speed to wait 15 compressed minutes. Confirm the tourist wanders across the field.
8. **Day/night**: At 4× speed, confirm the sky subtly shifts over time.
9. **Speed presets**: Switch between 1×/2×/4× and confirm simulation visibly changes pace.
10. **Worker veteran ranks**: Kill 5+ enemies near one worker (use admin panel to force spawns). Confirm the worker's chevrons appear and they move slightly faster.
11. `npm test` and `npm run build` — zero failures, zero TS errors.
12. Leave at 1× speed for 30 real minutes — no memory leaks, no FPS degradation (target: 60fps throughout).
