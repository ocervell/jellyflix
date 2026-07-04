# Jellyfin Web (v12.0.0) — Technical Analysis for Building an Alternative Frontend

All paths relative to `jellyfin-web/`.

## 1. Tech Stack & Build
- React 18.3.1 + react-dom, `react-router-dom` 6.30 with **hash router** (`createHashRouter`, `src/RootAppRouter.tsx:21`).
- Data: `@tanstack/react-query` 5.101 (+ persist, idb-keyval). Shared `queryClient` at `src/utils/query/queryClient`.
- UI: **MUI 6.5** + Emotion, `material-react-table`, `swiper`, `blurhash`.
- Legacy layer: jQuery 3.7, `emby-*` web components, imperative `cardBuilder` HTML strings.
- Two apps in one: `layoutManager.modern` switches `src/apps/modern` vs `src/apps/legacy` (+ dashboard, wizard).
- **Bundler = Webpack 5** (not Vite; `vite.config.ts` is only for Vitest). TS 5.9, `baseUrl: src`, `target: ES5`.
- **Takeaway:** none of the build machinery must be reused. Fresh Vite+React+TS is fine; reuse the *server API contract* via `@jellyfin/sdk`.

## 2. API Client / SDK
- Two clients side by side: legacy `jellyfin-apiclient` (`window.ApiClient`) and modern **`@jellyfin/sdk`** (`0.0.0-unstable.202607010629`). New frontend should use the SDK directly.
- Bridge: `src/utils/jellyfin-apiclient/compat.ts` → `toApi()`:
  `new Jellyfin({clientInfo, deviceInfo}).createApi(serverAddress, accessToken)`.
- React entry: `src/hooks/useApi.tsx` — `ApiProvider` exposes `{ api, user, __legacyApiClient__ }`.
- SDK usage pattern: per-domain factories wrapped in react-query:
  `getItemsApi(api).getResumeItems(params, { signal })`.
- Most-used SDK modules: `items-api`, `tv-shows-api`, `user-views-api`, `user-library-api`, `image-api`, `media-info-api`, `library-api`, `system-api`, `user-api` + model enums.

## 3. Authentication
- Login: `POST /Users/AuthenticateByName` `{Username, Pw}` → `AuthenticationResult { User, AccessToken, ServerId, SessionInfo }`.
- Quick Connect: `POST /QuickConnect/Initiate` → `{Secret, Code}`; poll `GET /QuickConnect/Connect?Secret=` until `Authenticated`.
- Auth header (SDK sends it): `X-Emby-Authorization: MediaBrowser Client="...", Device="...", DeviceId="...", Version="...", Token="<AccessToken>"`. For media URLs, token also as `api_key` query param.
- Persist a stable `DeviceId`.

## 4. Core Data Ops (Netflix-style)
| Purpose | SDK call → endpoint |
|---|---|
| Libraries (user views) | `getUserViewsApi.getUserViews({userId})` → `GET /UserViews` |
| Continue Watching / Resume | `getItemsApi.getResumeItems({userId, limit, mediaTypes, fields, enableImageTypes})` → `GET /UserItems/Resume` |
| Next Up | `getTvShowsApi.getNextUp({userId})` → `GET /Shows/NextUp` |
| Latest per library | `getUserLibraryApi.getLatestMedia({userId, parentId})` → `GET /Users/{userId}/Items/Latest` |
| Library grid | `getItemsApi.getItems({userId, parentId, includeItemTypes, sortBy, sortOrder, startIndex, limit, fields})` → `GET /Items` |
| Item details | `getUserLibraryApi.getItem({userId, itemId})` → `GET /Users/{userId}/Items/{itemId}` |
| Seasons | `getTvShowsApi.getSeasons({seriesId, userId})` → `GET /Shows/{id}/Seasons` |
| Episodes | `getTvShowsApi.getEpisodes({seriesId, seasonId, userId})` → `GET /Shows/{id}/Episodes` |
| Search | `getSearchApi.getSearchHints` → `GET /Search/Hints`; + `/Items?searchTerm=` |
| Favorite toggle | `getUserLibraryApi.markFavoriteItem/unmarkFavoriteItem` → `POST/DELETE /UserFavoriteItems/{id}` |

Home orchestrated by `src/components/homesections/homesections.js`.

### Image URLs (critical)
`getImageApi(api).getItemImageUrlById(itemId, imgType, {fillWidth, fillHeight, quality:96, tag})`
→ `GET /Items/{Id}/Images/{Type}?tag={tag}&fillWidth=&fillHeight=&quality=`.
Need item `Id` + image `Type` + matching `tag` from `ImageTags` (`{Primary,Thumb,Logo,Banner}`) / `BackdropImageTags[]`. Poster=`Primary`, wide/hero=`Backdrop`/`Thumb`, logo=`Logo`. Blurhash from `item.ImageBlurHashes`.

### Playback stream URL
- `POST /Items/{itemId}/PlaybackInfo` with `{DeviceProfile, UserId, MaxStreamingBitrate, MediaSourceId?, StartTimeTicks?}` → `PlaybackInfoResponse { MediaSources[], PlaySessionId }`.
- Direct: `GET /Videos/{itemId}/stream.{container}?Static=true&mediaSourceId=&api_key={token}&Tag={ETag}`.
- Transcode/HLS: `MediaSource.TranscodingUrl` (relative → prefix server URL); if `TranscodingSubProtocol==='hls'` → `master.m3u8` → hls.js.
- Reference: `src/components/playback/playbackmanager.js` (`getPlaybackInfo` ~417, stream URL ~2835, `reportPlayback` ~77).

## 5. Playback Engine
- Base: native HTML5 `<video>`; `src/plugins/htmlVideoPlayer/plugin.js`.
- **hls.js 1.6** for HLS, **flv.js** for FLV. Subtitles: `@jellyfin/libass-wasm` (ASS/SSA), `libpgs` (PGS), native `<track>` (VTT/SRT).
- DeviceProfile built by `src/scripts/browserDeviceProfile.js` (POSTed to PlaybackInfo so server decides direct vs transcode).
- Progress reporting: `POST /Sessions/Playing`, `/Sessions/Playing/Progress` (~every 10s), `/Sessions/Playing/Stopped` with `{ItemId, PlaySessionId, PositionTicks, IsPaused}`. **Required** for Continue Watching.

## 6. Data Model
- All DTOs from `@jellyfin/sdk/lib/generated-client`.
- `BaseItemDto` key fields: `Id, Name, Type (BaseItemKind), MediaType, CollectionType, ImageTags, BackdropImageTags, ImageBlurHashes, PrimaryImageAspectRatio`, inherited `SeriesId/SeriesPrimaryImageTag/ParentThumb*/ParentBackdrop*/ParentLogo*`, `UserData (PlayedPercentage, PlaybackPositionTicks, Played, IsFavorite)`, `RunTimeTicks, ProductionYear, IndexNumber, ParentIndexNumber, Overview, Genres, People, MediaSources, ChildCount`.
- `UserDto`: `Id, Name, PrimaryImageTag, Policy, Configuration`.
- `BaseItemDtoQueryResult`: `{ Items[], TotalRecordCount, StartIndex }`.
- Enums: `ImageType, ItemFields, ItemSortBy, SortOrder, BaseItemKind, CollectionType, MediaType`.

## 7. Minimal New Frontend Contract
Auth → `AuthenticateByName`; Browse → `/UserViews`, `/UserItems/Resume`, `/Shows/NextUp`, `/Users/{id}/Items/Latest`, `/Items`; Detail → `/Users/{id}/Items/{id}`, `/Shows/{id}/Seasons`, `/Shows/{id}/Episodes`; Images → `/Items/{id}/Images/{Type}`; Playback → `/Items/{id}/PlaybackInfo` → stream/HLS URL → hls.js → report `/Sessions/Playing*`.

Skip: webpack, jQuery/emby components, cardBuilder, dual app split, multi-server ConnectionManager, SyncPlay, Chromecast, book/PDF players.
