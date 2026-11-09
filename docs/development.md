# Development

## Setup

You need Node.js 20 or newer (CI and the Docker image use 20) and npm.

```bash
npm ci
npm run dev      # Vite dev server, reachable on your LAN
```

## Scripts

```bash
npm run typecheck     # type checking
npm test              # unit tests (335 tests)
npm run lint
npm run format:check
npm run build         # typecheck + production build into dist/
npm run preview       # serve dist/ on port 4173
npm run sim           # headless simulation harness (below)
```

## Testing

335 tests across `src/game/__tests__/`, `src/sim/`, and `src/lib/`. See [docs/agent/operations.md](agent/operations.md) for the per-file breakdown.

## Beta indicator

`npm run dev` and any host whose name starts with `nexus-drift-beta` show an amber `BETA` pill next to the version button, a tinted favicon, and a `[BETA]` title prefix. Detection lives in `src/lib/isBetaBuild.ts`.

## Simulation harness

A read-only, headless runner for the sim core, so the game can be run off-screen and its state/telemetry exported deterministically for balance analysis - no browser, no changes to gameplay logic. Lives in `src/sim/` and reuses the existing pure core (`createInitialGameState` + `advanceGame` + `computeDerived`).

```bash
# Snapshot the derived metrics at specific ticks (deterministic for a given seed)
npm run sim -- --seed 42 --ticks 200 --snapshot 50,100,200

# Periodic snapshots, include the full GameState, write to a file
npm run sim -- --seed 42 --ticks 5000 --every 500 --state --out run.json

# Capture autobuy + worker-target decision traces (why each choice was made)
npm run sim -- --seed 42 --ticks 5000 --trace --out run.json
```

`--seed` and `--ticks` are required; `--snapshot <csv>` and/or `--every <n>` pick which ticks to capture (default: just the final tick); `--state` adds the full `GameState` (heavy - default is the lightweight `DerivedState` only); `--trace` captures decision traces into `result.traces` (opt-in, behavior-neutral - the sim is byte-identical with tracing off); `--out <path>` writes JSON to a file instead of stdout. Export uses plain `JSON.stringify` and reloads through the existing `migrateGameState` path. See [`docs/agent/sim-harness.md`](docs/agent/sim-harness.md) for the full API and design.

## Build and deploy

```bash
npm run build

# Docker (Nginx serves the static build on port 80)
docker build -t nexus-drift .
docker run --rm -p 8080:80 nexus-drift

# Compose (same thing on http://localhost:8080)
docker compose up --build
```

The repo also deploys a static preview to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`). It sets `GITHUB_PAGES=true` so Vite uses `base: "/nexus-drift/"`. Normal builds keep `base: "/"`.

## CI

GitLab CI runs:

- **verify**: `npm ci`, `npm run typecheck`, `npm run format:check`, `npm run lint`, `npm test`
- **image build**: a Kaniko build that publishes the container image
- **notifications**: success and failure alerts

Release images are built only for `main` and `dev`. Each build publishes the commit SHA, `:latest`, and the exact `package.json` version tag (`dev` also keeps `:dev`). CI fails if that version tag already exists, so a version can't be silently retargeted.
