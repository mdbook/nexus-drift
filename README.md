# Nexus Drift

Nexus Drift is an autonomous sci-fi colony sim wallpaper that runs as a React app. Workers mine, raiders harass the colony, turrets defend the perimeter, and scout craft purge toxic corrupters before they rot the economy.

## Development

```bash
npm install
npm run dev
```

The app uses Vite, React, TypeScript, Tailwind, Framer Motion, and local shadcn-style UI primitives.

## Build

```bash
npm run build
```

## Docker

Build and run the HTTP container:

```bash
docker build -t nexus-drift .
docker run --rm -p 8080:80 nexus-drift
```

Or use compose:

```bash
docker compose up --build
```

The production image serves the static build with Nginx on port `80`. TLS can sit in front of it via your reverse proxy.

## Project Layout

- `reference/`: preserved single-file reference artifact
- `src/game/`: simulation types, constants, factories, selectors, and step functions
- `src/components/`: SVG field renderer, sidebar panels, and HUD primitives
- `src/hooks/`: React loop glue around the simulation engine
- `docker/`: Nginx configuration for SPA serving

