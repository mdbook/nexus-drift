# AGENTS.md

This is the entry point for agents working in `nexus-drift`. It covers the procedural rules — docs, commits, releases, verification. **System reference content lives in [`docs/agent/`](docs/agent/INDEX.md)**; load only the shards relevant to the task at hand to keep context tight.

## Repo Guidance

- [`docs/agent/INDEX.md`](docs/agent/INDEX.md) maps tasks → which shard files to read. Start there.
- `src/changelog.ts` is the in-game release history and a useful quick-scan of what has changed recently — read it alongside the relevant shard to understand the current state of the project.
- Keep `README.md`, the `docs/agent/` shards, `package.json`, and `src/changelog.ts` aligned. If architecture, commands, or player-facing behavior changes, update docs in the same pass.
- `src/changelog.ts` must match `package.json` version.
- Every non-trivial change should have a matching `src/changelog.ts` entry. If work is folded into an existing release version, update that version's entry instead of leaving the changelog behind.
- Ignore `.claude/` in both git status and agent summaries. It is local tooling noise; ESLint already ignores it.
- If the user does not specify a new release boundary, assume follow-up work belongs to the current in-flight release and keep expanding that version's changelog entry.

## Always Update Docs (Every Change)

After every change that lands — feature, fix, refactor, tooling, anything non-trivial — update repo documentation in the same pass, before considering the work done:

- **`README.md`** — update if the change alters player-facing behavior, architecture summary, available components, commands, or contributor guidance.
- **`docs/agent/<shard>.md`** — update the shard(s) whose system you changed. Add new components, subsystems, or concepts here so the next agent sees them. If a new concept doesn't fit any existing shard, add a new shard and link it from [`docs/agent/INDEX.md`](docs/agent/INDEX.md).
- **`AGENTS.md`** — update only if the change alters how future agents should work in this repo (new procedural rule, new verification step). Do not put system-reference content here.

This is **separate from release work**. Even if no version bump is happening, the docs must stay current every pass. Version bumps, `package.json`, and `src/changelog.ts` only get touched when the user explicitly asks for release work (see Release Work Checklist below).

If a change genuinely needs no doc update in one of the three places, say so explicitly in your summary so the user can confirm — do not silently skip.

## Committing Changes (Commit, Don't Push)

Agents should **commit regularly** as they work. The default cadence is one commit per logical unit of work: a feature, a bug fix, a refactor, a docs pass, a release bump. Do not batch unrelated changes into a single commit.

- **Commit every time a logical unit of work completes** — after tests and lint pass, after docs are updated, before moving on.
- **Never push** (`git push`, `git push --force`, etc.) unless the user explicitly asks. Committing keeps history clean and recoverable locally; pushing is the user's decision.
- **One topic per commit.** Bug fix, doc update, and new feature are three commits, not one.
- **Follow the repo's existing commit message style.** Imperative mood, short subject line, optional body explaining the "why" rather than the "what". Look at `git log --oneline` for recent examples.
- **Do not skip hooks** (`--no-verify`, etc.) unless the user explicitly asks.
- **Do not amend commits that have already been pushed.** Check `git status` for "Your branch is ahead" before any amend.

If a user asks for work across multiple logical units in a single message, commit them separately as you complete each one.

## Pre-Commit Verification (Run All Four Gates)

Before any commit — and especially before any push — run the same four gates that CI runs in its `verify` stage. If any fails, fix it in the same commit; don't ship with a known-red gate.

```
npm run typecheck
npm run lint
npm run format:check
npm test
```

- **`format:check` is non-negotiable.** CI runs `prettier --check .` against the entire repo, not just files the current change touched. Pre-existing format drift in unrelated files will fail the build the moment any commit lands. If `format:check` reports drift in files outside your change, run `npx prettier --write <files>` (or `npm run format` for the whole repo) and fold the formatting fix into a dedicated commit titled e.g. `Apply prettier to <files>`.
- **Run all four before pushing.** `lint` and `format:check` are independent gates that have caught drift `test` does not see.
- If you only have time for one gate, run `format:check` — it has the highest false-negative rate locally because IDE-on-save formatting can mask drift that exists on disk for files you haven't opened.

The CI `verify` stage is `format:check` + `lint` + `typecheck` + `test` (see `.gitlab-ci.yml`). Treat them as a unit; do not drop any of them when editing CI either.

## Release Monitoring

Agents working in this repo should actively watch for changes large enough to justify a new release suggestion.

- Do not silently bump versions unless the user explicitly asks for release work.
- Do suggest a next version in your final response when the work clearly crosses a release boundary.
- When suggesting a version, mention why in one short sentence.

## Versioning Heuristics

The project uses semver. As of 2.0 the leading `0.` prefix was dropped — the current major line is `3.x`.

- **Patch bump** (e.g. `3.2.4 → 3.2.5`) for contained bug fixes, docs, tooling, or small polish that does not materially change the player experience.
- **Minor bump** (e.g. `3.2.x → 3.3.0`) for a meaningful player-facing feature, balance pass, UI pass, or a bundled set of smaller improvements that together feel release-worthy.
- **Major bump** (e.g. `3.x → 4.0.0`) only for a deliberate large step-change — a new primary game mode, a total visual identity refresh, or an architecture change that breaks saves on purpose.

Do not re-introduce the `0.` prefix. The 2.0.0 schema migration rolled every historical release forward by one dot (old `0.1.5` → new `1.5.0`, old `0.0.1` → new `0.1.0`, etc.).

## When To Raise A Release Suggestion

Raise a version suggestion when one or more of these land:

- a new gameplay system or mechanic
- a broad balance or progression pass
- a major visual or UX refresh
- a meaningful architecture milestone that changes how the project is maintained

## Release Work Checklist

If the user asks for a release or version bump, update these together:

- `package.json`
- `package-lock.json` — run `npm install` after bumping `package.json`. The lockfile embeds the version at both `"version"` and `"packages.\"\""` and will otherwise sit stale (this has happened before — a later review caught a lockfile still on the previous version). Confirm the diff is limited to the version fields unless you also intentionally changed deps.
- `src/changelog.ts`
- `README.md`
- The relevant `docs/agent/<shard>.md` files — update any system-reference content that changed in the release.

If the user does not ask for release work, keep the suggestion advisory only.

## Test Count References

The total test count is quoted in two places: `README.md` under `## Testing`, and [`docs/agent/operations.md`](docs/agent/operations.md) under `## Test Coverage`. When you add or remove tests, update both in the same pass — stale counts are easy to miss because nothing fails if they drift. Re-run `npx vitest run` to get the authoritative count (the summary line prints `Tests N passed`); don't estimate from `git diff`.

## Where To Look

| If you're working on…                                               | Read                                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Workers / movement / corruption / reboot                            | [docs/agent/workers.md](docs/agent/workers.md)                         |
| Enemies / shields / multi-class targeting                           | [docs/agent/enemies.md](docs/agent/enemies.md)                         |
| Turrets / missile silos / scouts / sentinels / disable              | [docs/agent/defenses.md](docs/agent/defenses.md)                       |
| Economy / mining / autobuy / prestige / city                        | [docs/agent/economy.md](docs/agent/economy.md)                         |
| Random events / achievements / activity log / notifications / admin | [docs/agent/events-achievements.md](docs/agent/events-achievements.md) |
| Save schema / migration / entity spawn-death fields                 | [docs/agent/persistence.md](docs/agent/persistence.md)                 |
| Responsive layout / HUD / tooltips / breakpoints                    | [docs/agent/layout.md](docs/agent/layout.md)                           |
| Core simulation / `advanceGame` / project structure                 | [docs/agent/architecture.md](docs/agent/architecture.md)               |
| CI / Docker / Pages / version banner / commands                     | [docs/agent/operations.md](docs/agent/operations.md)                   |
| Outstanding work / TODO queue                                       | [docs/agent/roadmap.md](docs/agent/roadmap.md)                         |
| Quick task → file mapping                                           | [docs/agent/INDEX.md](docs/agent/INDEX.md)                             |
