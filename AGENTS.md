# AGENTS.md

## Repo Guidance

- Keep `README.md` and `handoff.md` aligned with real architecture, commands, and player-facing behavior.
- If you change the sim structure, release flow, controls, or build path, update the docs in the same pass.
- Treat `src/changelog.ts` as the source for the in-game release history.

## Release Monitoring

Agents working in this repo should actively watch for changes that are large enough to justify a new release suggestion.

- Do not silently bump versions unless the user explicitly asks for release work.
- Do suggest a next version in your final response when the work clearly crosses a release boundary.
- When suggesting a version, mention why in one short sentence.

## Versioning Heuristics

The project is still pre-1.0. Use semver-style suggestions with that in mind.

- Suggest `0.1.x` for contained bug fixes, docs, tooling, or small polish that does not materially change the player experience.
- Suggest `0.2.0` for a meaningful player-facing feature, balance pass, UI pass, or a bundled set of smaller improvements that together feel release-worthy.
- Suggest the next minor after that for another clear milestone of similar weight.
- Suggest `1.0.0` only when the project feels intentionally stable as a release product, not just interesting as a prototype.

## When To Raise A Release Suggestion

Raise a version suggestion when one or more of these land:

- a new gameplay system or mechanic
- a broad balance or progression pass
- a major visual or UX refresh
- a meaningful architecture milestone that changes how the project is maintained
- a release-history update that clearly represents a new milestone build

## Release Work Checklist

If the user asks for a release or version bump, check and update these together as needed:

- `package.json`
- `src/changelog.ts`
- `README.md`
- `handoff.md`

If the user does not ask for release work, keep the suggestion advisory only.
