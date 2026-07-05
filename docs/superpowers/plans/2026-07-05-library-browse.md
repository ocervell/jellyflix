# Library Browse (grid + filters) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/library/:viewId` route showing a paginated portrait-poster grid of a Jellyfin library with URL-driven filters (sort, genre, decade, watched status) and infinite scroll.

**Architecture:** A pure `lib/library/query.ts` is the single source of truth translating URL search params ↔ a `LibraryQuery` ↔ SDK `getItems` args. `useLibraryItems` (react-query `useInfiniteQuery`) pages the library; `useLibraryFilters` supplies facet options. Presentational `FilterBar`/`PosterGrid`/`PosterCard` read the query and emit URL param changes; `Library` assembles them and reuses the existing `DetailModal`.

**Tech Stack:** React 18 + TS, `@jellyfin/sdk`, `@tanstack/react-query` (`useInfiniteQuery`), `react-router-dom` v6 hash router (`useSearchParams`), Vitest + RTL.

## Global Constraints

- TypeScript `strict: true`; **no `any`** in `lib/`/`hooks/` (tests may cast).
- `session.serverUrl === '/jf'`; all image/API URLs stay same-origin via the proxy.
- Do NOT modify `vitest.setup.ts` or `vite.config.ts`. Delete any regenerated `vite.config.js`/`.d.ts` after `tsc -b`/build so `git status` is clean.
- Known rare test flake: Node-26 experimental `localStorage` intermittently shadows the vitest.setup.ts polyfill (~1/5 full runs). Re-run once; do not chase it.
- Verified SDK: `getItemsApi(api).getItems(request: ItemsApiGetItemsRequest, { signal })` → `{ data: BaseItemDtoQueryResult { Items, TotalRecordCount, StartIndex } }`. Request fields (all optional): `userId, parentId, recursive, includeItemTypes: BaseItemKind[], sortBy: ItemSortBy[], sortOrder: SortOrder[], genres: string[], years: number[], filters: ItemFilter[], isFavorite: boolean, startIndex, limit, fields: ItemFields[], enableImageTypes: ImageType[], enableTotalRecordCount: boolean`.
- `getFilterApi(api).getQueryFilters({ userId, parentId, includeItemTypes }, { signal })` → `{ data: QueryFilters { Genres: string[], Years: number[], OfficialRatings, Tags } }`.
- Enums (from `@jellyfin/sdk/lib/generated-client`): `ItemSortBy` (`SortName, DateCreated, PremiereDate, CommunityRating, Random`), `SortOrder` (`Ascending, Descending`), `ItemFilter` (`IsUnplayed, IsPlayed, IsFavorite`), `BaseItemKind` (`Movie, Series`), `ItemFields` (`PrimaryImageAspectRatio`), `ImageType` (`Primary, Thumb`).
- Live facts: Movies view id `f137a2dd21bbc1b99aa5c0f6bf02a805` (974 items). `useUserViews()` returns views with `.Id`, `.Name`, `.CollectionType` (`movies`/`tvshows`/…).
- Reused existing modules: `getPosterUrl(api, item, {width})` (`src/lib/jellyfin/images.ts`), `Img` (`src/components/common/Img.tsx`), `ProgressBar` (`src/components/common/ProgressBar.tsx`), `playedPercent` (`src/lib/format.ts`), `DetailModal` (`src/components/detail/DetailModal.tsx`), `TopNav` (`src/components/nav/TopNav.tsx`), `useUserViews` (`src/hooks/api/useUserViews.ts`), `useApi` (`src/hooks/useApi.tsx`), tokens (`src/styles/tokens.css`).
- Commit after each task with the shown message.

---

## Task 1: `lib/library/query.ts` — pure URL/query/args bridge

**Files:**
- Create: `src/lib/library/query.ts`, `src/lib/library/query.test.ts`

**Interfaces:**
- Produces:
  - `type SortField = 'name' | 'dateAdded' | 'year' | 'rating' | 'random'`
  - `type WatchedStatus = 'all' | 'unplayed' | 'played' | 'favorites'`
  - `type LibraryQuery = { sort: SortField; order: 'asc' | 'desc'; genres: string[]; decades: number[]; status: WatchedStatus }`
  - `const DEFAULT_QUERY: LibraryQuery`
  - `parseParams(sp: URLSearchParams): LibraryQuery`
  - `toParams(q: LibraryQuery): URLSearchParams` (omits defaults; comma-joins lists)
  - `type ItemsArgsCtx = { viewId: string; userId: string; includeItemTypes: string[]; startIndex: number; limit: number }`
  - `toGetItemsArgs(q: LibraryQuery, ctx: ItemsArgsCtx): ItemsApiGetItemsRequest`

- [ ] **Step 1: Write the failing test** — `src/lib/library/query.test.ts`
```ts
import { expect, test } from 'vitest';
import { parseParams, toParams, toGetItemsArgs, DEFAULT_QUERY } from './query';

test('parseParams falls back to defaults for empty/invalid', () => {
  expect(parseParams(new URLSearchParams(''))).toEqual(DEFAULT_QUERY);
  expect(parseParams(new URLSearchParams('sort=bogus&order=sideways&status=nope')))
    .toEqual(DEFAULT_QUERY);
});

test('parseParams reads all fields', () => {
  const q = parseParams(new URLSearchParams('sort=year&order=desc&genres=Action,Drame&decades=2010,2000&status=unplayed'));
  expect(q).toEqual({ sort: 'year', order: 'desc', genres: ['Action', 'Drame'], decades: [2010, 2000], status: 'unplayed' });
});

test('toParams omits defaults and round-trips', () => {
  expect(toParams(DEFAULT_QUERY).toString()).toBe('');
  const q = { sort: 'rating' as const, order: 'desc' as const, genres: ['Action'], decades: [2010], status: 'favorites' as const };
  expect(parseParams(toParams(q))).toEqual(q);
});

test('toGetItemsArgs maps sort, decades->years, status->filters, pagination', () => {
  const q = { sort: 'year' as const, order: 'desc' as const, genres: ['Action'], decades: [2010], status: 'unplayed' as const };
  const args = toGetItemsArgs(q, { viewId: 'V', userId: 'U', includeItemTypes: ['Movie'], startIndex: 60, limit: 60 });
  expect(args).toMatchObject({
    userId: 'U', parentId: 'V', recursive: true, includeItemTypes: ['Movie'],
    sortBy: ['PremiereDate'], sortOrder: ['Descending'], genres: ['Action'],
    years: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019],
    filters: ['IsUnplayed'], startIndex: 60, limit: 60, enableTotalRecordCount: true,
  });
});

test('toGetItemsArgs favorites uses isFavorite, random sort ignores order default', () => {
  const fav = toGetItemsArgs({ ...DEFAULT_QUERY, status: 'favorites' }, { viewId: 'V', userId: 'U', includeItemTypes: ['Series'], startIndex: 0, limit: 60 });
  expect(fav.isFavorite).toBe(true);
  expect(fav.filters ?? []).not.toContain('IsFavorite'); // uses isFavorite flag, not the filter
  const rnd = toGetItemsArgs({ ...DEFAULT_QUERY, sort: 'random' }, { viewId: 'V', userId: 'U', includeItemTypes: ['Movie'], startIndex: 0, limit: 60 });
  expect(rnd.sortBy).toEqual(['Random']);
});
```

- [ ] **Step 2: Run, verify fail** — `npm test src/lib/library/query.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/library/query.ts`**
```ts
import type { ItemsApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client';
import {
  ItemSortBy, SortOrder, ItemFilter, BaseItemKind, ItemFields, ImageType,
} from '@jellyfin/sdk/lib/generated-client';

export type SortField = 'name' | 'dateAdded' | 'year' | 'rating' | 'random';
export type WatchedStatus = 'all' | 'unplayed' | 'played' | 'favorites';
export type LibraryQuery = {
  sort: SortField; order: 'asc' | 'desc'; genres: string[]; decades: number[]; status: WatchedStatus;
};

export const DEFAULT_QUERY: LibraryQuery = { sort: 'name', order: 'asc', genres: [], decades: [], status: 'all' };

const SORT_FIELDS: SortField[] = ['name', 'dateAdded', 'year', 'rating', 'random'];
const STATUSES: WatchedStatus[] = ['all', 'unplayed', 'played', 'favorites'];

const SORT_MAP: Record<SortField, ItemSortBy> = {
  name: ItemSortBy.SortName,
  dateAdded: ItemSortBy.DateCreated,
  year: ItemSortBy.PremiereDate,
  rating: ItemSortBy.CommunityRating,
  random: ItemSortBy.Random,
};

function parseList(v: string | null): string[] {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export function parseParams(sp: URLSearchParams): LibraryQuery {
  const sortRaw = sp.get('sort');
  const sort: SortField = SORT_FIELDS.includes(sortRaw as SortField) ? (sortRaw as SortField) : DEFAULT_QUERY.sort;
  const order = sp.get('order') === 'desc' ? 'desc' : 'asc';
  const statusRaw = sp.get('status');
  const status: WatchedStatus = STATUSES.includes(statusRaw as WatchedStatus) ? (statusRaw as WatchedStatus) : DEFAULT_QUERY.status;
  const decades = parseList(sp.get('decades')).map(Number).filter((n) => Number.isInteger(n));
  return { sort, order, genres: parseList(sp.get('genres')), decades, status };
}

export function toParams(q: LibraryQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.sort !== DEFAULT_QUERY.sort) sp.set('sort', q.sort);
  if (q.order !== DEFAULT_QUERY.order) sp.set('order', q.order);
  if (q.genres.length) sp.set('genres', q.genres.join(','));
  if (q.decades.length) sp.set('decades', q.decades.join(','));
  if (q.status !== DEFAULT_QUERY.status) sp.set('status', q.status);
  return sp;
}

export type ItemsArgsCtx = { viewId: string; userId: string; includeItemTypes: string[]; startIndex: number; limit: number };

export function toGetItemsArgs(q: LibraryQuery, ctx: ItemsArgsCtx): ItemsApiGetItemsRequest {
  const years = q.decades.flatMap((d) => Array.from({ length: 10 }, (_, i) => d + i));
  const filters: ItemFilter[] = q.status === 'unplayed' ? [ItemFilter.IsUnplayed]
    : q.status === 'played' ? [ItemFilter.IsPlayed] : [];
  return {
    userId: ctx.userId,
    parentId: ctx.viewId,
    recursive: true,
    includeItemTypes: ctx.includeItemTypes as BaseItemKind[],
    sortBy: [SORT_MAP[q.sort]],
    sortOrder: [q.order === 'desc' ? SortOrder.Descending : SortOrder.Ascending],
    ...(q.genres.length ? { genres: q.genres } : {}),
    ...(years.length ? { years } : {}),
    ...(filters.length ? { filters } : {}),
    ...(q.status === 'favorites' ? { isFavorite: true } : {}),
    startIndex: ctx.startIndex,
    limit: ctx.limit,
    fields: [ItemFields.PrimaryImageAspectRatio],
    enableImageTypes: [ImageType.Primary, ImageType.Thumb],
    enableTotalRecordCount: true,
  };
}
```

- [ ] **Step 4: Run, verify pass.** `npm test src/lib/library/query.test.ts`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: pure library query <-> URL <-> getItems args bridge"`

---

## Task 2: `useLibraryItems` (infinite) + `useLibraryFilters`

**Files:**
- Create: `src/hooks/api/useLibraryItems.ts`, `src/hooks/api/useLibraryFilters.ts`
- Create: `src/hooks/api/useLibraryItems.test.tsx`

**Interfaces:**
- Consumes: `toGetItemsArgs`, `LibraryQuery`, `toParams` (Task 1); `useApi`.
- Produces:
  - `const LIBRARY_PAGE_SIZE = 60`
  - `useLibraryItems(query: LibraryQuery, view: { id: string; includeItemTypes: string[] }): { items: BaseItemDto[]; total: number; fetchNextPage: () => void; hasNextPage: boolean; isLoading: boolean; isError: boolean }`
  - `useLibraryFilters(view: { id: string; includeItemTypes: string[] }): { genres: string[]; decades: number[] }`

- [ ] **Step 1: Write failing test** — `src/hooks/api/useLibraryItems.test.tsx`
```tsx
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u', serverUrl: '/jf', accessToken: 't', userName: 'x' } }) }));
const getItems = vi.fn();
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));

import { useLibraryItems, LIBRARY_PAGE_SIZE } from './useLibraryItems';
import { DEFAULT_QUERY } from '../../lib/library/query';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('appends pages and stops at total', async () => {
  const page = (start: number) => ({ data: { Items: [{ Id: `i${start}`, Name: `n${start}` }], TotalRecordCount: 2, StartIndex: start } });
  getItems.mockImplementation((req: { startIndex: number }) => Promise.resolve(page(req.startIndex)));
  const { result } = renderHook(() => useLibraryItems(DEFAULT_QUERY, { id: 'V', includeItemTypes: ['Movie'] }), { wrapper });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  expect(result.current.total).toBe(2);
  expect(result.current.hasNextPage).toBe(true);
  await act(async () => { result.current.fetchNextPage(); });
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  expect(result.current.hasNextPage).toBe(false);
  // first page requested startIndex 0, second LIBRARY_PAGE_SIZE
  expect(getItems.mock.calls[0][0].startIndex).toBe(0);
  expect(getItems.mock.calls[1][0].startIndex).toBe(LIBRARY_PAGE_SIZE);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `useLibraryItems.ts`**
```ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { toGetItemsArgs, toParams, type LibraryQuery } from '../../lib/library/query';

export const LIBRARY_PAGE_SIZE = 60;

export function useLibraryItems(query: LibraryQuery, view: { id: string; includeItemTypes: string[] }) {
  const { api, session } = useApi();
  const q = useInfiniteQuery({
    queryKey: ['library', session.userId, view.id, view.includeItemTypes.join(','), toParams(query).toString()],
    enabled: !!view.id,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const args = toGetItemsArgs(query, {
        viewId: view.id, userId: session.userId, includeItemTypes: view.includeItemTypes,
        startIndex: pageParam, limit: LIBRARY_PAGE_SIZE,
      });
      const { data } = await getItemsApi(api).getItems(args, { signal });
      return data;
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + (p.Items?.length ?? 0), 0);
      return loaded < (lastPage.TotalRecordCount ?? 0) ? loaded : undefined;
    },
  });
  const items: BaseItemDto[] = (q.data?.pages ?? []).flatMap((p) => p.Items ?? []);
  const total = q.data?.pages[0]?.TotalRecordCount ?? 0;
  return {
    items, total,
    fetchNextPage: () => { void q.fetchNextPage(); },
    hasNextPage: !!q.hasNextPage,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
```

- [ ] **Step 4: Implement `useLibraryFilters.ts`** (no dedicated test file; exercised via component/E2E — keep it tiny and typed)
```ts
import { useQuery } from '@tanstack/react-query';
import { getFilterApi } from '@jellyfin/sdk/lib/utils/api/filter-api';
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';

export function useLibraryFilters(view: { id: string; includeItemTypes: string[] }) {
  const { api, session } = useApi();
  const { data } = useQuery({
    queryKey: ['libraryFilters', session.userId, view.id],
    enabled: !!view.id,
    queryFn: async ({ signal }) => {
      const res = await getFilterApi(api).getQueryFilters(
        { userId: session.userId, parentId: view.id, includeItemTypes: view.includeItemTypes as BaseItemKind[] },
        { signal },
      );
      return res.data;
    },
  });
  const genres = [...(data?.Genres ?? [])].sort((a, b) => a.localeCompare(b));
  const decades = [...new Set((data?.Years ?? []).map((y) => Math.floor(y / 10) * 10))].sort((a, b) => b - a);
  return { genres, decades };
}
```

- [ ] **Step 5: Run tests + `tsc -b`, verify pass. Commit** — `git add -A && git commit -m "feat: useLibraryItems (infinite) + useLibraryFilters (facets)"`

---

## Task 3: `PosterCard` + `PosterGrid` + `useInfiniteScroll`

**Files:**
- Create: `src/hooks/useInfiniteScroll.ts`, `src/hooks/useInfiniteScroll.test.tsx`
- Create: `src/components/library/PosterCard.tsx`, `PosterCard.module.css`, `PosterCard.test.tsx`
- Create: `src/components/library/PosterGrid.tsx`, `PosterGrid.module.css`

**Interfaces:**
- Consumes: `useApi`, `getPosterUrl`, `Img`, `ProgressBar`, `playedPercent`.
- Produces:
  - `useInfiniteScroll(onLoadMore: () => void, enabled: boolean): { sentinelRef: React.RefObject<HTMLDivElement> }`
  - `PosterCard({ item, onOpen }: { item: BaseItemDto; onOpen: (i: BaseItemDto) => void })`
  - `PosterGrid({ items, loading, onOpen, onLoadMore, hasMore }: { items: BaseItemDto[]; loading: boolean; onOpen: (i: BaseItemDto) => void; onLoadMore: () => void; hasMore: boolean })`

- [ ] **Step 1: Write failing test** — `src/hooks/useInfiniteScroll.test.tsx`
```tsx
import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useInfiniteScroll } from './useInfiniteScroll';

test('fires onLoadMore when the sentinel intersects and enabled', () => {
  let trigger: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const observe = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) { trigger = cb; }
    observe = observe; disconnect = vi.fn();
  });
  const onLoadMore = vi.fn();
  function C() { const { sentinelRef } = useInfiniteScroll(onLoadMore, true); return <div ref={sentinelRef} />; }
  render(<C />);
  expect(observe).toHaveBeenCalled();
  trigger([{ isIntersecting: true }]);
  expect(onLoadMore).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `useInfiniteScroll.ts`**
```ts
import { useEffect, useRef } from 'react';

export function useInfiniteScroll(onLoadMore: () => void, enabled: boolean): { sentinelRef: React.RefObject<HTMLDivElement> } {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cb = useRef(onLoadMore); cb.current = onLoadMore;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) cb.current();
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return { sentinelRef: sentinelRef as React.RefObject<HTMLDivElement> };
}
```

- [ ] **Step 4: Write failing PosterCard test** — `src/components/library/PosterCard.test.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getPosterUrl: () => 'http://img/p.jpg' }));
import PosterCard from './PosterCard';

const item = { Id: 'x', Name: 'Fanboys', ProductionYear: 2009, UserData: { PlayedPercentage: 40 } } as BaseItemDto;

test('renders poster, title, year and fires onOpen', async () => {
  const onOpen = vi.fn();
  render(<PosterCard item={item} onOpen={onOpen} />);
  expect(screen.getByRole('img', { name: /fanboys/i })).toBeInTheDocument();
  expect(screen.getByText('Fanboys')).toBeInTheDocument();
  expect(screen.getByText('2009')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /fanboys/i }));
  expect(onOpen).toHaveBeenCalledWith(item);
});
```

- [ ] **Step 5: Implement `PosterCard.tsx`**
```tsx
import { useApi } from '../../hooks/useApi';
import { getPosterUrl } from '../../lib/jellyfin/images';
import { playedPercent } from '../../lib/format';
import { Img } from '../common/Img';
import { ProgressBar } from '../common/ProgressBar';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './PosterCard.module.css';

export default function PosterCard({ item, onOpen }: { item: BaseItemDto; onOpen: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const label = item.Name ?? 'Untitled';
  return (
    <button className={styles.card} onClick={() => onOpen(item)} aria-label={label}>
      <div className={styles.poster}>
        <Img src={getPosterUrl(api, item, { width: 240 })} alt={label} />
        <ProgressBar percent={playedPercent(item)} />
      </div>
      <div className={styles.title}>{label}</div>
      {item.ProductionYear ? <div className={styles.year}>{item.ProductionYear}</div> : null}
    </button>
  );
}
```
`PosterCard.module.css`:
```css
.card { display: flex; flex-direction: column; gap: 6px; text-align: left; width: 100%; }
.poster { position: relative; aspect-ratio: 2 / 3; border-radius: var(--nf-radius); overflow: hidden; background: var(--nf-elevated-2);
  transition: transform .2s var(--nf-ease), box-shadow .2s var(--nf-ease); }
.card:hover .poster, .card:focus-visible .poster { transform: scale(1.04); box-shadow: 0 8px 20px rgba(0,0,0,.6); }
.title { font-size: 13px; font-weight: 600; color: var(--nf-white); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.year { font-size: 12px; color: var(--nf-grey); margin-top: -2px; }
@media (prefers-reduced-motion: reduce) { .poster { transition: none; } }
```

- [ ] **Step 6: Implement `PosterGrid.tsx`** (no dedicated test; covered via Library E2E + the card/scroll unit tests)
```tsx
import PosterCard from './PosterCard';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './PosterGrid.module.css';

export default function PosterGrid({
  items, loading, onOpen, onLoadMore, hasMore,
}: {
  items: BaseItemDto[]; loading: boolean; onOpen: (i: BaseItemDto) => void; onLoadMore: () => void; hasMore: boolean;
}) {
  const { sentinelRef } = useInfiniteScroll(onLoadMore, hasMore && !loading);
  if (loading && items.length === 0) {
    return <div className={styles.grid}>{Array.from({ length: 18 }).map((_, i) => <div key={i} className={styles.skeleton} />)}</div>;
  }
  if (!loading && items.length === 0) {
    return <p className={styles.empty}>No titles match these filters.</p>;
  }
  return (
    <>
      <ul className={styles.grid}>
        {items.map((item) => (
          <li key={item.Id}><PosterCard item={item} onOpen={onOpen} /></li>
        ))}
      </ul>
      <div ref={sentinelRef} className={styles.sentinel} aria-hidden />
      {hasMore && <p className={styles.loadingMore}>Loading more…</p>}
    </>
  );
}
```
`PosterGrid.module.css`:
```css
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 20px 16px; padding: 0 var(--nf-inset); }
.skeleton { aspect-ratio: 2/3; border-radius: var(--nf-radius); background: linear-gradient(90deg,#1a1a1a,#2a2a2a,#1a1a1a); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.empty { padding: 60px var(--nf-inset); color: var(--nf-grey); }
.sentinel { height: 1px; }
.loadingMore { text-align: center; color: var(--nf-grey); padding: 16px; }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
```

- [ ] **Step 7: Run all tests + `tsc -b`. Commit** — `git add -A && git commit -m "feat: PosterCard, PosterGrid, and infinite-scroll sentinel"`

---

## Task 4: `Dropdown` + `FilterBar`

**Files:**
- Create: `src/components/library/Dropdown.tsx`, `Dropdown.module.css`
- Create: `src/components/library/FilterBar.tsx`, `FilterBar.module.css`, `FilterBar.test.tsx`

**Interfaces:**
- Consumes: `LibraryQuery`, `toParams`, `DEFAULT_QUERY` (Task 1).
- Produces:
  - `Dropdown({ label, children }: { label: string; children: React.ReactNode })` — a button that toggles a popover containing `children`; closes on outside click / Escape.
  - `FilterBar({ query, genres, decades, total, onChange }: { query: LibraryQuery; genres: string[]; decades: number[]; total: number; onChange: (q: LibraryQuery) => void })` — renders Sort (field select + asc/desc), Genre (multi), Decade (multi), Status (segmented), a Clear button, and the `total` count; each control calls `onChange` with the next `LibraryQuery`.

- [ ] **Step 1: Write failing test** — `src/components/library/FilterBar.test.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import FilterBar from './FilterBar';
import { DEFAULT_QUERY } from '../../lib/library/query';

test('changing sort and toggling a genre call onChange with updated query', async () => {
  const onChange = vi.fn();
  render(<FilterBar query={DEFAULT_QUERY} genres={['Action', 'Drame']} decades={[2010, 2000]} total={974} onChange={onChange} />);
  expect(screen.getByText(/974/)).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText(/sort by/i), 'year');
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_QUERY, sort: 'year' });
  // open Genre dropdown and toggle Action
  await userEvent.click(screen.getByRole('button', { name: /genre/i }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Action' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_QUERY, genres: ['Action'] });
});

test('status segmented control and clear', async () => {
  const onChange = vi.fn();
  render(<FilterBar query={{ ...DEFAULT_QUERY, status: 'unplayed', genres: ['Action'] }} genres={['Action']} decades={[]} total={5} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: /^played$/i }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'played' }));
  await userEvent.click(screen.getByRole('button', { name: /clear/i }));
  expect(onChange).toHaveBeenCalledWith(DEFAULT_QUERY);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `Dropdown.tsx`**
```tsx
import { useEffect, useRef, useState } from 'react';
import styles from './Dropdown.module.css';

export default function Dropdown({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{label} ▾</button>
      {open && <div className={styles.menu} role="menu">{children}</div>}
    </div>
  );
}
```
`Dropdown.module.css`:
```css
.wrap { position: relative; }
.trigger { padding: 8px 12px; background: var(--nf-elevated); color: #fff; border-radius: var(--nf-radius); font-size: 14px; }
.trigger:hover { background: var(--nf-elevated-2); }
.menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 50; min-width: 200px; max-height: 320px; overflow-y: auto;
  background: rgba(0,0,0,.95); border: 1px solid #333; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 2px; }
.menu label { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; color: #fff; font-size: 14px; cursor: pointer; }
.menu label:hover { background: rgba(255,255,255,.08); }
```

- [ ] **Step 4: Implement `FilterBar.tsx`**
```tsx
import Dropdown from './Dropdown';
import { DEFAULT_QUERY, type LibraryQuery, type SortField, type WatchedStatus } from '../../lib/library/query';
import styles from './FilterBar.module.css';

const SORT_LABELS: Record<SortField, string> = { name: 'Name', dateAdded: 'Date added', year: 'Release year', rating: 'Rating', random: 'Random' };
const STATUS: WatchedStatus[] = ['all', 'unplayed', 'played', 'favorites'];
const STATUS_LABELS: Record<WatchedStatus, string> = { all: 'All', unplayed: 'Unplayed', played: 'Played', favorites: 'Favorites' };

export default function FilterBar({
  query, genres, decades, total, onChange,
}: {
  query: LibraryQuery; genres: string[]; decades: number[]; total: number; onChange: (q: LibraryQuery) => void;
}) {
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const isDefault = JSON.stringify(query) === JSON.stringify(DEFAULT_QUERY);
  return (
    <div className={styles.bar}>
      <label className={styles.sort}>Sort by
        <select aria-label="Sort by" value={query.sort} onChange={(e) => onChange({ ...query, sort: e.target.value as SortField })}>
          {(Object.keys(SORT_LABELS) as SortField[]).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
        </select>
      </label>
      <button className={styles.order} aria-label="Toggle sort order"
        onClick={() => onChange({ ...query, order: query.order === 'asc' ? 'desc' : 'asc' })}>
        {query.order === 'asc' ? '↑' : '↓'}
      </button>

      <Dropdown label={`Genre${query.genres.length ? ` (${query.genres.length})` : ''}`}>
        {genres.map((g) => (
          <label key={g}><input type="checkbox" aria-label={g} checked={query.genres.includes(g)}
            onChange={() => onChange({ ...query, genres: toggle(query.genres, g) })} />{g}</label>
        ))}
      </Dropdown>

      <Dropdown label={`Decade${query.decades.length ? ` (${query.decades.length})` : ''}`}>
        {decades.map((d) => (
          <label key={d}><input type="checkbox" aria-label={`${d}s`} checked={query.decades.includes(d)}
            onChange={() => onChange({ ...query, decades: toggle(query.decades, d) })} />{d}s</label>
        ))}
      </Dropdown>

      <div className={styles.status} role="group" aria-label="Watched status">
        {STATUS.map((s) => (
          <button key={s} aria-label={STATUS_LABELS[s]} className={query.status === s ? styles.active : ''}
            onClick={() => onChange({ ...query, status: s })}>{STATUS_LABELS[s]}</button>
        ))}
      </div>

      {!isDefault && <button className={styles.clear} onClick={() => onChange(DEFAULT_QUERY)}>Clear</button>}
      <span className={styles.count}>{total} titles</span>
    </div>
  );
}
```
`FilterBar.module.css`:
```css
.bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px var(--nf-inset); position: sticky; top: var(--nf-nav-h); z-index: 40; background: rgba(20,20,20,.92); backdrop-filter: blur(6px); }
.sort { display: flex; align-items: center; gap: 6px; color: var(--nf-grey); font-size: 14px; }
.sort select { background: var(--nf-elevated); color: #fff; padding: 8px 10px; border-radius: var(--nf-radius); }
.order { width: 36px; height: 36px; background: var(--nf-elevated); color: #fff; border-radius: var(--nf-radius); }
.status { display: inline-flex; border: 1px solid #333; border-radius: var(--nf-radius); overflow: hidden; }
.status button { padding: 8px 12px; color: var(--nf-grey); font-size: 14px; }
.status button:hover { color: #fff; }
.status .active { background: var(--nf-red); color: #fff; }
.clear { color: var(--nf-grey); font-size: 14px; text-decoration: underline; }
.count { margin-left: auto; color: var(--nf-grey); font-size: 14px; }
```

- [ ] **Step 5: Run tests + `tsc -b`. Commit** — `git add -A && git commit -m "feat: FilterBar (sort/genre/decade/status) + Dropdown"`

---

## Task 5: `Library` route + router + TopNav wiring

**Files:**
- Create: `src/routes/Library.tsx`, `src/routes/Library.module.css`
- Modify: `src/router.tsx` (add `/library/:viewId`)
- Modify: `src/components/nav/TopNav.tsx` (resolve Movies/TV Shows → `/library/:id`)

**Interfaces:**
- Consumes: `parseParams`/`toParams`/`DEFAULT_QUERY` (Task 1), `useLibraryItems`/`useLibraryFilters` (Task 2), `PosterGrid` (Task 3), `FilterBar` (Task 4), `useUserViews`, `DetailModal`, `TopNav`.

- [ ] **Step 1: Implement `Library.tsx`**
```tsx
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import TopNav from '../components/nav/TopNav';
import FilterBar from '../components/library/FilterBar';
import PosterGrid from '../components/library/PosterGrid';
import DetailModal from '../components/detail/DetailModal';
import { useUserViews } from '../hooks/api/useUserViews';
import { useLibraryItems } from '../hooks/api/useLibraryItems';
import { useLibraryFilters } from '../hooks/api/useLibraryFilters';
import { parseParams, toParams, type LibraryQuery } from '../lib/library/query';
import styles from './Library.module.css';

function itemTypesFor(collectionType?: string | null): string[] {
  return collectionType === 'tvshows' ? ['Series'] : ['Movie'];
}

export default function Library() {
  const { viewId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parseParams(searchParams), [searchParams]);
  const { data: views = [] } = useUserViews();
  const view = views.find((v) => v.Id === viewId);
  const includeItemTypes = itemTypesFor(view?.CollectionType);
  const viewCtx = { id: viewId, includeItemTypes };

  const { items, total, fetchNextPage, hasNextPage, isLoading } = useLibraryItems(query, viewCtx);
  const { genres, decades } = useLibraryFilters(viewCtx);
  const [detail, setDetail] = useState<BaseItemDto | null>(null);

  const onChange = useCallback((q: LibraryQuery) => { setSearchParams(toParams(q)); window.scrollTo({ top: 0 }); }, [setSearchParams]);
  const onOpen = useCallback((i: BaseItemDto) => setDetail(i), []);
  const onPlay = useCallback((i: BaseItemDto) => navigate(`/watch/${i.Id}`), [navigate]);

  return (
    <div className={styles.page}>
      <TopNav />
      <div className={styles.body}>
        <h1 className={styles.heading}>{view?.Name ?? 'Library'}</h1>
        <FilterBar query={query} genres={genres} decades={decades} total={total} onChange={onChange} />
        <PosterGrid items={items} loading={isLoading} onOpen={onOpen} onLoadMore={fetchNextPage} hasMore={hasNextPage} />
      </div>
      {detail?.Id && <DetailModal itemId={detail.Id} onClose={() => setDetail(null)} onPlay={onPlay} />}
    </div>
  );
}
```
`Library.module.css`:
```css
.page { min-height: 100%; padding-bottom: 60px; }
.body { padding-top: var(--nf-nav-h); }
.heading { font-size: clamp(22px, 3vw, 34px); font-weight: 800; padding: 24px var(--nf-inset) 8px; }
```

- [ ] **Step 2: Add the route** in `src/router.tsx`:
```tsx
import Library from './routes/Library';
// inside the routes array, after '/':
{ path: '/library/:viewId', element: <RequireAuth><Library /></RequireAuth> },
```

- [ ] **Step 3: Wire TopNav links** — rewrite the links block in `src/components/nav/TopNav.tsx` to resolve real view ids. Add `useUserViews` + `useLocation`:
```tsx
import { useUserViews } from '../../hooks/api/useUserViews';
import { useLocation } from 'react-router-dom';
// ...inside TopNav():
const { data: views = [] } = useUserViews();
const location = useLocation();
const movies = views.find((v) => v.CollectionType === 'movies');
const tv = views.find((v) => v.CollectionType === 'tvshows');
const isActive = (id?: string) => id && location.pathname === `/library/${id}`;
// replace the three <a> links with:
<nav className={styles.links}>
  <a href="#/" className={location.pathname === '/' ? styles.active : ''}>Home</a>
  {tv && <a href={`#/library/${tv.Id}`} className={isActive(tv.Id) ? styles.active : ''}>TV Shows</a>}
  {movies && <a href={`#/library/${movies.Id}`} className={isActive(movies.Id) ? styles.active : ''}>Movies</a>}
</nav>
```
Add an `.active { color: var(--nf-white); }` rule to `TopNav.module.css` (links are grey by default).

- [ ] **Step 4: Run `npm test` + `npx tsc -b` + `npm run build`.** All pass; delete regenerated `vite.config.js`/`.d.ts`.

- [ ] **Step 5: Playwright E2E (live).** Against the running dev server: log in; navigate to `#/library/f137a2dd21bbc1b99aa5c0f6bf02a805` (Movies); assert the grid renders posters and the "974 titles" count; open the Genre dropdown, check "Action" → assert the URL gains `genres=Action` and the count drops; change Sort to "Release year" + toggle order → URL updates; scroll to the bottom → item count grows (next page); click a poster → DetailModal opens; click the nav "Movies" link → routes to the library. Capture a screenshot.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: Library route with filters + infinite scroll; wire nav links"`

---

## Self-Review

**Spec coverage:**
- §1 route `/library/:viewId` + filters (sort/genre/decade/status) + infinite scroll + URL state + portrait posters + nav wiring + DetailModal → Tasks 1–5. ✓
- §3 architecture (query.ts, useLibraryItems, useLibraryFilters, FilterBar, PosterCard, PosterGrid, useInfiniteScroll, Library, TopNav, router) → all tasked. ✓
- §5 component behaviours (2:3 poster+year+progress; grid+sentinel; sticky FilterBar controls→URL) → Tasks 3,4,5. ✓
- §6 error/empty/loading (skeleton, empty state, defaults fallback) → Task 3 (grid states) + Task 1 (parse fallback). ✓
- §7 testing (query pure tests, infinite hook test, infinite-scroll + PosterCard + FilterBar component tests, live E2E) → Tasks 1–5. ✓

**Type consistency:** `LibraryQuery`, `SortField`, `WatchedStatus`, `DEFAULT_QUERY`, `toParams`, `parseParams`, `toGetItemsArgs`, `LIBRARY_PAGE_SIZE`, the `view: { id; includeItemTypes }` shape, and `useLibraryItems`'s return (`items/total/fetchNextPage/hasNextPage/isLoading/isError`) are defined once (Tasks 1–2) and consumed consistently (Tasks 3–5). `getItems` uses the request-object form `ItemsApiGetItemsRequest`; `getQueryFilters` uses the request-object form.

**Placeholder scan:** no TBD/TODO; every code step is complete. `useLibraryFilters` and `PosterGrid` intentionally have no dedicated unit test (thin/visual) — both are exercised by the Task 5 live E2E and the neighbouring unit tests, and this is stated at their steps, not left implicit.

**Known follow-ups (Minor):**
- `useLibraryFilters` result feeds the `getQueryFilters` casing assumption; if the SDK response uses different field casing, adjust in Task 2 (noted).
- The nav shows only Movies/TV Shows; other libraries (Documentaries) are reachable by URL but not linked — acceptable for v1 (a future "Browse" dropdown could list all views).
