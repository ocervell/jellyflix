# Jellyflix Player Improvements — Design Spec

**Date:** 2026-07-04
**Status:** Approved design → implementation planning
**Goal:** Upgrade the rudimentary video player into a Netflix-grade one: automatic adaptive quality, audio/subtitle selection with a Netflix-style UI, and scrubber thumbnail previews (trickplay).

## 1. Scope

Three features, built in dependency order on one shared foundation:

1. **Custom Netflix-style controls** replacing the native `<video controls>` (prerequisite for the rest).
2. **Audio & subtitle selection** — a Netflix-style track menu; audio switches by re-negotiating the stream at the current position, embedded SRT subtitles are served as converted VTT and rendered natively (switch with no restart).
3. **Automatic adaptive quality** — measure connection bandwidth, cap the stream bitrate, let the server pick direct-play vs transcode, and step quality down/up automatically as the network changes. **No manual quality selector.**
4. **Trickplay scrubber thumbnails** — hover the seek bar to preview frames from Jellyfin trickplay tile-sheets.

### Decisions locked
- **Subtitles:** native VTT only (server converts SRT/text → VTT, External delivery, native `<track>`). Image subs (PGS) and ASS fall back to **burn-in on transcode** (`Encode` delivery). No `@jellyfin/libass-wasm` / `libpgs` bundle.
- **Trickplay:** build the client; separately document how to enable Jellyfin's server-side trickplay generation. Client degrades to a plain (image-less) scrubber where tiles are absent.
- **Quality:** fully automatic. No user-facing quality selector.

### Out of scope (this spec)
libass/libpgs client subtitle rendering, secondary/dual subtitles, per-user persisted track preferences, PiP, Chromecast, skip-intro/credits markers, audio normalization.

## 2. Background (verified facts)

From `docs/research/jellyfin-web-player-internals.md` and live probes of `jellyfin.example.com`:

- **No client-side ABR exists in Jellyfin.** The server transcodes to a *single* bitrate variant; hls.js has nothing to switch between. Every quality/audio/burned-subtitle change is a **re-request of `PlaybackInfo`** with new params + `StartTimeTicks = current position`, then `stopActiveEncodings` + swap source. Position is preserved via `StartTimeTicks` (HLS = server-side seek).
- **Bandwidth test:** `GET /Playback/BitrateTest?Size={bytes}` (blob, 5s timeout), staged 500KB→1MB→3MB, result `round(bps*0.7)`, LAN floor 140 Mbps when `getEndpointInfo().IsInNetwork`.
- **Tracks:** `MediaSource.MediaStreams` filtered by `Type`. Audio switch on embedded mkv needs a transcode (browsers can't select mkv audio tracks). Subtitle External/Embed-not-transcoding → client-side; Encode/Embed-while-transcoding → re-transcode.
- **Live content reality:** titles carry multiple audio (e.g. Eng 5.1 / Fre 5.1) and embedded **SRT** subtitle tracks. Some titles are **HEVC** (browsers can't decode → must transcode). The current `deviceProfile.ts` wrongly lists HEVC as direct-play. Trickplay tiles are **not yet generated** on this server (`Trickplay: {}`).
- **Trickplay tile math:** `currentTile = floor((ticks/10000)/Interval)`; `tileSize = TileWidth*TileHeight`; `index = floor(currentTile/tileSize)`; `x = (currentTile%tileSize)%TileWidth`; `y = floor((currentTile%tileSize)/TileWidth)`; `bg = (-(x*Width), -(y*Height))`. Image: `GET /Videos/{id}/Trickplay/{Width}/{index}.jpg?MediaSourceId&ApiKey`.

## 3. Architecture

The player becomes a small, well-bounded subsystem. The brain is a controller hook that owns position and can renegotiate the stream.

```
src/
  lib/jellyfin/
    deviceProfile.ts   (revise)  accurate codecs; VTT-External + Encode subtitle profiles; dynamic MaxStreamingBitrate
    bitrate.ts         (new)     measureBandwidth(api): staged BitrateTest, x0.7, LAN floor, 1h cache
    mediaStreams.ts    (new)     AudioTrack[]/SubtitleTrack[] enumeration + default selection
    trickplay.ts       (new)     selectTrickplay(item, msId); tileForTime(info, seconds) -> {imageUrl,bgX,bgY,w,h}
    abr.ts             (new)     PURE decideAbrAction(state) -> { action: 'up'|'down'|'none', targetBitrate }
    playback.ts        (revise)  fetchPlaybackInfo(+maxBitrate,audioIdx,subIdx,startTicks); stopEncoding(); direct-first resolve; subtitle DeliveryUrl
  hooks/player/
    useVideoEngine.ts  (new)     attaches src (progressive|hls.js); lifecycle, errors, buffering/stall signals; play/pause/seek/volume
    usePlaybackSession.ts (new)  orchestration: initial negotiate w/ bandwidth; tracks + selected indices + position;
                                 setAudioTrack/setSubtitleTrack/renegotiate; auto-ABR loop
  components/player/
    VideoPlayer.tsx    (rewrite) <video> (no native controls) + ControlBar + top bar (Back/title) + native <track>
    ControlBar.tsx     (new)     play/pause, ±10s, Scrubber, time, volume, TrackMenu, fullscreen; auto-hide
    Scrubber.tsx       (new)     seek bar + hover position; renders TrickplayBubble
    TrickplayBubble.tsx(new)     thumbnail tile via trickplay.tileForTime + time label
    TrackMenu.tsx      (new)     Audio / Subtitles lists; selecting calls session setters
    (VideoPlayer.module.css etc.)
  routes/
    Watch.tsx          (revise)  drive usePlaybackSession; reporting carries MaxStreamingBitrate, survives renegotiation
```

**Unit contracts (isolation):**
- `bitrate.ts`, `mediaStreams.ts`, `trickplay.ts`, `abr.ts`, `deviceProfile.ts` are pure/thin and unit-tested with mocked SDK/DOM. `abr.ts` and `trickplay.ts` are pure functions with exact expected outputs.
- `useVideoEngine` encapsulates all direct `<video>`/hls.js interaction behind a small imperative API + event callbacks; nothing else touches the element.
- `usePlaybackSession` depends only on the pure libs + `useVideoEngine` + `useApi`; components consume its state/actions via props.
- Components are presentational; they call session actions, never the SDK.

## 4. Feature designs

### 4.1 Custom controls (Phase 1)
Replace `<video controls>` with a custom overlay:
- **Top bar:** `‹ Back`, title (series → "Show · SxEy · Episode").
- **Center:** big play/pause on tap; buffering spinner.
- **Bottom ControlBar:** play/pause, back-10s / forward-10s, **Scrubber** (elapsed/remaining, buffered range), volume (mute + slider), **Audio/Subtitles** button (opens TrackMenu), fullscreen.
- **Auto-hide:** controls fade after ~3s of no pointer/keydown while playing; reappear on move/tap/key; stay while paused or menu open.
- **Keyboard:** Space/k play-pause, ←/→ seek 10s, ↑/↓ volume, f fullscreen, m mute, c subtitle toggle, Esc back.
- `useVideoEngine` exposes `{ play, pause, seek, setVolume, toggleMute, requestFullscreen }` and state `{ paused, currentTime, duration, buffered, volume, muted, waiting }`.

### 4.2 Audio & subtitle selection (Phase 2)
- `mediaStreams.ts` builds `AudioTrack{index,label,language,isDefault}` and `SubtitleTrack{index,label,language,isDefault,isForced,deliveryMethod,deliveryUrl,codec}` plus resolved default indices, from the negotiated MediaSource.
- **TrackMenu** shows two lists (Audio, Subtitles incl. an "Off" entry), checkmark on active.
- **Audio switch:** `session.setAudioTrack(index)` → `renegotiate({audioStreamIndex:index})` (transcode restart at current position). Optimistic UI; on failure revert selection + toast.
- **Subtitle switch:**
  - Track with `DeliveryMethod==='External'` (server-converted VTT) → **client-side**: set the native `<track>` src to `serverUrl + deliveryUrl` (as `.vtt`), `mode='showing'`, others `disabled`. No restart.
  - `Off` → disable all `<track>`s (and if the current stream was burned/`Encode`, `renegotiate({subtitleStreamIndex:-1})`).
  - Image (PGS)/ASS (no External VTT available) → `renegotiate({subtitleStreamIndex:index})` (burn-in). Rare for current content.
- Device profile declares `SubtitleProfiles: [{Format:'vtt',Method:'External'}, {Format:'ass',Method:'Encode'}, {Format:'pgssub',Method:'Encode'}]` so the server delivers text subs as external VTT and burns in the rest.

### 4.3 Automatic adaptive quality (Phase 3)
- **Initial:** `measureBandwidth(api)` → `maxBitrate`; `fetchPlaybackInfo({maxBitrate,...})`. Server returns direct-play (source ≤ cap & codec ok) or a single-bitrate HLS transcode. `deviceProfile.MaxStreamingBitrate = maxBitrate`.
- **Ladder:** the Jellyfin rung list (120M,60M,40M,20M,15M,10M,8M,6M,4M,3M,1.5M,720k,420k), filtered ≤ source bitrate.
- **Monitor:** `useVideoEngine` reports `waiting`/`stalled` events, `bufferAheadSeconds`, and playback-rate health. A sampler feeds a rolling `AbrState` into `abr.ts`.
- **`decideAbrAction(state)` (pure):**
  - `down` when stalls ≥ 2 in the last ~30s **or** `bufferAhead < 4s` while playing and not already at the lowest rung → target = next rung ≤ `bandwidth*0.7`.
  - `up` when `stableSecs ≥ 40` and `bufferAhead > 12s` and a higher rung ≤ `bandwidth` exists → target = one rung up.
  - else `none`.
- Applying an action = `renegotiate({maxBitrate:targetBitrate})` at current position. **Only when transcoding**; a direct-play stream with buffer headroom is left untouched (re-measure occasionally; if bandwidth drops below source, switch to transcode).
- No UI selector. (Optional tiny non-interactive "Auto — {rung}" text; default off.)

### 4.4 Trickplay thumbnails (Phase 4)
- On negotiate, read `item.Trickplay[mediaSourceId]`; `selectTrickplay` picks the largest width ≤ `screen.width*dpr*0.2`.
- **Scrubber** hover → `tileForTime(info, hoverSeconds)` → **TrickplayBubble** renders a `Width×Height` div with `background-image:url(tileUrl)` + `background-position`, plus the formatted time (and chapter label if `item.Chapters`).
- Absent trickplay → bubble shows time only.
- **Server enablement doc:** `docs/trickplay-setup.md` — Dashboard → Playback (or library) → enable "Trickplay images", run the "Generate Trickplay Images" scheduled task; note ffmpeg/hwaccel and storage.

## 5. Renegotiation mechanics (the shared core)
`usePlaybackSession.renegotiate({maxBitrate?, audioStreamIndex?, subtitleStreamIndex?})`:
1. Read `positionSeconds` from the engine.
2. `stopEncoding(api, playSessionId)` (best-effort) to free the old transcode.
3. `fetchPlaybackInfo(api, userId, playId, { startTicks: positionSeconds*1e7, maxBitrate, audioStreamIndex, subtitleStreamIndex })` → new `{mediaSource, playSessionId}`.
4. `resolveStreamUrl(...)`; update tracks/selected indices from the new MediaSource.
5. Engine loads the new src; on `loadedmetadata`, for **HLS** the server already seeked (start at 0), for **progressive/direct** seek to `positionSeconds`.
6. Update reporting `playSessionId`; continue progress reporting seamlessly.
Concurrency: a monotonically increasing `negotiationId` guards against overlapping renegotiations (stale results discarded).

## 6. Error handling
- Bitrate test fails/timeout → conservative default cap (e.g. 8 Mbps) and proceed.
- Initial PlaybackInfo fails → existing error screen + Back.
- HLS fatal error → hls recover (network→startLoad, media→recoverMediaError); if unrecoverable → one renegotiate attempt; then surface error.
- Renegotiation fails → if the old element still plays, keep it and show a brief toast; else error screen.
- Missing trickplay/chapters → plain scrubber, time-only bubble.
- Audio/sub switch failure → revert selection, toast, keep playing.

## 7. Testing strategy
- **Unit (pure):** `bitrate.ts` staging/normalization + LAN floor (mock XHR + endpoint); `mediaStreams.ts` enumeration + default/forced selection; `trickplay.ts` `tileForTime` exact math incl. multi-sheet boundary; `abr.ts` `decideAbrAction` truth table (down on stalls, up on stable, none otherwise, ladder clamping); `deviceProfile.ts` codec inclusion via mocked `canPlayType`; `playback.ts` param building + `stopEncoding` URL + direct-first ordering.
- **Component:** ControlBar play/pause + seek buttons; Scrubber hover computes bubble position & calls tile math; TrackMenu selection calls the right session setter; VideoPlayer src-attach (existing hls-mock pattern).
- **Controller:** `usePlaybackSession` renegotiation calls fetchPlaybackInfo once with correct params and swaps stream (mock engine + SDK); negotiationId discards stale results.
- **E2E (Playwright, live server):** audio switch resumes near the same position; subtitle toggle shows a VTT cue; controls auto-hide/show; Chrome-DevTools network throttling (via CDP) triggers an observable downshift (bitrate in reporting drops); trickplay bubble shows an image when tiles exist (else time-only).

## 8. Milestones (for the plan)
1. Player engine + custom ControlBar/Scrubber/keyboard/auto-hide (native controls removed; current playback intact).
2. Renegotiation core + `mediaStreams.ts` + TrackMenu: audio switch at position, VTT subtitle client-side toggle; device-profile subtitle profiles.
3. `bitrate.ts` + `abr.ts` + accurate codec profile + auto-ABR loop wired to engine signals.
4. `trickplay.ts` + TrickplayBubble in Scrubber; `docs/trickplay-setup.md`.

## 9. Open items / dependencies
- Trickplay thumbnails only appear once the server generates tiles (documented, user-enabled).
- Auto-quality is observable but bandwidth-dependent; E2E uses CDP throttling to force a downshift deterministically.
