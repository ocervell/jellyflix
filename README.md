# Jellyflix

A Netflix-style web UI for Jellyfin. React + Vite + TypeScript, talking to a Jellyfin server via @jellyfin/sdk.

## Dev
1. Copy `.env.local` with `VITE_JELLYFIN_SERVER=https://your-server`.
2. `npm install`
3. `npm run dev` — the dev server proxies `/jf` → your Jellyfin server (no CORS setup needed).
4. Log in with your Jellyfin credentials.

## Test
- `npm test` — unit + component tests (Vitest).
- `npm run build` — typecheck + production build.

## Architecture
See `docs/superpowers/specs/2026-07-04-jellyflix-design.md` and `docs/superpowers/plans/2026-07-04-jellyflix-implementation.md`.
