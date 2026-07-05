# Jellyflix Library Browse (grid + filters) — Design Spec

**Date:** 2026-07-05
**Status:** Approved design → implementation planning
**Goal:** A full browse view of a library (Movies, TV Shows, …) as a dense poster grid with useful filters (sort, genre, decade, watched status), infinite scroll, and shareable URL state — reachable from the top nav.

## 1. Scope

- New route **`/library/:viewId`** rendering a paginated poster grid of a Jellyfin user-view (library).
- **Filters (v1):** Sort (field + order), Genre (multi), Decade (multi), Watched status (Unplayed / Played / Favorites).
- **Infinite scroll** over the library (e.g. 974 movies) via `startIndex`/`limit` paging.
- **URL-driven state:** all filters/sort live in the hash search params (shareable, back/forward, refresh-safe).
- **Portrait 2:3 poster cards** (distinct from the home's landscape hover cards).
- Wire the **top-nav "Movies"/"TV Shows"** links (currently dead `#/`) to the right library; "Home" → `/`.
- Clicking a poster opens the existing **DetailModal** (movie or series).

### Out of scope (v1)
Text search (separate feature), person/studio/tag filters, "My List", multi-library combined view, saved filter presets, alphabet jump-bar.

## 2. Verified server/SDK facts
- `getItemsApi(api).getItems({ userId, parentId, recursive:true, includeItemTypes, sortBy, sortOrder, genres, years, filters, isFavorite, startIndex, limit, fields, enableImageTypes, enableTotalRecordCount:true })` → `{ Items, TotalRecordCount }`.
- `getFilterApi(api).getQueryFilters({ userId, parentId, includeItemTypes })` → `{ Genres, Years, OfficialRatings, Tags }` (available facets for the view).
- `ItemSortBy`: `SortName, DateCreated, PremiereDate, ProductionYear, CommunityRating, Random`. `SortOrder`: `Ascending | Descending`.
- `ItemFilter`: `IsUnplayed, IsPlayed, IsFavorite` (watched status). Favorites also via `isFavorite:true`.
- Live data: Movies library = **974 items**; 25 genres; years 1902–2026. Facets come from `getQueryFilters`.

## 3. Architecture (isolated, testable units)

```
src/
  lib/library/
    query.ts        (new, pure)  URL <-> LibraryQuery <-> getItems args
    query.test.ts
  hooks/api/
    useLibraryItems.ts   (new)   useInfiniteQuery over getItems (paged)
    useLibraryFilters.ts (new)   getQueryFilters -> genres + decades
  components/library/
    FilterBar.tsx / .module.css   sort/genre/decade/status controls -> URL
    PosterCard.tsx / .module.css  2:3 poster + title/year + progress -> opens detail
    PosterGrid.tsx / .module.css  responsive grid + infinite-scroll sentinel
    Dropdown.tsx / .module.css    small reusable menu/multiselect used by FilterBar
  hooks/
    useInfiniteScroll.ts  (new)   IntersectionObserver sentinel -> onLoadMore
  routes/
    Library.tsx / .module.css     route: reads viewId+params, composes the page
  components/nav/TopNav.tsx        (modify) resolve Movies/TV Shows -> /library/:id
  router.tsx                       (modify) add /library/:viewId (guarded)
```

### Unit contracts
- **`query.ts`** (pure, no React/SDK): the single source of truth for filter encoding.
  - `type SortField = 'name'|'dateAdded'|'year'|'rating'|'random'`
  - `type WatchedStatus = 'all'|'unplayed'|'played'|'favorites'`
  - `type LibraryQuery = { sort: SortField; order: 'asc'|'desc'; genres: string[]; decades: number[]; status: WatchedStatus }`
  - `DEFAULT_QUERY: LibraryQuery` (sort `name`, order `asc`, empty genres/decades, status `all`).
  - `parseParams(sp: URLSearchParams): LibraryQuery` — tolerant of missing/invalid values (fall back to defaults).
  - `toParams(q: LibraryQuery): URLSearchParams` — omits defaults (clean URLs); `genres`/`decades` comma-joined.
  - `toGetItemsArgs(q, ctx: { viewId: string; userId: string; includeItemTypes: string[]; startIndex: number; limit: number }): GetItemsRequest` — maps: sort→`sortBy` (`{name:'SortName',dateAdded:'DateCreated',year:'PremiereDate',rating:'CommunityRating',random:'Random'}`) + `sortOrder`; `genres`→`genres`; `decades`→`years` (flatten each decade `d` to `[d..d+9]`); `status`→`filters` (`unplayed:['IsUnplayed']`, `played:['IsPlayed']`) or `isFavorite:true` (favorites); always `recursive:true`, `enableTotalRecordCount:true`, `fields:[PrimaryImageAspectRatio]`, `enableImageTypes:[Primary,Thumb]`.
- **`useLibraryItems(query, ctx)`** → `useInfiniteQuery`; `getNextPageParam` = next `startIndex` while `loaded < total`; returns `{ items: BaseItemDto[], total: number, fetchNextPage, hasNextPage, isLoading, isError }`. Query key includes the serialized query + viewId so filter changes refetch from page 0.
- **`useLibraryFilters(viewId, includeItemTypes)`** → `{ genres: string[], decades: number[] }` (decades derived from the facet `Years`, sorted desc).
- **`useInfiniteScroll(onLoadMore, enabled)`** → returns a `sentinelRef`; an `IntersectionObserver` fires `onLoadMore` when the sentinel enters view (guarded by `enabled` = `hasNextPage && !isFetching`).
- **Components** are presentational; they read `LibraryQuery` + data via props and emit param changes upward. `FilterBar` calls `setSearchParams(toParams(next))`; it never holds filter state itself.

## 4. Data flow
`useSearchParams()` → `parseParams` → `LibraryQuery` → `useLibraryItems` (infinite pages, appended) → `PosterGrid`. A filter change in `FilterBar` → `toParams` → `setSearchParams` → params change → query re-derives (new key) → refetch from page 0, scroll resets to top. The sentinel near the grid bottom → `fetchNextPage` appends the next page. `total` renders as a header count ("974 titles").

Nav: `TopNav` uses `useUserViews()` to map "Movies"→the `movies` view id and "TV Shows"→the `tvshows` view id, linking to `#/library/:id` (active-highlight the current one). `includeItemTypes` derives from the view's `CollectionType` (`movies`→`['Movie']`, `tvshows`→`['Series']`).

## 5. Components (behaviour)
- **`PosterCard`**: `2:3` `Primary` poster via `getPosterUrl` + `Img` (blur/fade), title + `ProductionYear` beneath, red `ProgressBar` when `PlayedPercentage>0`. Click → `onOpen(item)` (Library opens DetailModal). Hover: subtle scale + shadow (no info panel; grid stays dense). Focusable/keyboard-activatable.
- **`PosterGrid`**: CSS grid `repeat(auto-fill, minmax(150px, 1fr))` with `--nf-inset` gutters; renders `PosterCard`s; a trailing sentinel `<div ref={sentinelRef}>`; shows skeleton tiles while `isLoading`, an empty state ("No titles match these filters") when `total===0`, and a small "loading more…" row while fetching the next page.
- **`FilterBar`**: a sticky row under the nav — a **Sort** control (field dropdown + asc/desc toggle), **Genre** multi-select (from `useLibraryFilters`), **Decade** multi-select, **Status** segmented control (All/Unplayed/Played/Favorites), and a "Clear" button (only when non-default). Each writes to the URL. `Dropdown` is a small reusable popover for the menus.
- **`Library` route**: resolves `viewId` + `parseParams(searchParams)`; renders `TopNav`, `FilterBar`, a count header, `PosterGrid`; owns `detail` state and renders `DetailModal` (reused) + navigates to `/watch/:id` on play.

## 6. Error / empty / loading
- Loading: skeleton poster grid (reuse the shimmer style).
- Empty: "No titles match these filters." + a Clear-filters action.
- Query error: inline message + react-query retry.
- Invalid/unknown `viewId` or params: `parseParams` falls back to defaults; an unknown view shows the error/empty state.
- Facets fetch failure: filters degrade to empty option lists (grid still works with defaults).

## 7. Testing
- **Unit (`query.ts`)**: `parseParams` (defaults, partial, invalid), `toParams` (omits defaults, joins lists, round-trips with `parseParams`), `toGetItemsArgs` (sort mapping, decade→years flattening, status→filters/isFavorite, pagination fields).
- **Hooks**: `useLibraryItems` appends pages and stops at `total` (mock SDK, two pages); `useLibraryFilters` maps facet Years→decades (mock SDK).
- **Components**: `FilterBar` selecting a genre/sort/status calls `setSearchParams` with the expected params; `PosterCard` renders poster+title+progress and fires `onOpen`; `PosterGrid` renders items and the sentinel triggers `onLoadMore` (mock IntersectionObserver); `useInfiniteScroll` fires only when enabled.
- **E2E (Playwright, live server)**: open `#/library/<movies id>` → grid loads with a count; apply a Genre → grid updates and URL gains `genres=`; change Sort to Release year desc → order changes + URL updates; scroll to bottom → next page appends (item count grows); click a poster → DetailModal opens; nav "Movies" link routes here.

## 8. Milestones (for the plan)
1. `lib/library/query.ts` (+ tests) — the pure URL/query/args bridge.
2. `useLibraryItems` (infinite) + `useLibraryFilters` (+ tests).
3. `PosterCard` + `PosterGrid` + `useInfiniteScroll` (+ tests) — static grid rendering with a mocked data source.
4. `FilterBar` + `Dropdown` (+ tests) — controls writing to the URL.
5. `Library` route + router + TopNav wiring (+ DetailModal reuse) — assemble; live E2E.

## 9. Open items / dependencies
- Confirm `getFilterApi().getQueryFilters` request/response field casing against the installed SDK at implementation (fallback: `getItemsApi` distinct genres).
- Decade grouping uses the facet `Years`; a very old library (1902) yields many decades — render newest-first, scrollable.
