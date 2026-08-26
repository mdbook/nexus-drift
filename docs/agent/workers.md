# Workers

**Source files:** `src/game/subsystems/workers.ts`, `src/game/subsystems/movement.ts`, `src/game/subsystems/workerCorruption.ts`, `src/game/ai/workerTargeting.ts`, `src/game/balance.ts` (`WORKER_*`, `WORKER_AI`, `WORKER_ABILITIES`, `WORKER_BLOCKING`, `WARDEN`)
**Tests:** `src/game/__tests__/advanceGame.test.ts`, `src/game/__tests__/aiBehavior.test.ts`
**Key invariants:** 9 slot-backed agents (slot 0 active); only `stepWorkerSlots` activates (never deactivates); guard every iter on `agent.active`; combat death routes through reboot, never instant-teleport.

## Agents

Kinds: `miner`, `runner`, `drone`. Each kind has **3 slots** (9 agents total). Slot 0 starts active. The `active: boolean` field on `Agent` controls deployment — inactive agents are skipped by all sim logic and hidden in the renderer.

`state.agents` always contains exactly 9 slot-backed agents. A recovered lost drone is the one explicit exception: it appends a permanent extra active drone beyond the slot system. Do not try to fold the recovered lost drone back into `WORKER_SLOTS_BY_UPGRADE`.

## Slot Activation

Late-game slots are intentionally gated through two parallel checks: an upgrade-track gate and a sector-level gate.

- `WORKER_SLOTS_BY_UPGRADE[kind][upgradeLevel]` — slot count allowed by that worker track's upgrade level. Level 3 unlocks slot 1; level 6 unlocks slot 2.
- `WORKER_SLOTS_BY_LEVEL[level]` — slot count allowed by colony progression. The second unit deploys at **sector level 10** and the third unit at **sector level 22** (4.1: pulled in from 22 / 42 as part of the Tier-0 deadlock fix, so mining isn't single-worker for hours once the economy is unblocked).
- `WORKER_SLOT_UNLOCK_RESOURCE_COSTS[level]` — extra surcharge that `nextUpgradeCost()` applies when a worker-track purchase lands exactly on a slot-unlock level (`gold: 80 / ore: 150` at level 3; `gold: 500 / ore: 900` at level 6). **4.1:** redenominated from the old flux+cores surcharge — flux/cores only drop from `minTier >= 1` enemies, so at Tier 0 the surcharge was unearnable and froze miner/drill at L2 (the economy deadlock). Gold+ore are earnable from tick 1 and give abundant ore a real early sink.
- `stepWorkerSlots()` in `subsystems/workers.ts` runs after `stepEconomy` and reconciles `agent.active` against the **minimum** of the upgrade gate and the level gate. It only ever activates, never deactivates — workers stay in the field once deployed.

All subsystems that iterate `state.agents` must guard on `agent.active` before processing. Check combat, movement, mining, and zapper targeting when touching those subsystems. `FieldSvg.tsx` filters `game.agents` to active-only before rendering. Migration always defaults `agent.active ?? true` so existing 3-agent saves load cleanly.

## Target Selection

`chooseWorkerTarget` / `scoreWorkerNode` in `src/game/ai/workerTargeting.ts` choose nodes via a scored selection function. Factors:

- Distance.
- Kind preference (per-kind `harvestBias` nudges tier-1 vs off-tier).
- Path threat sampled at start / midpoint / destination via `threatAlongPath`.
- Explicit close-enemy count around the node (`nodeThreatRadius` / `nodeThreatCrowdPenalty`).
- Corruption tolerance — non-miners hard-avoid heavily corrupted nodes.
- Node progress (`workTicks` bonus for nodes actively being mined).
- A current-target finish bonus for partially mined nodes.
- A contested-by-evading-workers penalty (quadratic — third worker on a node is a strong deterrent).
- Region-distance penalty biasing each kind toward its preferred field sector.

Target selection filters to **live enemies** before scoring — death-fade enemies stay visual-only and cannot affect path threat, node crowding, or flee-direction retargeting.

The sticky retarget threshold is 0.64 — a candidate must be much better before it unseats the current assignment. Partially mined current nodes also get `currentTargetProgressBonus`.

## Worker Suggestion (4.0 player nudge, 4.1.0 responsive, 4.5.0 firm orders)

`suggestWorkerToNode(state, nodeId, clickXY?)` in `src/game/interactions.ts` stamps the nearest eligible worker (active, alive, not corrupted/rebooting/disabled, **not currently evading**) with `Agent.suggestedTarget = { kind: "node", id, createdAt }`, where `createdAt` is the stamp tick. Expiry is wrap-safe: `elapsedTicks(now, createdAt) >= WORKER_AI.suggestionExpiryTicks` (600 as of 4.1.0 — was 120), matching the house `elapsedTicks` idiom.

**4.1.0 responsiveness (Fix 1).** Two changes make a tap actually feel like it does something:

- **Immediate retarget (movement.ts).** `agent.suggestedTarget?.kind === "node"` is now part of the `needsTarget` condition (`movement.ts` ~L223), so the worker re-decides its target on the very next tick after a nudge instead of waiting out its slow `330 + agent.id * 45` (~330–690t) retarget window. Previously the ~120t expiry lapsed before that window came around, so the nudge felt dead.
- **Persist until acted on (workerTargeting.ts).** `suggestionExpiryTicks` bumped 120 → 600 so a nudge survives until acted on. The order is cleared on: arrival, the node being **gone**, true time-expiry, or (4.5.0) the corruption carve-out below. _(4.5.0 supersedes the old "unsafe path is a transient rejection, retained and retried" behavior — the order is now firm-committed regardless of path threat, so there is nothing to retry; see **4.5.0 FIRM COMMIT** below. `WORKER_AI.suggestionMaxPathThreat` is no longer read by the honor block.)_

`chooseWorkerTarget` applies the node suggestion **after the sticky block**, overriding only the local `chosenId`.

**4.5.0 FIRM COMMIT (rework).** A `kind:"node"` suggestion is now a **hard order**, not a soft preference. When the ordered node still exists, `chooseWorkerTarget` sets `chosenId = suggestedId` **firmly — without the per-tick `pathThreat` eligibility gate** the 4.x soft nudge used. That gate re-litigated the order every tick: a `pathThreat` flip toggled the worker honored↔pending (the flicker), and when it rejected, the worker silently re-scored onto a **different** node — the operator's "clicked gold A → worker went to gold B" bug. Both are gone; the worker commits and stays committed.

- **Safety via the evade branch, not order-refusal.** The firm order does not make a worker suicidal: `movement.ts`'s evade branch runs first and returns early, so a firmly-ordered worker still flees a real threat and the order (target) persists so it **returns** after dodging. `chooseFleeDirectionTarget` is untouched.
- **Corruption carve-out (retained safety gate).** Selection already blocks stamping a non-miner on a heavily-corrupted node, but a node can **become** corrupted after commit (corruption spreads). So in the honor block, if the committed worker is a non-miner AND `suggestedNode.corruption > WORKER_AI.corruptionHardAvoidAbove`, the order is **cancelled** (`suggestedTarget` cleared, normal AI resumes) rather than committed into corruption. This is the only per-tick eligibility check kept; the `pathThreat` check was dropped.
- **Arrival-clear on the MINING radius, not the marker radius (A3 fix).** The order is cleared only once the worker is within the **mining contact radius** for the node — `dist < Math.max(MINING.contactRadiusMin, node.size * MINING.contactRadiusRatio)`, the same expression `stepMining` uses (mining.ts) so the two agree. The old `suggestionArrivalRadius` (26 px) cleared ~2 px before the worker was in mining range (24 px), so it "arrived", the marker dropped, and normal AI walked it back off before it ever mined. (`suggestionArrivalRadius` is still used for the `kind:"home"` arrival check below.)

**4.5.0 single-owner + cancel.**

- **Single owner per node.** Before stamping the chosen worker, `suggestWorkerToNode` clears any **other** worker whose `kind:"node"` suggestion points at the same node id, so a re-click (which can pick a different nearest worker) never leaves two workers cued to one node with a stale line on the loser.
- **Cancel / undo.** `cancelWorkerOrderToNode(state, nodeId)` clears every worker ordered to that node and returns true — `App.tsx onNodeClick` calls it **first**, so clicking a node a worker is already ordered to **toggles the order off** instead of re-stamping. `cancelWorkerOrder(state, agentId)` clears a specific worker's node order and backs the worker inspect popover's **"Cancel order"** action (shown while that worker carries a `kind:"node"` suggestion). (Operator actions are free as of 4.5.1, so neither a cancel nor a fresh order touches energy.)

**4.4.1 corruption-eligibility gate (bug fix).** Candidate selection now mirrors the sim's corruption hard-block so the nudge only lands on a worker that can actually accept the clicked node. In `chooseWorkerTarget`, a non-miner is hard-blocked from a heavily-corrupted suggested node (`corruptionBlocked = agent.kind !== "miner" && node.corruption > WORKER_AI.corruptionHardAvoidAbove`, threshold 20) — and when blocked the nudge is **retained but never applied**. Before 4.4.1, `suggestWorkerToNode` picked the nearest worker of **any** kind, so clicking a corrupted node (gems corrupt most readily — highest `corruptibleKindsBiasWeight`) whose nearest worker was a non-miner (runner/drone) stamped a `suggestedTarget` the sim rejected every tick: `FieldSvg` drew the cyan "tasked" lead line while the worker kept mining its current node. The selection loop now skips a candidate when `node.corruption > WORKER_AI.corruptionHardAvoidAbove && agent.kind !== "miner"`, so `best` is the nearest **eligible** worker (a miner, or — for a non-corrupted node — any kind, unchanged). If no eligible worker exists, `suggestWorkerToNode` returns `false`, so the existing refusal cue fires. `pathThreat` is deliberately **not** mirrored here (transient/enemy-based — the retained-retry path already handles it). Only miners mine corrupted nodes, so this matches what the sim will actually do. (Note: `stepMining` counts all active worker kinds as miners of a node, but that is orthogonal — the corruption hard-block is what rejects the non-miner's _movement_ toward the node.) (4.4.1 originally also framed this as "the nudge energy was spent for nothing"; the action-energy economy was removed in 4.5.1, so the remaining point is the dead cyan line, now fixed.)

**Visible tasking (Fix 1c, honest line hardened in 4.4.2).** While a worker carries an active `kind: "node"` suggestion, `FieldSvg.tsx` surfaces a cue to the tasked node. As of 4.4.2 the cue is **honest** — it distinguishes whether the sim is actually honoring the nudge, derived purely from existing state (no new field):

- **Honored** (`isSuggestionHonored(agent, leadActive?)` in `interactions.ts` — a pure predicate, true iff `agent.suggestedTarget?.kind === "node" && agent.target === Number(agent.suggestedTarget.id) && agent.evadeTicks <= 0 && !leadActive`): the subtle **cyan** lead line from the worker to the node **plus** a solid marker ring. The line draws ONLY in this state, so it always traces a REAL path the worker is on. **4.5.0** added the `evadeTicks <= 0` and `!leadActive` reads: under firm-commit `agent.target` stays pinned to the order even while the worker is dodging (evade) or being lead-dragged, so without these the cyan line would point at a node the worker is actively moving **away** from. `FieldSvg` passes `Boolean(game.leadPoint)` as `leadActive`.
- **Pending / not honored** (stamped but not currently honored — a non-miner still awaiting an eligible commit, or the worker is evading / being lead-dragged): a distinct **amber, dashed** ring on the node and **no lead line**. This is the "not on that path right now" feedback — the click visibly registers without drawing a phantom path. When the worker settles back onto the ordered node (`agent.target` == suggested, not evading, no lead), the cue becomes the cyan line automatically.

Both cues follow the §Coarse-Pointer FX Budget — rings pulse only at full FX (the pending ring at a gentler low frequency), static under `useLowFxMode` / `reduceFx`. The fix is **presentation-only**: `isSuggestionHonored` is a pure read never called on the sim/headless path, `agent.target` vs `agent.suggestedTarget` are both existing state, so decision-trace neutrality and save schema are untouched. The hard-refusal cue in `App.tsx` `onNodeClick` ("No free worker to reroute there.", from `suggestWorkerToNode` returning `false`) is unchanged and covers the different "the nudge was never stamped" case. (The 4.4.0 "Not enough energy" refusal cue was removed in 4.5.1 — operator actions are free, so an energy-refusal can never happen.)

### Forced Send-home (4.1.0, Fix 2)

`suggestWorkerHome(state, agentId)` (worker inspect popover's "Send home") is now a **real command**, not the 4.0/4.0.1 soft stand-down. It stamps a **persistent** `suggestedTarget = { kind: "home", createdAt }` (same fleeing/rebooting/disabled/corrupted skip) and nulls `target`. `"home"` is re-added to the `suggestedTarget.kind` union (`"node" | "enemy" | "home"`).

- **Routing (movement.ts).** When `suggestedTarget.kind === "home"`, the worker's destination is overridden to `homeX/homeY` (reusing the recovering-destination pattern) with arrival radius `WORKER_AI.suggestionArrivalRadius`. The marker **persists — no time expiry** — and is cleared only when the worker reaches home, after which normal AI resumes. Task reads `"Returning"` en route.
- **Flee still wins.** The home override sits **after** the evade branch (which returns early), so a real threat still makes the worker flee first; the return only replaces the normal destination.
- **`chooseWorkerTarget` ignores `"home"`** — it only ever consumes `kind: "node"`, so a home-commanded worker still scores a harmless fall-through node target that the movement-layer home routing overrides.

`suggestWorkerToNode` / `suggestWorkerHome` are the only writers of `suggestedTarget`.

**Trace invariant:** the suggested pick only overrides the local `chosenId` — it draws no rng, adds no candidate, and still flows through the single `ctx.recordWorkerTarget({...})` emit at the end of `chooseWorkerTarget`. Do not add an early `return` for the suggested id. See [sim-harness.md](sim-harness.md) and `src/sim/__tests__/trace.test.ts`.

**Headless neutrality:** `suggestedTarget` (both `node` and `home`) is written ONLY by the UI helpers in `interactions.ts`, never on the headless/replay path. So the new immediate-retarget trigger (`movement.ts`) and the home routing are always inert in a headless run → retarget cadence and destinations there are byte-identical. `chooseFleeDirectionTarget` is untouched, so **flee/evasion behavior always wins** — a nudged worker under active threat still flees per the Flee-Retarget Invariant.

### Press-and-hold Lead (4.3.0, 4.5.0 de-twitch)

`state.leadPoint?: { x, y }` is a transient world-space point the operator holds/drags on the field ("lead your workers"). While it is set, `stepWorkers` (movement.ts) gives every **eligible non-fleeing** worker a strong continuous pull toward it.

- **Placement.** The lead block sits **after the evade branch's early return** and **after the reboot/disabled/corrupted early returns** — so a worker fleeing a real threat (or rebooting/disabled/corrupted) never sees it. **Flee/survival always wins**, exactly like the Send-home routing. It is also gated `!recovering`, so a hurt worker still prioritizes limping home to heal.
- **Steer, not teleport.** Each tick the worker steps toward the point by `min(distanceToPoint, agent.speed × speedMod × WORKER_LEAD.pullSpeedScale × veteranBonus × falloff × blocking.speedScale)` — clamped to world bounds and to never overshoot (settles at the point, no jitter). Task reads `"Following"`.
- **Distance falloff.** `falloff = WORKER_LEAD.falloffRadius / (dist + falloffRadius)` → 1 at the point, 0.5 one `falloffRadius` out, tapering beyond. Nearer crews respond harder; distant crews still drift in slowly. Tuning in `balance.ts` (`WORKER_LEAD`, defaults `falloffRadius: 260`, `pullSpeedScale: 1.5`).
- **Only writers.** `setLeadPoint` / `clearLeadPoint` in `interactions.ts` are the only writers, called only from the UI pointer handlers (App `onLeadStart` / `onLeadMove` / `onLeadEnd`). It clamps into the field.

**4.5.0 de-twitch + stuck-lead safety.**

- **Tap-vs-drag thresholds raised (`LEAD_GESTURE`).** `holdMs` 150 → **350**, `moveThresholdPx` 8 → **14** (`balance.ts`; read by `shouldEnterLeadMode` in `lib/leadGesture.ts`). The old values promoted an ordinary tap — especially on touch, where a fingerpress jitters a few px and lingers past 150 ms — into a lead-drag, swallowing the intended node-order / worker-inspect tap and lurching every worker to the finger. These are UI-gesture constants; gestures never fire on the sim/headless path, so this is inert there.
- **Stuck-lead safety release (`FieldSvg.tsx`).** Pointer capture is acquired only at promotion, so a press released during the pre-promotion window whose `pointerup`/`pointercancel` never reaches the SVG (pointer left the element, a child swallowed it, the hold-timer promoted after the finger lifted, a tab switch, a window blur) could latch the lead gesture with no terminating event — stranding `state.leadPoint` so every worker swarmed a stale point indefinitely. A global `useEffect` installs window `pointerup`/`pointercancel`/`blur` + document `visibilitychange` backstops that force-clear any in-flight gesture (releasing capture + calling `onLeadEnd` when it had promoted). Listeners are removed on unmount (no leaks); the handler is idempotent with the normal `onFieldPointerUp` path.

**Trace/headless neutrality:** `state.leadPoint` is UI-only-set (never headless/replay), so in a headless run it is always `undefined` and the whole lead block is a strict no-op — it does not run before `chooseWorkerTarget`, draws no rng, and touches no trace emit. The physical steer never perturbs the targeting decision or its single `recordWorkerTarget` record. Transient like `suggestedTarget`: defaulted `undefined` on init, cloned per tick, dropped on load (no SCHEMA bump). See `src/game/__tests__/leadPoint.test.ts` and [layout.md](layout.md) for the input gesture + FX marker.

## Per-Agent Variance

Each `Agent` carries three float fields seeded at spawn by a deterministic hash of `agent.id`:

- `speedMod` (±12% from 1.0) — multiplies traversal and evade speed alongside the veteran bonus.
- `fearMod` (±20% from 1.0) — multiplies `pathFearScale * WORKER_AI.pathSafetyPenalty` in `scoreWorkerNode`.
- `harvestBias` (±0.15 additive) — nudges tier-preference score multipliers.

## Class Abilities

Constants in `WORKER_ABILITIES`, `balance.ts`.

- **Miner overclock** (`overclockTicks`): increments each tick the miner is at a node with `damageTicks === 0`; resets on leaving or taking a hit. Once `overclockTicks >= overclockThresholdTicks` (120), `stepMining` adds `overclockCritBonus` (0.10) to the crit roll. The counter clears when the node is mined out.
- **Runner sprint** (`sprintTicks`, `sprintCooldown`): when a runner is evading with `panic > sprintPanicThreshold` (40) and `sprintCooldown === 0`, sprint fires: `sprintTicks = 90`, `sprintCooldown = 600`. While `sprintTicks > 0`, evade and traversal speed are multiplied by `sprintSpeedMult` (1.5).
- **Drone scan** (passive): `chooseWorkerTarget` pre-computes which resource nodes have an active drone within `droneScanRadius` (100 px). For those nodes, the `corruptionSoftMultiplier` (1.9) is reduced by `droneScanCorruptionDiscount` (0.15), making corrupted-but-covered nodes slightly less aversive for non-miner workers.

## Self-Defense Retaliation

At the end of each `stepCombat` worker-damage loop, if the worker is not recovering (`hp >= maxHp * 0.6`), not disabled, and not corrupted, it deals `WORKER_ABILITIES.retaliateBase (0.35) + upgrades.bot * retaliatePerBot (0.05)` damage to each attacker via `damageEnemy`. This routes through the existing `damageEnemy` funnel so shield absorption applies. Retaliation is suppressed for corrupted workers since they cannot self-defend. **Cloak is intentionally not consulted by retaliation** — that's how `warden_killed` kill credit reaches the achievement; do not add a cloak filter there.

## Personalities and Territories

`WORKER_PERSONALITY`, `WORKER_REGIONS` in `balance.ts`.

- **Miner** — left sector (cx 200, cy 250), brave (`pathFearScale 0.60`), pushes through moderate threats.
- **Runner** — mid-field (cx 500, cy 280), moderate courage, loose territory.
- **Drone** — right sector (cx 780, cy 240), cautious (`pathFearScale 1.30`), takes safer routes.

Each kind has a `groupRepelRadius` and `groupRepelMinCount`. When that many same-kind peers are nearby, a centroid-repulsion force (scaled with crowd size) disperses the cluster. Applied after the per-frame separation pass in `movement.ts`.

When `hp < maxHp * 0.5` (hurt but not yet in full recovery), workers nudge toward their region center each tick (`lowHpPull`) instead of all converging on the home pad.

## Evasion

Workers proactively avoid threats but not too aggressively. Tuning:

- Enter radius: 62 px. Exit radius: 104 px. Persistence: 52 ticks.
- `WORKER_AI.pathSafetyPenalty`: 34.
- Workers at their node use a tighter `harvestingEvasionRadius` (42 px) so they finish a harvest under mild pressure.
- Direction blends 70% old heading / 30% new signal for smooth curves.

**Harvesting stubbornness** (worker stays put under light pressure): harvesting workers ignore one or two nearby enemies until `damageTicks` shows actual damage. Three or more nearby enemies still force early evasion. This rule is scoped to active node work — workers that are already recovering, disabled, or away from a node use the normal evasion logic.

**Surround pressure**: close-combat damage scales up when multiple attackers are already in contact, and `COMBAT.detectionRadius` is intentionally a bit wider to reduce slip-through cases. If you touch worker combat, keep the multi-attacker pressure behavior intact so surrounded workers do not escape trivially.

**Panic cascade**: evade persistence scales super-linearly with attacker count — `(Math.pow(n, 1.5) - 1) * EVADE_BONUS_PER_THREAT`. A single pursuer barely extends evasion; a real three-enemy surround compounds hard.

**Flee-direction retargeting**: workers in persistent evasion with no immediate threat periodically call `chooseFleeDirectionTarget()` to look for a safe node ahead along `evadeDx/evadeDy`. Candidates behind the worker, outside the flee lane, too far ahead, or behind a high-threat path are rejected. Keep flee retargeting opportunistic — do not let it override active panic survival or recovery behavior.

**Spook memory**: the moment `agent.evadeTicks` decays to 0 in `stepMovement`, set `agent.spookedTicks = WORKER_AI.spookedDuration` (240) and force an immediate `chooseWorkerTarget(state, agent)` call (do not let sticky retarget keep the worker on its old target). While `spookedTicks > 0`, `scoreWorkerNode` multiplies both `pathSafetyPenalty` and `nodeThreatCrowdPenalty` by `WORKER_AI.spookedThreatMultiplier` (×2.5). Decays one tick per frame outside of evasion; re-armed every time evasion ends. Reset to 0 when the worker dies or reboots.

Each worker carries `threatMemory` (EMA of local enemy threat) to drive regroup behavior.

## Speed Tiers

Tightened so flee/work/damaged/traversing don't read as gear shifts. Maxed-panic evade multiplier caps at 1.06× base work speed. `WORKER.recoverySpeed` 0.78, `damagedSpeed` 0.82, `traversingSpeed` 0.88. Sprint cooldown (`WORKER_ABILITIES.sprintSpeedMult = 1.5`) and per-worker `speedMod` variance are intentional bursts / spawn-time flavour.

## Worker Hitbox Blocking

`stepWorkers()` treats live enemy bodies as physical obstacles. `WORKER_BLOCKING` radii in `balance.ts` slow workers in crowded hostile lanes.

- The layer is **slowdown-only** — it must not apply a hidden knockback force that shoves workers away from nearby enemies.
- Use live enemies only. Dying enemies (`hp <= 0`) still fade out visually, but must not block movement.
- Keep blocking radii aligned with the rendered body sizes in `FieldSvg.tsx` if you tune worker or enemy visuals.

`Agent.tx` / `Agent.ty` are destination/render anchors, not authoritative velocity. If resources or a future moving-node type ever move during the sim tick, update node positions before worker movement/blocking and derive velocity-sensitive behavior from actual `x/y` deltas.

## Worker Death And Reboot

When a worker's HP reaches 0 in `stepCombat`, the combat-death path sets `rebootTicks = WORKER.respawn.rebootDuration` (180 ticks ≈ 6 s), emits `state.workerDeathFlash`, and returns without teleporting. `movement.ts` parks the worker at home, linearly regens HP over the reboot window, and on expiry sets `spawnTick` and logs "worker redeployed".

**Do not write the old instant-teleport-and-55%-HP path back.**

`workerDeathFlash` is a transient `GameState` field (`{ x, y, ticks, maxTicks } | null`). It is always `null` in `createInitialGameState` and `migrateGameState`. Its tick-down lives inside `stepCombat` before the cadence guard so it runs every frame, not just on combat ticks. A charging SVG ring in `FieldSvg.tsx` shows reboot progress.

Veteran ranks: kills nearby → speed bonus + visual chevron.

## Worker Corruption (Warden System)

Late-game (tier ≥ 4) subsystem `stepWorkerCorruption` (in `subsystems/workerCorruption.ts`) runs three phases each tick after `stepCorruption`:

### 1. Warden attach (`stepWardenAttach`)

Each live warden seeks the closest non-corrupted, non-rebooting active worker within `WARDEN.attachRadius` (18 px) and increments `agent.corruptingTicks`. When `corruptingTicks >= WARDEN.attachTicks` (210), the worker converts:

- `corrupted = true`
- `corruptionTicks = 0`
- `maxHp = round(WARDEN.workerBaseHp * WARDEN.corruptToughnessMult)` (150) — sentinels need more cleanse shots to down a corrupted worker
- The warden is **spliced directly from `state.enemies`** without going through `resolveEnemyDeaths` — no gold reward, and `wardensKilled` is not incremented.

Stale partial attach progress decays by 0.5/tick even if a different worker has become the nearest warden candidate.

Wardens that successfully corrupt a worker are removed without death rewards. Wardens killed by combat units _before_ attach completes do count toward `wardensKilled` and trigger the `warden_killed` achievement.

### 2. Corrupted worker tick (`stepCorruptedWorkers`)

Each corrupted worker sets `task = "Corrupted"`, increments `corruptionTicks`, ticks down `spottedTicks`, and drains nearby resource nodes at rate `WARDEN.drainRatePerTick * (1 + corruptionTicks / WARDEN.drainRampDivisor)`. Nodes at 0 hp are respawned immediately (non-gold) or removed (temporary) without awarding resources.

Corrupted workers skip all normal pathfinding (`movement.ts` returns early on `agent.corrupted`) and are immune to enemy contact damage (`stepCombat` guards on `agent.corrupted`).

### 3. Worker reporting (`stepWorkerReporting`)

"Healthy" reporters — active workers that are not corrupted and not in the reboot window — within `WARDEN.workerReportRadius` (120 px, ×1.4 for drones) of a corrupted worker set that agent's `spottedTicks = WARDEN.workerReportDuration` (600). Rebooting cleanse survivors do not report. Any sentinel treats a corrupted worker as visible while `spottedTicks > 0`, regardless of distance. The scan does not short-circuit on `spottedTicks > 0`, so a reporter standing next to a corrupted agent pins the timer at max instead of letting it decay out.

## Warden Spawning

`stepWardenSpawn` in `spawns.ts`, wired in `advanceGame` after `stepSpawns`. Gates on `tier >= WARDEN.wardenSpawnTierThreshold` (4).

`state.timers.warden` increments only while the field is eligible for a new infestation. If a live warden is already on the field **or** the fleet has ≤ 1 healthy worker remaining (`active && !corrupted && rebootTicks === 0`), the timer resets to 0. This "always keep one healthy worker" invariant scales with the player's fleet — early-game (3 workers) blocks the second warden once two are corrupted; late-game (9 workers) allows up to 8 simultaneous corruptions. Two simultaneous corruptions are reachable; the `void_outbreak` (3+) achievement stays hard but legitimate. When the eligible timer reaches `WARDEN.wardenSpawnIntervalTicks` (3600 ≈ 2 min), a warden spawns and the timer resets.

## Sentinel Cleanse

Sentinels check for visible corrupted workers (`dist <= WARDEN.corruptionVisionRadius (140)` OR `spottedTicks > 0`) before regular enemy targeting. On finding one, the sentinel moves toward it and fires a purple cleanse beam (projectile color `rgba(192,132,252,0.9)`) using its normal cooldown and damage.

On the shot that drops the worker's HP to ≤ 0:

- Corruption cleared (`corrupted = false`, resets `corruptionTicks` / `corruptingTicks`).
- `maxHp` reset to `WARDEN.workerBaseHp` (100 — undoing the attach-time toughness buff).
- HP restored to the new maxHp.
- `rebootTicks = WARDEN.corruptionRebootTicks` (1800 ≈ 60 s).
- `WARDEN.cleanseFluxReward` (6) flux and `WARDEN.cleanseCoreReward` (2) cores awarded.
- `state.stats.corruptedPurified` increments.

Worker reboot parks the agent at homeX/homeY, skips all sim logic, and restores HP to maxHp when the counter hits 0. The admin `clearCorruptedWorkers` command uses the same maxHp restoration path.

## Corruption Visual

In `FieldSvg.tsx`, corrupted workers render with a purple body fill (`rgba(120,40,180,0.55)`) and a pulsing void-purple outer ring. Shake amplitude scales with `corruptionTicks` (up to 3 px). While a warden is mid-attach (`corruptingTicks > 0`), a dashed amber warning ring scales with attach progress. Rebooting workers render at 45% opacity.

## Related Stats

New stat fields: `corruptedWorkerOutbreakTicks` (running ticks with 3+ simultaneous corrupted workers — drives the `void_outbreak` achievement; resets to 0 when count drops below 3).
