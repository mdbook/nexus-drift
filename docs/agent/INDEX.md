# Agent Docs Index

This directory is the canonical reference for working in `nexus-drift`. Each file owns one system and opens with its source-file list, test list, and key invariants so you can decide in 3 seconds whether you need to read it.

Always start at [`AGENTS.md`](../../AGENTS.md) (procedural rules: docs / commits / release / verification). Then load the shard(s) below that match the task at hand.

## Task → Files

| Task                                                                | Read                                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Worker AI / movement / corruption / reboot                          | [workers.md](workers.md) + [persistence.md](persistence.md)                              |
| Adding or changing an achievement                                   | [events-achievements.md](events-achievements.md) + [persistence.md](persistence.md)      |
| Adding any field to `GameState` (or nested types)                   | [persistence.md](persistence.md) (canonical migration checklist)                         |
| CSS / responsive / HUD / tooltip changes                            | [layout.md](layout.md)                                                                   |
| Release work (version bump, changelog, lockfile)                    | [`AGENTS.md` § Release Work Checklist](../../AGENTS.md) + [operations.md](operations.md) |
| Enemy balance / new enemy archetype / shields                       | [enemies.md](enemies.md) + [workers.md](workers.md)                                      |
| Defense balance — turret / silo / sentinel / scout / zapper disable | [defenses.md](defenses.md) + [enemies.md](enemies.md)                                    |
| Economy / mining / autobuy / prestige / city HP                     | [economy.md](economy.md)                                                                 |
| Balance-constant changes / progression tuning audit trail           | [balance-log.md](balance-log.md) + [economy.md](economy.md)                              |
| Random events / event card mechanics                                | [events-achievements.md](events-achievements.md)                                         |
| Activity log / notifications / admin terminal                       | [events-achievements.md](events-achievements.md)                                         |
| CI / Docker / GitHub Pages / version banner / commands              | [operations.md](operations.md)                                                           |
| Core simulation / `advanceGame` / RNG / cloning                     | [architecture.md](architecture.md)                                                       |
| Headless sim runs / analysis harness / CLI / export                 | [sim-harness.md](sim-harness.md) + [architecture.md](architecture.md)                    |
| Project structure / where does X live                               | [architecture.md](architecture.md)                                                       |
| Cross-cutting save migration concerns                               | [persistence.md](persistence.md)                                                         |
| Field Archive / codex / lore entries / hidden-entry unlocks         | [archive-lore.md](archive-lore.md) + [events-achievements.md](events-achievements.md)    |
| What's left to do                                                   | [roadmap.md](roadmap.md)                                                                 |

## Shard Files

- [architecture.md](architecture.md) — core sim spine, project structure, reading order
- [layout.md](layout.md) — responsive layout, HUD, tooltip and indicator conventions
- [workers.md](workers.md) — worker AI, slot activation, evasion, death/reboot, corruption
- [enemies.md](enemies.md) — combat kinds, archetypes, multi-class targeting, shields, warden
- [defenses.md](defenses.md) — turrets, missile silos, scouts, sentinels, disable system
- [economy.md](economy.md) — resources, mining, autobuy, prestige, city
- [balance-log.md](balance-log.md) — audit trail of balance-constant changes (old→new, why, BEFORE/AFTER harness measurements)
- [events-achievements.md](events-achievements.md) — random events, achievements, activity log, notifications, easter eggs, admin terminal
- [archive-lore.md](archive-lore.md) — Field Archive codex, world-lore layer, hidden-entry unlock logic (derived, no save field)
- [persistence.md](persistence.md) — save schema versions, migration checklist, entity spawn/death fields
- [operations.md](operations.md) — local commands, CI, Docker, Pages mirror, beta build, test counts
- [sim-harness.md](sim-harness.md) — headless sim runner, CLI, deterministic export (read-only analysis tooling)
- [roadmap.md](roadmap.md) — outstanding work

## Invariant Hot List

If you're touching simulation code at all, mentally verify against this set before committing. Each lives in detail in the shard linked.

- `advanceGame()` is the single orchestrator; subsystem order is load-bearing — [architecture.md](architecture.md)
- All randomness flows through the seeded `Rng`, never `Math.random()` — [architecture.md](architecture.md)
- `cloneGameState()` is shallow-spread — state stays single-level — [architecture.md](architecture.md)
- Adding a GameState field requires `types.ts` + `factories.ts` (create + migrate) + `cloneGameState` — [persistence.md](persistence.md)
- All enemy damage routes through `damageEnemy`; structure damage through `damageTurret` / `damageScout` / `damageSentinel` / `damageCity` — [enemies.md](enemies.md), [defenses.md](defenses.md), [economy.md](economy.md)
- Cloak checks go through `isCloaked(enemy)`; retaliation paths intentionally do not consult cloak — [enemies.md](enemies.md)
- Worker death sets `rebootTicks` and parks at home — do not re-introduce the instant-teleport path — [workers.md](workers.md)
- `appendLog(state, message, category)` is the only log write path — [events-achievements.md](events-achievements.md)
- `xpForLevel(level)` is the single XP threshold source for both sim and HUD — [economy.md](economy.md)
- Grid/flex children carry `min-w-0`; viewport sizing uses `100dvh` only — [layout.md](layout.md)
- Tick math uses `(tick - last + TICK_WRAP) % TICK_WRAP` — [architecture.md](architecture.md)
