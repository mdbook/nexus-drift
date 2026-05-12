# CLAUDE.md

All agent guidance for this repository lives in [`AGENTS.md`](./AGENTS.md).

Read `AGENTS.md` before starting any work. It covers:

- The primary reading order ([`docs/agent/INDEX.md`](./docs/agent/INDEX.md) → relevant shard(s) → `src/changelog.ts` → source)
- The "always update docs" rule for every change
- Commit/push policy (commit regularly, never push unless asked)
- Release monitoring and versioning heuristics
- The release work checklist

System-reference content (invariants, breakpoint conventions, HUD conventions, save-migration rules, entity spawn/death field rules, etc.) lives under [`docs/agent/`](./docs/agent/INDEX.md), one shard per system area.

If anything here diverges from `AGENTS.md`, `AGENTS.md` is the source of truth.
