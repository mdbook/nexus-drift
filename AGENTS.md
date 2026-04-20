# AGENTS.md

## Repo Guidance

- `handoff.md` is the primary source of context for agents operating in this repo. Read it before starting any non-trivial work.
- Keep `README.md`, `handoff.md`, `package.json`, and `src/changelog.ts` aligned. If architecture, commands, or player-facing behavior changes, update the docs in the same pass.
- `src/changelog.ts` is the source for the in-game release history. It must match `package.json` version.

## Release Monitoring

Agents working in this repo should actively watch for changes that are large enough to justify a new release suggestion.

- Do not silently bump versions unless the user explicitly asks for release work.
- Do suggest a next version in your final response when the work clearly crosses a release boundary.
- When suggesting a version, mention why in one short sentence.

## Versioning Heuristics

The project is still pre-1.0. Use semver-style suggestions with that in mind.

- Suggest `0.1.x` for contained bug fixes, docs, tooling, or small polish that does not materially change the player experience.
- Suggest `0.2.0` for a meaningful player-facing feature, balance pass, UI pass, or a bundled set of smaller improvements that together feel release-worthy.
- Suggest `1.0.0` only when the project feels intentionally stable as a release product, not just interesting as a prototype.

## When To Raise A Release Suggestion

Raise a version suggestion when one or more of these land:

- a new gameplay system or mechanic
- a broad balance or progression pass
- a major visual or UX refresh
- a meaningful architecture milestone that changes how the project is maintained

## Release Work Checklist

If the user asks for a release or version bump, update these together:

- `package.json`
- `src/changelog.ts`
- `README.md`
- `handoff.md`

If the user does not ask for release work, keep the suggestion advisory only.

## Key Invariants (Do Not Break)

- `advanceGame()` is the single simulation orchestrator. Subsystem execution order is documented in that file — read the comments before touching it.
- All simulation randomness must use the seeded `Rng` instance on `GameState`, never `Math.random()`.
- `cloneGameState()` is shallow-spread only. State must stay single-level. Deeper nesting silently breaks cloning.
- Save migration lives in `migrateGameState()` in `factories.ts`. Always stamp `schemaVersion` (the `SCHEMA_VERSION` constant) on the returned state.
- Derived/presentation calculations belong in `selectors.ts`, never inside subsystems.
- ESLint `no-explicit-any` is `error` — any `any` usage will fail the build and CI.

## Test Coverage

24 tests in `src/game/__tests__/advanceGame.test.ts`. They must all pass before any commit. Coverage includes simulation invariants, subsystem targeting behavior, and save/load round-trips. When adding new subsystems or schema changes, add tests in the same commit.
