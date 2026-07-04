# Jellyflix — Netflix-style Jellyfin Web UI — Design Spec

**Date:** 2026-07-04
**Status:** Approved design → implementation planning
**Goal:** A brand-new web frontend for Jellyfin that closely mimics the Netflix experience, so Netflix users can migrate to self-hosted Jellyfin with zero learning curve.

## 1. Scope

### MVP (this spec): Browse + Play vertical slice
1. Login (username/password) against a real Jellyfin server.
2. Netflix-style Home: billboard hero + content rows (Continue Watching, Next Up, Latest per library).
3. Detail modal (movie + series with season/episode list).
4. Real video playback (direct-play + HLS transcode) with progress reporting.

### Deferred (post-MVP, clean seams left in design)
Profiles ("Who's watching?"), search, My List/favorites management, autoplay hover-trailers, subtitle/audio-track switching, transcoding quality selector, multi-server.

## 2. Target environment
- **Server:** `https://jellyfin.example.com` (existing Jellyfin with media).
- **Dev:** Vite dev server proxies `/jellyfin/*` → the server (avoids CORS; no server-side change).
- **Fidelity:** High — pixel-close to Netflix (hover-expand preview cards, gradient billboard, arrow paging, motion timings).

## 3. Tech stack
- **Vite + React 18 + TypeScript** SPA (hash router, matching Jellyfin convention).
- **`@jellyfin/sdk`** for all server calls (auth, data, image URLs).
- **`@tanstack/react-query`** for fetching/caching.
- **hls.js** for HLS playback.
- **CSS Modules + CSS custom properties** for styling (no heavy UI kit; Netflix look is bespoke). Dark theme only.
- Testing: **Vitest** + React Testing Library for units (lib functions, hooks, components).

Nothing from jellyfin-web's build (webpack, jQuery, emby-* components, cardBuilder) is reused — only the API contract (see `docs/research/jellyfin-web-api-analysis.md`).

## 4. Architecture (isolated, testable units)

```
src/
  lib/jellyfin/
    api.ts           # createApi(serverUrl); persisted deviceId; Jellyfin client singleton
    auth.ts          # authenticateByName(); token persist/restore (localStorage); logout
    images.ts        # getImageUrl(item, type, {fillWidth,fillHeight}); backdrop/logo/poster pickers + blurhash
    playback.ts      # buildDeviceProfile(); getPlaybackInfo(); resolveStreamUrl() (direct vs HLS); reportPlayback*()
  hooks/
    useApi.ts        # ApiContext: { api, user }; guards unauthenticated
    api/
      useUserViews.ts   useResumeItems.ts   useNextUp.ts   useLatestMedia.ts
      useItem.ts        useSeasons.ts        useEpisodes.ts  usePlaybackInfo.ts
  components/
    nav/TopNav.tsx            # transparent→solid on scroll; logo, links, profile
    home/Billboard.tsx        # hero: backdrop video/still, logo, Play/More-Info, gradients
    row/Row.tsx               # horizontal carousel: title, arrow paging, page dots, lazy
    row/Card.tsx              # 16:9 boxart + progress bar
    row/PreviewCard.tsx       # hover-expand: scale + sibling push + info panel + buttons
    detail/DetailModal.tsx    # modal: hero, metadata, episode list, (later) more-like-this
    detail/EpisodeList.tsx    # season dropdown + episode rows
    player/VideoPlayer.tsx    # <video> + hls.js + Netflix-style controls + progress reporting
    common/                   # IconButton, ProgressBar, Skeleton, Image(blurhash fade)
  routes/
    Login.tsx  Home.tsx  Library.tsx  Watch.tsx
  styles/
    tokens.css       # Netflix color/spacing/type variables
    reset.css
  App.tsx  main.tsx  router.tsx
```

**Unit contracts:**
- `lib/jellyfin/*` — pure/thin, no React, unit-testable in isolation. Each function's inputs/outputs typed against SDK DTOs.
- `hooks/api/*` — one hook per endpoint; returns react-query result; depends only on `useApi()`.
- `components/*` — presentational; receive data via props/hooks; no direct SDK calls except player/playback orchestration.

## 5. Data flow

**Auth:** `Login` → `auth.authenticateByName(user, pw)` → `POST /Users/AuthenticateByName` → persist `{accessToken, userId, serverUrl, deviceId}` → `api.update({accessToken})` → route to Home. On reload, restore from localStorage; if token invalid (401) → back to Login.

**Home:** `useUserViews()` → for each Movie/TV view issue `useLatestMedia(parentId)`; plus `useResumeItems()` and `useNextUp()`. Billboard picks a recent, unwatched, backdrop-bearing item. Each row maps items → `Card` (image via `images.getImageUrl`, progress via `UserData.PlayedPercentage`).

**Detail:** Card click → `DetailModal` with itemId → `useItem(itemId)`; if `Type==='Series'` → `useSeasons` + `useEpisodes(selectedSeason)`.

**Playback:** Play → route `Watch/:id` → `usePlaybackInfo(itemId)` = `POST /Items/{id}/PlaybackInfo` with `buildDeviceProfile()` → `resolveStreamUrl(mediaSource)`:
- direct: `/Videos/{id}/stream.{container}?Static=true&mediaSourceId=&api_key=`
- HLS: `MediaSource.TranscodingUrl` → hls.js loads `master.m3u8`.
→ `VideoPlayer` attaches source; reports `POST /Sessions/Playing` (start), `/Progress` (~10s, on pause/seek), `/Stopped` (unmount) with `PositionTicks`. StartTimeTicks from `UserData.PlaybackPositionTicks` for resume.

## 6. Image URL rules
`getImageUrl(item, type, {fillWidth, fillHeight})` → `getImageApi(api).getItemImageUrlById(id, type, {fillWidth, fillHeight, quality:90, tag})`.
- Poster/card default: `Thumb` if present else `Primary` (16:9 landscape target).
- Billboard: `Backdrop` (from `BackdropImageTags[0]`) + `Logo` overlay.
- Fallbacks: series/parent inherited tags (`SeriesThumbImageTag`, `ParentBackdropImageTags`, etc.).
- `fillWidth/Height` = target px × devicePixelRatio. Blurhash placeholder from `ImageBlurHashes`.

## 7. Netflix visual system (from `docs/research/netflix-ui-spec.md`)
- **Tokens:** bg `#141414`, black `#000`, red `#E50914` (hover `#F40612`), elevated `#2F2F2F`, white `#FFF`, grey `#B3B3B3`, match-green `#46D369`. Backdrop `rgba(0,0,0,.7)`.
- **Type:** `"Helvetica Neue",Helvetica,Arial,sans-serif`; hero 48-64/700, row title bold, body 16, meta 12-14.
- **Spacing:** 8px base; page inset ~4vw; card gap ~4px.
- **Cards:** 16:9, radius 4px; hover dwell ~400ms → `scale(1.3)` + siblings `translateX(25%)`, 300ms `cubic-bezier(.4,0,.2,1)`; info panel with circular Play/Add/Like/More buttons + match%/rating/duration.
- **Billboard:** full-bleed backdrop, logo PNG bottom-left, Play (white pill) + More Info (translucent grey pill), left+bottom gradient vignette.
- **Rows:** ~6 cards @≥1400px, arrow paging in 80px edge gutters w/ dark gradient (hover-reveal), page-slide ~750ms, page dots, lazy images.
- **TopNav:** fixed 68px, transparent + top gradient over billboard → solid `#141414` after ~80px scroll (400ms).
- **Progress bar:** 4px, red on `rgba(255,255,255,.3)`, width = `PlayedPercentage`.
- **Responsive:** 6→5→4→3→2 cards/row at 1400/1100/800/500px; <800px touch scroll replaces arrows; <500px no hover (tap→detail).
- All motion gated behind `prefers-reduced-motion`.

## 8. Error handling
- Auth failure → inline error on Login form.
- 401 anywhere → clear session, redirect Login.
- Query errors → per-row error/empty state (a failed row doesn't break the page); react-query retry with backoff.
- Playback: if PlaybackInfo returns no playable source → user-facing "can't play" message with reason; HLS fatal error → surface + retry.
- Images: blurhash placeholder → fade to image; broken image → neutral placeholder tile.

## 9. Testing strategy
- **Unit:** `lib/jellyfin/*` (URL builders, stream resolver, device profile, token persistence) with mocked SDK.
- **Hook tests:** react-query hooks with a mocked `api`.
- **Component tests:** Card progress bar, Row paging math, PreviewCard hover state, DetailModal series/movie branching.
- **Manual integration:** against `jellyfin.example.com` — login, home renders real rows, open detail, play a title, confirm resume + Continue Watching updates.

## 10. Milestones (for the implementation plan)
1. Scaffold Vite+React+TS app, tokens, Vite proxy, SDK bootstrap, deviceId.
2. Auth (login, persist/restore, guarded routing).
3. Data hooks (userViews, resume, nextUp, latestMedia) + image URL builder.
4. Home layout: TopNav + Billboard + Row + Card (static/no-hover first).
5. PreviewCard hover-expand + arrow paging + responsiveness (high-fidelity pass).
6. DetailModal + episode list.
7. Playback: device profile, PlaybackInfo, stream/HLS resolution, VideoPlayer, progress reporting, resume.
8. Polish: motion timings, loading skeletons, error states; manual E2E against real server.

## 11. Open items
- Server credentials needed for integration testing (username/password for `jellyfin.example.com`).
