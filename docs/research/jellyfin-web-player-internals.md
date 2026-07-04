# Jellyfin-web v12 — player internals (reference extraction)

## 1. Adaptive/automatic quality — server-side, NO client ABR
- Jellyfin transcodes to a SINGLE bitrate variant; hls.js gets a single-variant master.m3u8 (nothing to ABR between). Client uses default hls.js config.
- Bandwidth test: `GET /Playback/BitrateTest?Size={bytes}` (XHR blob, 5s timeout). Staged: 500KB/1MB/3MB, escalate if measured > threshold. Result = round(bitrate*0.7), capped by navigator.connection.downlinkMax; LAN (EndpointInfo.IsInNetwork) floor 140Mbps. Cached 1h. (`src/utils/bitrateTest.ts`)
- Stored in appSettings `maxbitrate-{mediaType}-{isInNetwork}`; `enableAutomaticBitrateDetection` default true. Auto = bitrate 0 → re-run bitrate test.
- Passed to PlaybackInfo as `MaxStreamingBitrate` + into DeviceProfile. DeviceProfile MaxStreamingBitrate hard cap 120Mbps (`browserDeviceProfile.js`).
- Change quality mid-play = `changeStream(player, getCurrentTicks, {MaxStreamingBitrate})`: new PlaybackInfo with StartTimeTicks=current pos → `stopActiveEncodings(playSessionId)` → swap src → play. Position preserved via StartTimeTicks (HLS server-side seek) / transcodingOffsetTicks (non-HLS).
- Quality ladder 120Mbps→420kbps, filtered ≤ source bitrate (×1.5 for hevc/av1/vp9). "Auto" label shows active rung.

## 2. Audio & subtitle selection
- Tracks from `mediaSource.MediaStreams` filtered by Type Video/Audio/Subtitle. Fields: Index, DeliveryMethod, DeliveryUrl, Codec, Language, IsExternal, IsForced, IsDefault. Defaults: DefaultAudioStreamIndex, DefaultSubtitleStreamIndex.
- Audio switch (`setAudioStreamIndex`): if Transcode OR !canSetAudioStreamIndex → `changeStream({AudioStreamIndex})` (re-transcode at position). Else client-side toggle `elem.audioTracks[i].enabled` (Chrome dropped audioTracks → usually re-transcode).
- Subtitle switch (`setSubtitleStreamIndex`) by DeliveryMethod:
  - External, or Embed-while-not-transcoding → CLIENT-SIDE (native <track> / custom), NO restart.
  - Encode, or Embed-while-transcoding → `changeStream({SubtitleStreamIndex})` (burn-in, restart).
  - Off from burned stream → changeStream({SubtitleStreamIndex:-1}).
- External sub URL = `textStream.DeliveryUrl` (server: `/Videos/{id}/{msId}/Subtitles/{index}/Stream.vtt`). Native path: addTextTrack + fetch `.js` JSON TrackEvents → VTTCue(start/end=ticks/1e7).
- Rendering dispatch by Codec: ssa/ass → `@jellyfin/libass-wasm` (SubtitlesOctopus); pgssub → `libpgs`; else native <track> or custom div. timeOffset = transcodingOffsetTicks/1e7.

## 3. Trickplay (scrub thumbnails)
- `item.Trickplay[mediaSourceId][width]` → TrickplayInfo{Interval(ms), TileWidth, TileHeight (tiles/sheet), Width, Height (px/thumb), ThumbnailCount}. Pick width ≤ screen.width*dpr*0.2.
- Tile math for positionTicks:
  currentTile = floor((ticks/10000)/Interval); tileSize=TileWidth*TileHeight; tileOffset=currentTile%tileSize; index=floor(currentTile/tileSize); x=tileOffset%TileWidth; y=floor(tileOffset/TileWidth); bgPos=(-(x*Width), -(y*Height)).
- Image: `GET /Videos/{id}/Trickplay/{Width}/{index}.jpg?MediaSourceId&ApiKey`. Rendered as Width×Height div with background-image + background-position. Chapter label from item.Chapters (last StartPositionTicks ≤ pos).
- NOTE: requires server-side trickplay generation (scheduled task/plugin). Empty `Trickplay:{}` if not generated.

## 4. Position/restart plumbing
- StartTimeTicks in PlaybackInfo carries resume offset. changeStream uses getCurrentTicks (abs pos incl offset). stopActiveEncodings kills old transcode. HLS = server-side seek; non-HLS = transcodingOffsetTicks client offset + #t= fragment.
