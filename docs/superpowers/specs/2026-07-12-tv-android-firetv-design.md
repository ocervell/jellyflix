# Android TV / Fire TV Support — Design

**Date:** 2026-07-12
**Status:** Approved, ready for implementation plan

## Goal

Make Jellyflix usable on Android TV / Fire TV with a remote, without a native rewrite: add **D-pad spatial navigation** to the web app (usable immediately in a TV browser), and **scaffold a thin Capacitor leanback APK** that loads the deployed URL.

## Background

The app is a React 19 + Vite SPA (HashRouter) that talks to Jellyfin through a same-origin `/jf` reverse proxy (nginx in prod, Vite in dev; `SERVER_URL = '/jf'` in `useApi.tsx`). Input today is mouse/touch: 37 `onClick` handlers on real `<button>`s (natively focusable — good), ~18 `:hover` reveals (card hover-expand, menus, episode Play button, volume slider), only 4 pointer/mouse handlers, and only 4 focus-style rules. The player already has keyboard handling. No spatial-nav library, no PWA manifest, no native tooling.

Because connectivity goes through `/jf`, the APK must **load the deployed web URL** (where nginx proxies `/jf`), not bundled assets (which would have no proxy). This "thin wrapper" reuses all existing connectivity and auto-updates on every web redeploy.

The build environment has **no Java/Android SDK**, so the APK is scaffolded + documented here and built by the user in Android Studio; the spatial navigation is fully implemented and verified here.

## Scope decisions (locked)

- **Screens:** all of them — TopNav, home rows, detail modal, episode list, player controls, Library grid, Search, FilterBar dropdowns, Login.
- **Library:** `@noriginmedia/norigin-spatial-navigation`.
- **Always-on:** spatial navigation is always active (arrow keys + Enter); mouse/touch keep working; no device detection.
- **Deliverable split:** A (spatial nav) implemented + tested here; B (Capacitor APK) scaffolded + documented, built by the user.

## Part A — Spatial navigation (web app)

### A1. Root setup

- Call norigin `init({ /* default: standard arrow keymap */ })` once at app startup (`src/main.tsx` or a small `src/lib/tv/focus.ts`).
- Wrap the app tree in norigin's `FocusContext.Provider` at the root layout so every screen shares one focus tree.
- Each screen sets an initial focus target on mount (via `setFocus(focusKey)`): Login → username; Home → first card; Library/Search → first tile; Detail modal → Play; Player → play/pause. When a modal opens it takes focus; when it closes, focus returns to the opener.

### A2. Focusable units

Each interactive unit uses `useFocusable()` to get a `ref` + `focused` flag, and calls the existing handler on `onEnterPress` (Enter/OK) — the existing `onClick` stays for mouse. New focusable wrappers, by component:

| Component | Focusable unit(s) | Enter action | Notes |
|---|---|---|---|
| `TopNav` | logo, each nav link, search toggle | navigate / open search | horizontal container |
| `Row` + `PreviewCard` | each card; `Row` is a horizontal focus container | `onOpen(item)` | on focus: apply the existing hover-expand and scroll the card into view |
| `DetailModal` | Play, Go-to-series (episodes), close, `ItemActions` buttons | activate | modal grabs focus on open, restores on close |
| `EpisodeList` | each episode row + its thumbnail Play button; season `<select>` | row → `onSelect(id)`; Play → `onPlay`; select → open | vertical list; select is a focus trap while open |
| `ControlBar` | play/pause, rewind10, forward10, mute, **Scrubber**, fullscreen, `TrackMenu` toggle | activate; **Scrubber Left/Right = seek ∓10s** | focus keeps controls visible (feeds `useAutoHide`) |
| `TrackMenu` | toggle, each audio/subtitle option | select | panel is a focus trap while open; Back closes it |
| `PosterGrid` (Library/Search) | each poster tile in a **2-D grid** | `onOpen` | Up/Down/Left/Right across the grid; scroll into view; works with infinite scroll |
| `FilterBar` + `Dropdown` | each control; each open-dropdown option | toggle/select | open dropdown traps focus until Esc/Back/select |
| `Login` | username, password, Sign In | submit on Sign In | vertical |

### A3. Focus visuals + hover→focus

- One shared high-contrast **focus ring** (thick outline + subtle scale), applied when norigin marks an element `focused`. Tuned for 10-foot legibility; respects `prefers-reduced-motion` (no scale).
- Every `:hover` reveal that gates discovery gets a `:focus` / `:focus-within` (or norigin `focused`) equivalent so it appears under the ring: `PreviewCard` expand, `PosterCard` overlay, `EpisodeList` thumbnail Play button, `ControlBar` volume slider, `TrackMenu`. Mouse hover behavior is preserved.

### A4. Back button + auto-scroll

- A single **Back handler** (keydown for `Escape`/`Backspace`/`GoBack`, and the browser `popstate`/`BackButton`), with priority: open `TrackMenu` → close it; open `DetailModal` → close it; on `/watch` → leave the player (back to previous route); otherwise `navigate(-1)`; at the root, do nothing (the APK maps this to app-exit in B). Implemented as a small `useTvBack()` hook / context used by the modal, player, and menu.
- Auto-scroll: rely on norigin's built-in `scrollIntoView` on focus (horizontal for rows, vertical for grids/pages). Verify rows scroll their strip and the grid scrolls the page.

### A5. Data flow

norigin holds a focus tree keyed by `focusKey`. Arrow keys move focus by on-screen geometry; Enter dispatches the focused unit's `onEnterPress`. No app/query/data changes — purely an input/focus layer over existing components.

## Part B — Capacitor leanback APK (scaffold only)

Delivered as committed files + a build doc; **not built or run in this environment** (no Android SDK).

- `capacitor.config.ts`: `appId` (e.g. `me.jahmyst.jellyflix`), `appName` "Jellyflix", `server.url = <deployed Jellyflix URL>` (thin wrapper), `android.allowMixedContent` as needed.
- `android/` platform additions (documented as the exact files/edits to apply after `npx cap add android`):
  - Leanback launcher intent on the main activity: `<category android:name="android.intent.category.LEANBACK_LAUNCHER" />` (so it appears on the TV home), keep the normal `LAUNCHER` too.
  - `<uses-feature android:name="android.software.leanback" android:required="false" />` and `android.hardware.touchscreen` `required="false"`.
  - TV `android:banner` (320×180) on the application/activity.
  - Immersive fullscreen; hardware **Back** wired to dispatch the web app's Back handler (via Capacitor `App.addListener('backButton', …)`), exiting only at the app root.
- `docs/tv-build.md`: exact steps — `npm i @capacitor/core @capacitor/cli @capacitor/android`, `npx cap init`, `npx cap add android`, `npx cap sync`, set `server.url`, open `android/` in Android Studio → Build APK → sideload via `adb install` on Android TV / Fire TV.

## Error handling

Additive layer; no new failure surface. If a screen renders with no focusable element, mouse/touch still work and arrow keys are inert. norigin degrades gracefully. The Back handler never throws (no-op at root).

## Testing

**Part A (automated here, Playwright driving keyboard):**
- Login: Tab/arrows reach fields + Sign In; Enter submits.
- Home: Right/Left move within a row and scroll the strip; Up/Down move between rows; Enter opens the detail modal.
- Detail modal: focus starts on Play; Back closes it and restores focus to the opener; episode row Enter → episode view; thumbnail Play Enter → `/watch`.
- Player: D-pad reaches each control; Scrubber Left/Right seeks; Back leaves the player.
- Library/Search grid: 2-D arrow navigation across tiles + scroll; Enter opens detail; FilterBar dropdown opens, traps focus, selects, Back closes.
- Back-handler unit test: priority order (menu → modal → player → history → root no-op).
- Regression: the existing mouse-driven test suite stays green (all changes additive).

**Part B (manual, by the user):** build the APK per `docs/tv-build.md`, sideload on the device, confirm the leanback launcher icon, D-pad navigation, and Back/exit behavior on the actual TV.

## Out of scope (YAGNI)

- No native ExoPlayer / native tvOS / Roku (separate efforts).
- No first-run server-entry screen (thin wrapper loads the deployed URL; `/jf` proxy unchanged).
- No PWA offline/service worker in this pass (can follow later).
- No bundled-assets APK (would break the `/jf` proxy model).
- No custom focus-geometry engine (norigin handles it).
