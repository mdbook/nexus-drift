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
- `WORKER_SLOTS_BY_LEVEL[level]` — slot count allowed by colony progression. The second unit deploys at **sector level 22** and the third unit at **sector level 42**.
- `WORKER_SLOT_UNLOCK_RESOURCE_COSTS[level]` — extra flux/core surcharge that `nextUpgradeCost()` applies when a worker-track purchase lands exactly on a slot-unlock level (`flux: 18 / cores: 4` at level 3; `flux: 55 / cores: 14` at level 6).
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

## Worker Suggestion (4.0 soft player nudge)

`suggestWorkerToNode(state, nodeId, clickXY?)` in `src/game/interactions.ts` stamps the nearest eligible worker (active, alive, not corrupted/rebooting/disabled, **not currently evading**) with `Agent.suggestedTarget = { kind: "node", id, expiresAt }`, expiring after `WORKER_AI.suggestionExpiryTicks` (120).

`suggestWorkerHome(state, agentId)` (4.0 Phase 3 — the worker inspect popover's "Send home" button) is the only other writer: it stamps `{ kind: "home", expiresAt: tick + 60 }` on a specific worker (same fleeing/rebooting/disabled skip) and drops its current `target` so `chooseWorkerTarget` re-evaluates from scratch. `chooseWorkerTarget` only consumes `kind: "node"` markers, so a `"home"` marker is a soft "stand down and re-pick per AI" — never a hard command — and the AI can immediately re-select any eligible node. These two helpers are the only writers of `suggestedTarget`.

`chooseWorkerTarget` reads the suggestion as a **soft preference applied after the sticky block**: a live suggestion outranks sticky retarget, but it never bypasses the safety filters. The suggested node is honored only if it still exists, its path threat stays `<= WORKER_AI.suggestionMaxPathThreat` (0.05, same `threatAlongPath` scale as flee retargeting), and it is not in the non-miner corruption hard-avoid band. On rejection (unsafe / gone), expiry, or arrival (within `WORKER_AI.suggestionArrivalRadius`, 26 px) the nudge is cleared and normal scoring resumes.

**Trace invariant:** the suggested pick only overrides the local `chosenId` — it draws no rng, adds no candidate, and still flows through the single `ctx.recordWorkerTarget({...})` emit at the end of `chooseWorkerTarget`. Do not add an early `return` for the suggested id. See [sim-harness.md](sim-harness.md) and `src/sim/__tests__/trace.test.ts`.

The suggestion lives only in `chooseWorkerTarget`; `chooseFleeDirectionTarget` is untouched, so **flee/evasion behavior always wins** — a nudged worker under active threat still flees per the Flee-Retarget Invariant.

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
