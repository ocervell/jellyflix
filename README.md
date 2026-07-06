# Jellyflix

A Netflix-style web UI for Jellyfin. React + Vite + TypeScript, talking to a Jellyfin server via @jellyfin/sdk.

![Jellyflix home screen](docs/screenshot.png)

## Features
- **Custom player**: automatic adaptive quality, audio/subtitle selection, scrubber thumbnails (see `docs/trickplay-setup.md`).

## Dev
1. Copy `.env.local` with `VITE_JELLYFIN_SERVER=https://your-server`.
2. `npm install`
3. `npm run dev` — the dev server proxies `/jf` → your Jellyfin server (no CORS setup needed).
4. Log in with your Jellyfin credentials.

## Test
- `npm test` — unit + component tests (Vitest).
- `npm run build` — typecheck + production build.

## Docker
The image serves the built SPA with nginx and reverse-proxies `/jf` → your Jellyfin server (set at runtime via `JELLYFIN_SERVER`).

```bash
# pull the published image
docker run -p 8080:80 -e JELLYFIN_SERVER=https://your-jellyfin ocervell/jellyflix:latest
# …or build + run locally
JELLYFIN_SERVER=https://your-jellyfin docker compose up --build
```

Then open http://localhost:8080 and log in. Published to Docker Hub as `ocervell/jellyflix` by the `publish` workflow on a `v*.*.*` tag (needs `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` repo secrets).

## Architecture
See `docs/superpowers/specs/2026-07-04-jellyflix-design.md` and `docs/superpowers/plans/2026-07-04-jellyflix-implementation.md`.
