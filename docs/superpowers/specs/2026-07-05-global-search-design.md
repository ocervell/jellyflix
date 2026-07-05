# Jellyflix Global Search — Design Spec

**Date:** 2026-07-05
**Status:** Approved design → implementation planning
**Sub-project:** SP2 of the 9-feature set. Adds a global search page that reuses the library browse pipeline (`getItems` + poster grid + infinite scroll + DetailModal) with `searchTerm` set and no library scoping.

## 1. Scope
- **Search box in TopNav:** a search icon that expands to a text input. Debounced (~300 ms) typing navigates to `/search?q=<term>` (`replace: true` — typing does not spam browser history). Esc or clearing the field collapses it and returns to the previous page.
- **`/search?q=` route:** shows matching **Movies + Series** in the same infinite portrait poster grid as a library, with a **sort + watched-status** FilterBar. Empty `q` shows a prompt; no matches shows an empty state.
- **Reuse:** the existing `getItems` args builder, `PosterGrid`, `useInfiniteScroll`, `DetailModal`, and `FilterBar` (with genre/decade facets hidden).

### Out of scope (this sub-project)
- People/cast search and filmography (that is SP3).
- Episode-level results, music, live-hint autocomplete dropdown, search history/suggestions.
- Genre/decade facets on results (per-library facets have no clean global source; deferred by decision).

## 2. Decisions locked during brainstorming
- **UX:** dedicated `/search` route reusing the poster grid (not a hints-only dropdown, not a hybrid).
- **Filters on results:** **sort + watched-status only** (no genre/decade).
- **Result types:** **Movie + Series** only.
- **Trigger:** debounced live search as you type (no explicit submit button).
- **Search box:** expand-on-click search icon in TopNav (not an always-visible input).
- **Backend:** client of `getItems({ searchTerm })` — no separate `/Search/Hints` endpoint.

## 3. Verified server/SDK facts
- `getItemsApi(api).getItems({ userId, searchTerm, recursive: true, includeItemTypes: [Movie, Series], ... })` returns `{ Items, TotalRecordCount }` — the same shape the library grid already consumes. `searchTerm` exists on `ItemsApiGetItemsRequest`.
- Omitting `parentId` searches across all libraries (recursive). The library path sets `parentId: viewId`; search leaves it unset.
- Sort (`sortBy`/`sortOrder`) and watched-status (`filters: IsPlayed/IsUnplayed`, `isFavorite`) behave identically with or without `searchTerm` — so the existing sort/status mapping is reused verbatim.

## 4. Architecture (isolated, testable units)

```
src/
  lib/library/
    query.ts            (modify)  extract a shared sort+status→args helper; reuse it in search
  lib/search/
    query.ts            (new, pure)  SearchQuery URL parse/serialize + toSearchItemsArgs
    query.test.ts
  hooks/api/
    useInfiniteItems.ts (new)  shared infinite-getItems primitive (queryKey + argsFor + enabled)
    useSearchItems.ts   (new)  search infinite query (enabled only when q non-empty)
    useSearchItems.test.tsx
  components/nav/
    SearchBox.tsx / .module.css   (new)  expand-on-click debounced search input
    SearchBox.test.tsx
    TopNav.tsx          (modify)  mount <SearchBox/> on the right side
  components/library/
    FilterBar.tsx       (modify)  optional `facets = true` prop to hide Genre/Decade
  routes/
    Search.tsx / .module.css      (new)  /search page (prompt | FilterBar + PosterGrid + DetailModal)
  router.tsx            (modify)  add /search (RequireAuth)
```

### Unit contracts
- **`lib/library/query.ts` (modify):** extract the pure sort+status portion of `toGetItemsArgs` into a shared helper, e.g. `sortStatusArgs(q: Pick<LibraryQuery,'sort'|'order'|'status'>): Partial<ItemsApiGetItemsRequest>` returning `{ sortBy, sortOrder, ...filters, ...(favorites?{isFavorite:true}) }`. `toGetItemsArgs` calls it (behaviour unchanged — existing library tests must still pass). This is the single source of truth both pages share.
- **`lib/search/query.ts` (pure):**
  - `type SearchQuery = { q: string; sort: SortField; order: 'asc'|'desc'; status: WatchedStatus }` (reuses `SortField`/`WatchedStatus` from library/query).
  - `parseSearchParams(sp: URLSearchParams): SearchQuery` — `q` from `sp.get('q') ?? ''`; sort/order/status parsed with the same validation as `parseParams` (reuse it).
  - `toSearchParams(q: SearchQuery): URLSearchParams` — emits `q` when non-empty, plus non-default sort/order/status (reuse `toParams` for the latter).
  - `toSearchItemsArgs(q: SearchQuery, ctx: { userId: string; startIndex: number; limit: number }): ItemsApiGetItemsRequest` — returns `{ userId, recursive: true, includeItemTypes: [Movie, Series], searchTerm: q.q, ...sortStatusArgs(q), startIndex, limit, fields: [PrimaryImageAspectRatio], enableImageTypes: [Primary, Thumb], enableTotalRecordCount: true }`. **No `parentId`.**
- **`hooks/api/useInfiniteItems.ts`:** `useInfiniteItems({ queryKey, enabled, argsFor }): { items, total, fetchNextPage, hasNextPage, isLoading, isError }` where `argsFor(startIndex) => ItemsApiGetItemsRequest`. Encapsulates the `useInfiniteQuery` + offset `getNextPageParam` + flatten + Id-dedup currently inlined in `useLibraryItems`. `useLibraryItems` is refactored to call it (library tests must still pass); `useSearchItems` also calls it.
- **`hooks/api/useSearchItems.ts`:** `useSearchItems(query: SearchQuery)` → `useInfiniteItems` with `queryKey: ['search', userId, toSearchParams(query).toString()]`, `enabled: query.q.trim().length > 0`, `argsFor: (startIndex) => toSearchItemsArgs(query, { userId, startIndex, limit: 60 })`.
- **`components/nav/SearchBox.tsx`:** renders a search-icon button that toggles an input open. On input change, debounce ~300 ms then `navigate('/search?' + toSearchParams({ q, ...currentSortStatus }).toString(), { replace: true })`. When already on `/search`, preserve current sort/order/status params. Escape or empty-after-having-typed collapses and navigates back (or to the pre-search location). Input autofocuses when expanded. Accessible: button `aria-label="Search"`, input `aria-label="Search movies and shows"`.
- **`routes/Search.tsx`:** `const q = parseSearchParams(searchParams)`. If `!q.q.trim()` → centered `.prompt` ("Search for movies and shows"). Else → `<FilterBar query={asLibraryQuery(q)} facets={false} total={total} onChange=…/>` + `<PosterGrid items loading onOpen onLoadMore hasMore/>` + `<DetailModal/>`. `onChange` writes sort/status back to the URL while preserving `q`. `onPlay` → `/watch/:id`.
- **`components/library/FilterBar.tsx` (modify):** add optional `facets?: boolean` (default `true`); when `false`, skip rendering the Genre and Decade `<Dropdown>`s. All other controls (sort, order, status, clear, count) unchanged. Existing library usage omits the prop → unchanged.

## 5. UI surfaces
- **TopNav:** `<SearchBox/>` sits at the right, before "Sign out". Collapsed = a search icon; expanded = input + icon.
- **/search page:** heading omitted or minimal; FilterBar (sort + order + status + count, no facets); poster grid identical to library; DetailModal on click.
- **Count label:** FilterBar's existing "N titles" is acceptable for search results (a movie/series is a title).

## 6. Error handling
- Empty/whitespace `q`: `useSearchItems` is disabled (no request); page shows the prompt.
- Zero matches: `PosterGrid` renders its existing empty state; Search passes a "No results for '<q>'" message (via the grid's empty affordance or a sibling element).
- Request failure: grid error/empty state; no crash. Debounce + react-query key change (with `signal`) cancels superseded requests so out-of-order responses can't clobber the grid.
- Rapid typing: only the latest debounced term fires; intermediate terms are dropped before navigation.

## 7. Testing
- **Unit (`search/query.ts`)**: `parseSearchParams` reads `q` + validates sort/order/status; `toSearchParams` round-trips and omits defaults + empty `q`; `toSearchItemsArgs` sets `searchTerm`, `includeItemTypes: [Movie, Series]`, `recursive`, correct sort/status mapping, and **has no `parentId`**.
- **Unit (`library/query.ts`)**: existing tests still pass after extracting `sortStatusArgs` (behaviour identical).
- **Hook (`useSearchItems`)**: disabled (no fetch, empty items) when `q` is empty/whitespace; when `q` set, fetches page 0, exposes `total`, de-dupes by Id, pages via `fetchNextPage`.
- **Component (`SearchBox`)**: typing debounces then navigates to `/search?q=…`; Escape collapses; clearing returns. (Use fake timers for the debounce.)
- **Component (`FilterBar`)**: `facets={false}` renders sort + status but no Genre/Decade dropdowns; default still renders them.
- **Component (`Search` route)**: empty `q` → prompt; non-empty → grid; sort change preserves `q` in the URL.
- **E2E (Playwright, live)**: open the nav search, type "matrix" → `/search` shows matching posters (>0), TotalRecordCount reflected; change sort → grid reorders, `q` preserved in URL; open a result → DetailModal; clear query → prompt; a nonsense term → no-results state.

## 8. Milestones (for the plan)
1. Extract `sortStatusArgs` in `library/query.ts` (refactor, tests green).
2. `lib/search/query.ts` (pure) + tests.
3. `useInfiniteItems` primitive + refactor `useLibraryItems` onto it (library tests green).
4. `useSearchItems` + tests.
5. `FilterBar` `facets` prop + test.
6. `SearchBox` component + test; mount in `TopNav`.
7. `Search` route + `/search` router entry; wire FilterBar + PosterGrid + DetailModal; live E2E.

## 9. Open items / dependencies
- `asLibraryQuery(searchQuery)` adapter (genres/decades empty) so `FilterBar` (typed to `LibraryQuery`) can drive search sort/status; conversely map its `onChange` back to `SearchQuery` preserving `q`. Trivial pure mapping, defined in `lib/search/query.ts`.
- Confirm `searchTerm` field name against the installed SDK at implementation (expected on `ItemsApiGetItemsRequest`).
- No new dependencies. `lucide-react` (already added in SP1 polish) provides the `Search` and `X` icons.
