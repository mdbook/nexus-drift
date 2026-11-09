# Contributing

Thanks for taking a look. Bug reports and pull requests are welcome.

## Setup

```bash
npm ci
npm run dev
```

You need Node.js 20 or newer.

## Before you open a PR

Run all of these and make sure they pass:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

CI runs the same checks. `npm run format` fixes formatting for you.

## Expectations

- Keep changes small and focused, and add or update tests when behavior changes.
- The simulation is deterministic: use the seeded RNG in `src/game/rng.ts`, not `Math.random`.
- If a change alters player-facing behavior, update the docs and `src/changelog.ts` in the same PR. Keep the `package.json` version and the changelog aligned.
- Details on each system are in [docs/agent/INDEX.md](docs/agent/INDEX.md).
