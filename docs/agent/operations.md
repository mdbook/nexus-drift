# Operations — CI, Docker, Pages, Commands

**Source files:** `.gitlab-ci.yml`, `.github/workflows/pages.yml`, `Dockerfile`, `docker/nginx.conf`, `vite.config.ts`, `src/lib/versionCheck.ts`, `public/site.webmanifest`
**Tests:** `src/lib/versionCheck.test.ts`
**Key invariants:** CI `verify` is the four-gate (format/lint/typecheck/test); release builds only from `main` and `dev`; Pages mirror lives at `/nexus-drift/` subpath; no hardcoded `/` paths in TS or `public/*.json`.

## Local Commands

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run lint
npm run build
npm run preview
npm run format:check
```

## Test Coverage

213 tests total across:

- `src/game/__tests__/advanceGame.test.ts` (152) — simulation invariants, subsystem behavior, achievement edge cases, projectile behavior, corruption linger, worker-slot gating/costs, surround-pressure combat, save/load round-trip, turret/scout/sentinel/city HP, multi-class enemy targeting, missile silo subsystem, worker class abilities, worker corruption + warden parasite latch, warden kill credit, sentinel cleanse, worker reboot, `stepWardenSpawn` gates, `xpForLevel` curve pin, `archiveLog` routing/cap/migration.
- `src/game/__tests__/aiBehavior.test.ts` (30) — worker path safety, commitment, flee-direction retargeting, crowded-node avoidance, archetype targeting, brute target stability, squad bucketing, sentinel intercept priority, scout finish-bias, sticky retarget threshold, ambusher dash, ghost reposition, group dispersal, threat-field path weighting, spook memory.
- `src/game/__tests__/interactionAchievements.test.ts` (10) — interaction-driven achievement paths, event HUD linger, anomaly gating, migration of newer interaction fields, manual-override timing.
- `src/game/__tests__/adminCommands.test.ts` (6) — admin resource grants, upgrade mutation, timed event trigger/revert, seeded enemy spawning, corruption cleanup, shell-effect commands for speed/banner.
- `src/game/__tests__/notifications.test.ts` (4) — unified notification queue idempotence, dismissal, visible-window tick gating, post-expiry promotion.
- `src/game/__tests__/persistence.test.ts` (4) — empty-store cold start, save→load round-trip, malformed-JSON fallback, partial-save guard.
- `src/lib/versionCheck.test.ts` (7) — flat-version parsing, preview-version generation, semver comparison, `/version` fetch handling.

When adding or removing tests, update the count in this file in the same pass. Re-run `npx vitest run` to get the authoritative count (the summary line prints `Tests N passed`); don't estimate from `git diff`.

## CI (GitLab) — Four-Gate Verify

`.gitlab-ci.yml` runs:

- **`verify` stage**: `npm ci` → `npm run typecheck` → `npm run format:check` → `npm run lint` → `npm test`. **Treat them as a unit; do not drop any of them when editing CI.**
- **`build` stage**: Kaniko builds and publishes the production container image **from `main` and `dev` only**. Every build gets the commit SHA and the exact `package.json` version tag; `main` additionally moves `:latest`, and `dev` additionally moves `:dev`. `:latest` is `main`-only on purpose — dev pushes must not advance it. CI fails before building if that version tag already exists in the GitLab container registry — do not remove that preflight unless replacing it with an equivalent duplicate-version guard; otherwise a second push with the same version would silently move the release tag.
- **Notification stages** report success or failure.

## Pre-Commit Verification

Run the same four gates locally before any commit — especially before any push. If any fails, fix it in the same commit; don't ship with a known-red gate.

```
npm run typecheck
npm run lint
npm run format:check
npm test
```

- **`format:check` is non-negotiable.** CI runs `prettier --check .` against the entire repo, not just files the current change touched. Pre-existing format drift in unrelated files will fail the build the moment any commit lands. If `format:check` reports drift in files outside your change, run `npx prettier --write <files>` (or `npm run format` for the whole repo) and fold the formatting fix into a dedicated commit titled e.g. `Apply prettier to <files>` so the diff stays reviewable. Do not silently mix formatting churn into a feature/balance commit.
- **Run all four before pushing.** A green local test run is not enough — `lint` and `format:check` are independent gates and have caught drift that tests do not see.
- If you only have time for one gate, run `format:check` — it has the highest false-negative rate locally because IDE-on-save formatting can mask drift that exists on disk for files you haven't opened in this session.

## Docker

Production model: Vite build → Nginx serves `dist/` → reverse proxy handles TLS.

- `Dockerfile` — multi-stage production image build.
- `docker/nginx.conf` — SPA serving config with security headers.

Local Docker verification:

```bash
docker build -t nexus-drift .
docker run --rm -p 8080:80 nexus-drift
# open http://localhost:8080
```

## GitHub Pages Mirror Subpath

The repo mirrors to `github.com/mdbook/nexus-drift` and auto-publishes a static preview to <https://mdbook.github.io/nexus-drift/> via `.github/workflows/pages.yml` on every push to `main`. The Pages build runs `npm run build` with `GITHUB_PAGES=true`, which `vite.config.ts` reads to set Vite `base` to `/nexus-drift/`. Locally and in production `base` stays `/`.

### Subpath rule for asset paths

Because the Pages mirror lives at a subpath, any asset reference that assumes the site is at `/` will break there. **Do not introduce new absolute paths starting with `/` in either application code or in JSON files served from `public/`** (manifests, etc.) — use `import.meta.env.BASE_URL` (Vite rewrites it per build) or a relative path.

- Vite already rewrites absolute paths inside `index.html`, so HTML-side `href="/foo"` is fine.
- The trap is `fetch("/foo")` in TS or `"src": "/foo"` in `public/*.webmanifest`.
- Existing examples to mirror: `VERSION_CHECK_ENDPOINT` in `src/lib/versionCheck.ts` (built from `import.meta.env.BASE_URL`) and the icon `src` in `public/site.webmanifest` (relative path).

## Beta Build Indicator

`src/lib/isBetaBuild.ts` is the single gate: returns true when `import.meta.env.DEV === true` (local dev server) or `window.location.hostname` starts with `nexus-drift-beta` (CI-built beta deploys at `nexus-drift-beta.mdbook.me` / `nexus-drift-beta.*.mdbook.one`). When true:

- Renders an amber `BETA` pill next to the version button in `App.tsx`.
- Swaps only the `<link rel*="icon" type="image/svg+xml">` href in `main.tsx` from `nexus-drift.svg` → `nexus-drift-dev.svg` (raster icons stay pointed at production assets; SVG-capable browsers render the tinted icon and older browsers fall back to the prod raster icon).
- Prefixes the document title with `[BETA]`.

Production builds at `nexus-drift.mdbook.me` / `nexus-drift.*.mdbook.one` are unaffected. To ship fully-branded raster dev icons in the future, add `-dev` variants alongside each raster asset and widen the regex to match them.

## Favicons & Embeds

Favicon assets live across `public/nexus-drift.svg`, `public/nexus-drift.png`, `public/favicon.ico`, `public/favicon-32x32.png`, `public/favicon-16x16.png`, `public/apple-touch-icon.png`, and `public/site.webmanifest`. Social embeds intentionally remain pointed at `public/og-image.png` — do not swap embed art when only the favicon changes.

## ESLint Carve-Outs

ESLint intentionally ignores `.claude/` so local agent configuration and auxiliary worktrees do not create parser-root conflicts during `npm run lint`. ESLint `no-explicit-any` is set to `error` — any `any` will fail the build.

## Header Version Badge

- Opens the in-game changelog (`src/changelog.ts`).
- Click records the hidden `release_reader` achievement.
- Top project chrome carries a GitLab source link beside the version badge.

## Deferred Follow-Ups

Deferred follow-ups for the current release line are listed in the README "Known Deferred Work" section with matching `TODO(<version>)` comments in-source. Do not silently close these out as trivia — each has its own reason it was left for a later release.
