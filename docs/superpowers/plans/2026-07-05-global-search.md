# Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a debounced nav search box that opens a `/search?q=` page showing matching Movies + Series in the existing infinite poster grid, filterable by sort + watched-status.

**Architecture:** Global search reuses the library-browse item pipeline (`getItems` → poster grid → infinite scroll → DetailModal) with `searchTerm` set and no `parentId`. A shared `sortStatusArgs` helper and a shared `useInfiniteItems` hook are extracted from the library code so search and library stay identical where they overlap. A `SearchBox` in `TopNav` debounces typing into `/search?q=`.

**Tech Stack:** Vite + React 19 + TypeScript (strict) + @tanstack/react-query v5 + @jellyfin/sdk + react-router-dom v7 (hash router) + lucide-react (already a dependency).

## Global Constraints

- TypeScript strict; **no `any`** (narrow casts on `unknown` only where unavoidable).
- @jellyfin/sdk is called in request-object form, e.g. `getItemsApi(api).getItems({ ... })`.
- Results are **Movie + Series only**; result filters are **sort + watched-status only** (no genre/decade facets).
- Search is **debounced ~300 ms**; results live at `/search?q=<term>`; navigation while refining uses `{ replace: true }`, first entry to `/search` uses a push.
- Reuse existing units: `getItems`, `PosterGrid`, `useInfiniteScroll`, `DetailModal`, `FilterBar`. No new dependencies.
- **Do NOT modify** `vitest.setup.ts` or `vite.config.ts`.
- Existing tests must stay green after refactors: `src/lib/library/query.test.ts`, `src/hooks/api/useLibraryItems.test.tsx`.
- Run the whole suite with `npx vitest run` and typecheck with `npx tsc --noEmit`.

---

### Task 1: Extract `sortStatusArgs` from library query

**Files:**
- Modify: `src/lib/library/query.ts`
- Test: `src/lib/library/query.test.ts`

**Interfaces:**
- Consumes: existing `LibraryQuery`, `SORT_MAP`, `ItemFilter`, `SortOrder`.
- Produces: `sortStatusArgs(q: Pick<LibraryQuery, 'sort' | 'order' | 'status'>): Partial<ItemsApiGetItemsRequest>` returning `{ sortBy, sortOrder, ...(filters?), ...(isFavorite?) }`. `toGetItemsArgs` is refactored to call it; its output is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/library/query.test.ts`:

```ts
import { sortStatusArgs } from './query';

test('sortStatusArgs maps sort/order and status', () => {
  expect(sortStatusArgs({ sort: 'year', order: 'desc', status: 'unplayed' }))
    .toEqual({ sortBy: ['PremiereDate'], sortOrder: ['Descending'], filters: ['IsUnplayed'] });
  expect(sortStatusArgs({ sort: 'name', order: 'asc', status: 'played' }))
    .toEqual({ sortBy: ['SortName'], sortOrder: ['Ascending'], filters: ['IsPlayed'] });
  expect(sortStatusArgs({ sort: 'name', order: 'asc', status: 'favorites' }))
    .toEqual({ sortBy: ['SortName'], sortOrder: ['Ascending'], isFavorite: true });
  expect(sortStatusArgs({ sort: 'name', order: 'asc', status: 'all' }))
    .toEqual({ sortBy: ['SortName'], sortOrder: ['Ascending'] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/library/query.test.ts`
Expected: FAIL — `sortStatusArgs` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/library/query.ts`, add the exported helper and refactor `toGetItemsArgs` to use it (leave everything else — `parseParams`, `toParams`, `SORT_MAP`, types — unchanged):

```ts
export function sortStatusArgs(q: Pick<LibraryQuery, 'sort' | 'order' | 'status'>): Partial<ItemsApiGetItemsRequest> {
  const filters: ItemFilter[] = q.status === 'unplayed' ? [ItemFilter.IsUnplayed]
    : q.status === 'played' ? [ItemFilter.IsPlayed] : [];
  return {
    sortBy: [SORT_MAP[q.sort]],
    sortOrder: [q.order === 'desc' ? SortOrder.Descending : SortOrder.Ascending],
    ...(filters.length ? { filters } : {}),
    ...(q.status === 'favorites' ? { isFavorite: true } : {}),
  };
}

export function toGetItemsArgs(q: LibraryQuery, ctx: ItemsArgsCtx): ItemsApiGetItemsRequest {
  const years = q.decades.flatMap((d) => Array.from({ length: 10 }, (_, i) => d + i));
  return {
    userId: ctx.userId,
    parentId: ctx.viewId,
    recursive: true,
    includeItemTypes: ctx.includeItemTypes as BaseItemKind[],
    ...sortStatusArgs(q),
    ...(q.genres.length ? { genres: q.genres } : {}),
    ...(years.length ? { years } : {}),
    startIndex: ctx.startIndex,
    limit: ctx.limit,
    fields: [ItemFields.PrimaryImageAspectRatio],
    enableImageTypes: [ImageType.Primary, ImageType.Thumb],
    enableTotalRecordCount: true,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/library/query.test.ts`
Expected: PASS — the new `sortStatusArgs` test and all pre-existing `toGetItemsArgs`/`parseParams`/`toParams` tests (behaviour unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/query.ts src/lib/library/query.test.ts
git commit -m "refactor: extract sortStatusArgs from toGetItemsArgs"
```

---

### Task 2: Search query module (`lib/search/query.ts`)

**Files:**
- Create: `src/lib/search/query.ts`
- Test: `src/lib/search/query.test.ts`

**Interfaces:**
- Consumes: `parseParams`, `toParams`, `sortStatusArgs`, `SortField`, `WatchedStatus`, `LibraryQuery` from `../library/query`; `BaseItemKind`, `ItemFields`, `ImageType`, `ItemsApiGetItemsRequest` from the SDK.
- Produces:
  - `type SearchQuery = { q: string; sort: SortField; order: 'asc' | 'desc'; status: WatchedStatus }`
  - `parseSearchParams(sp: URLSearchParams): SearchQuery`
  - `toSearchParams(q: SearchQuery): URLSearchParams`
  - `asLibraryQuery(q: SearchQuery): LibraryQuery`
  - `toSearchItemsArgs(q: SearchQuery, ctx: { userId: string; startIndex: number; limit: number }): ItemsApiGetItemsRequest`

- [ ] **Step 1: Write the failing test**

Create `src/lib/search/query.test.ts`:

```ts
import { expect, test } from 'vitest';
import { parseSearchParams, toSearchParams, asLibraryQuery, toSearchItemsArgs } from './query';

test('parseSearchParams reads q plus sort/order/status with fallback', () => {
  expect(parseSearchParams(new URLSearchParams('q=matrix&sort=year&order=desc&status=unplayed')))
    .toEqual({ q: 'matrix', sort: 'year', order: 'desc', status: 'unplayed' });
  expect(parseSearchParams(new URLSearchParams('')))
    .toEqual({ q: '', sort: 'name', order: 'asc', status: 'all' });
});

test('toSearchParams omits defaults and empty q, round-trips', () => {
  expect(toSearchParams({ q: '', sort: 'name', order: 'asc', status: 'all' }).toString()).toBe('');
  const q = { q: 'matrix', sort: 'year' as const, order: 'desc' as const, status: 'played' as const };
  expect(parseSearchParams(toSearchParams(q))).toEqual(q);
});

test('asLibraryQuery keeps sort/status, empties facets', () => {
  expect(asLibraryQuery({ q: 'x', sort: 'rating', order: 'desc', status: 'favorites' }))
    .toEqual({ sort: 'rating', order: 'desc', genres: [], decades: [], status: 'favorites' });
});

test('toSearchItemsArgs searches globally over Movie+Series with searchTerm and no parentId', () => {
  const args = toSearchItemsArgs(
    { q: 'matrix', sort: 'year', order: 'desc', status: 'unplayed' },
    { userId: 'U', startIndex: 60, limit: 60 },
  );
  expect(args).toMatchObject({
    userId: 'U', recursive: true, includeItemTypes: ['Movie', 'Series'],
    searchTerm: 'matrix', sortBy: ['PremiereDate'], sortOrder: ['Descending'],
    filters: ['IsUnplayed'], startIndex: 60, limit: 60, enableTotalRecordCount: true,
  });
  expect('parentId' in args).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/search/query.test.ts`
Expected: FAIL — module `./query` does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/search/query.ts`:

```ts
import type { ItemsApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind, ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import {
  parseParams, toParams, sortStatusArgs,
  type LibraryQuery, type SortField, type WatchedStatus,
} from '../library/query';

export type SearchQuery = { q: string; sort: SortField; order: 'asc' | 'desc'; status: WatchedStatus };

export function parseSearchParams(sp: URLSearchParams): SearchQuery {
  const { sort, order, status } = parseParams(sp);
  return { q: sp.get('q') ?? '', sort, order, status };
}

export function toSearchParams(q: SearchQuery): URLSearchParams {
  const sp = toParams({ sort: q.sort, order: q.order, genres: [], decades: [], status: q.status });
  if (q.q.trim()) sp.set('q', q.q);
  return sp;
}

export function asLibraryQuery(q: SearchQuery): LibraryQuery {
  return { sort: q.sort, order: q.order, genres: [], decades: [], status: q.status };
}

export function toSearchItemsArgs(
  q: SearchQuery,
  ctx: { userId: string; startIndex: number; limit: number },
): ItemsApiGetItemsRequest {
  return {
    userId: ctx.userId,
    recursive: true,
    includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
    searchTerm: q.q,
    ...sortStatusArgs(q),
    startIndex: ctx.startIndex,
    limit: ctx.limit,
    fields: [ItemFields.PrimaryImageAspectRatio],
    enableImageTypes: [ImageType.Primary, ImageType.Thumb],
    enableTotalRecordCount: true,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/search/query.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/query.ts src/lib/search/query.test.ts
git commit -m "feat: search query module (SearchQuery, URL <-> args)"
```

---

### Task 3: Shared `useInfiniteItems` hook; refactor `useLibraryItems`

**Files:**
- Create: `src/hooks/api/useInfiniteItems.ts`
- Modify: `src/hooks/api/useLibraryItems.ts`
- Test (regression gate, unchanged): `src/hooks/api/useLibraryItems.test.tsx`

**Interfaces:**
- Produces: `useInfiniteItems(opts: { queryKey: unknown[]; enabled: boolean; argsFor: (startIndex: number) => ItemsApiGetItemsRequest }): { items: BaseItemDto[]; total: number; fetchNextPage: () => void; hasNextPage: boolean; isLoading: boolean; isError: boolean }` and `ITEMS_PAGE_SIZE = 60`.
- `useLibraryItems(query, view)` keeps the exact same signature and return shape; `LIBRARY_PAGE_SIZE` is re-exported as `ITEMS_PAGE_SIZE`.

This is a refactor: the existing `useLibraryItems.test.tsx` is the safety net (it mocks `getItemsApi().getItems` and asserts paging, de-dupe, and `startIndex` of each call). Keep it passing unchanged.

- [ ] **Step 1: Run the existing tests to confirm the baseline is green**

Run: `npx vitest run src/hooks/api/useLibraryItems.test.tsx`
Expected: PASS (2 tests) before refactoring.

- [ ] **Step 2: Create `useInfiniteItems`**

Create `src/hooks/api/useInfiniteItems.ts`:

```ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import type { BaseItemDto, ItemsApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';

export const ITEMS_PAGE_SIZE = 60;

export function useInfiniteItems(opts: {
  queryKey: unknown[];
  enabled: boolean;
  argsFor: (startIndex: number) => ItemsApiGetItemsRequest;
}) {
  const { api } = useApi();
  const q = useInfiniteQuery({
    queryKey: opts.queryKey,
    enabled: opts.enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await getItemsApi(api).getItems(opts.argsFor(pageParam), { signal });
      return data;
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + (p.Items?.length ?? 0), 0);
      return loaded < (lastPage.TotalRecordCount ?? 0) ? allPages.length * ITEMS_PAGE_SIZE : undefined;
    },
  });
  const seen = new Set<string>();
  const items: BaseItemDto[] = (q.data?.pages ?? [])
    .flatMap((p) => p.Items ?? [])
    .filter((it) => {
      const id = it.Id ?? '';
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
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

- [ ] **Step 3: Refactor `useLibraryItems` onto it**

Replace the body of `src/hooks/api/useLibraryItems.ts` with:

```ts
import { useApi } from '../useApi';
import { useInfiniteItems, ITEMS_PAGE_SIZE } from './useInfiniteItems';
import { toGetItemsArgs, toParams, type LibraryQuery } from '../../lib/library/query';

export const LIBRARY_PAGE_SIZE = ITEMS_PAGE_SIZE;

export function useLibraryItems(query: LibraryQuery, view: { id: string; includeItemTypes: string[] }) {
  const { session } = useApi();
  return useInfiniteItems({
    queryKey: ['library', session.userId, view.id, view.includeItemTypes.join(','), toParams(query).toString()],
    enabled: !!view.id,
    argsFor: (startIndex) => toGetItemsArgs(query, {
      viewId: view.id, userId: session.userId, includeItemTypes: view.includeItemTypes,
      startIndex, limit: ITEMS_PAGE_SIZE,
    }),
  });
}
```

- [ ] **Step 4: Run tests to verify they still pass**

Run: `npx vitest run src/hooks/api/useLibraryItems.test.tsx`
Expected: PASS (2 tests) — identical behaviour; `getItems` still called with `startIndex` 0 then 60, de-dupe intact.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/api/useInfiniteItems.ts src/hooks/api/useLibraryItems.ts
git commit -m "refactor: extract useInfiniteItems, use it in useLibraryItems"
```

---

### Task 4: `useSearchItems` hook

**Files:**
- Create: `src/hooks/api/useSearchItems.ts`
- Test: `src/hooks/api/useSearchItems.test.tsx`

**Interfaces:**
- Consumes: `useInfiniteItems`, `ITEMS_PAGE_SIZE` (Task 3); `toSearchItemsArgs`, `toSearchParams`, `SearchQuery` (Task 2); `useApi`.
- Produces: `useSearchItems(query: SearchQuery)` returning the `useInfiniteItems` shape. Query key `['search', userId, toSearchParams(query).toString()]`; **enabled only when `query.q.trim()` is non-empty**.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/api/useSearchItems.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi, beforeEach } from 'vitest';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
const getItems = vi.fn();
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));

import { useSearchItems } from './useSearchItems';
import type { SearchQuery } from '../../lib/search/query';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const base: SearchQuery = { q: '', sort: 'name', order: 'asc', status: 'all' };

beforeEach(() => getItems.mockReset());

test('does not fetch when q is empty/whitespace', async () => {
  const { result } = renderHook(() => useSearchItems({ ...base, q: '   ' }), { wrapper });
  await Promise.resolve();
  expect(getItems).not.toHaveBeenCalled();
  expect(result.current.items).toEqual([]);
});

test('fetches with searchTerm when q is present', async () => {
  getItems.mockResolvedValue({ data: { Items: [{ Id: 'a', Name: 'A' }], TotalRecordCount: 1, StartIndex: 0 } });
  const { result } = renderHook(() => useSearchItems({ ...base, q: 'matrix' }), { wrapper });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  expect(getItems.mock.calls[0][0]).toMatchObject({ searchTerm: 'matrix', includeItemTypes: ['Movie', 'Series'], startIndex: 0 });
  expect(result.current.total).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/api/useSearchItems.test.tsx`
Expected: FAIL — module `./useSearchItems` does not exist.

- [ ] **Step 3: Implement**

Create `src/hooks/api/useSearchItems.ts`:

```ts
import { useApi } from '../useApi';
import { useInfiniteItems, ITEMS_PAGE_SIZE } from './useInfiniteItems';
import { toSearchItemsArgs, toSearchParams, type SearchQuery } from '../../lib/search/query';

export function useSearchItems(query: SearchQuery) {
  const { session } = useApi();
  return useInfiniteItems({
    queryKey: ['search', session.userId, toSearchParams(query).toString()],
    enabled: query.q.trim().length > 0,
    argsFor: (startIndex) => toSearchItemsArgs(query, { userId: session.userId, startIndex, limit: ITEMS_PAGE_SIZE }),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/api/useSearchItems.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/api/useSearchItems.ts src/hooks/api/useSearchItems.test.tsx
git commit -m "feat: useSearchItems infinite hook (enabled on non-empty query)"
```

---

### Task 5: `FilterBar` `facets` prop + `PosterGrid` `emptyMessage` prop

**Files:**
- Modify: `src/components/library/FilterBar.tsx`
- Modify: `src/components/library/PosterGrid.tsx`
- Test: `src/components/library/FilterBar.test.tsx` (create if absent; otherwise append)

**Interfaces:**
- `FilterBar` gains optional `facets?: boolean` (default `true`); when `false`, the Genre and Decade dropdowns are not rendered. All existing props/behaviour unchanged.
- `PosterGrid` gains optional `emptyMessage?: string` (default `'No titles match these filters.'`) used in its empty branch.

- [ ] **Step 1: Write the failing test**

Create `src/components/library/FilterBar.test.tsx` (if it already exists, append the two `facets` tests):

```tsx
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import FilterBar from './FilterBar';
import { DEFAULT_QUERY } from '../../lib/library/query';

const genres = ['Action', 'Drama'];
const decades = [2010, 2000];

test('renders Genre and Decade dropdowns by default', () => {
  render(<FilterBar query={DEFAULT_QUERY} genres={genres} decades={decades} total={3} onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: /genre/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /decade/i })).toBeInTheDocument();
});

test('facets=false hides Genre and Decade but keeps sort + status', () => {
  render(<FilterBar query={DEFAULT_QUERY} genres={genres} decades={decades} total={3} facets={false} onChange={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /genre/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /decade/i })).not.toBeInTheDocument();
  expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^unplayed$/i })).toBeInTheDocument();
});
```

Note: `Dropdown` renders its `label` on a toggle `<button>`, so `getByRole('button', { name: /genre/i })` targets the Genre dropdown.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/library/FilterBar.test.tsx`
Expected: FAIL — `facets=false` still renders the Genre/Decade buttons.

- [ ] **Step 3: Implement**

In `src/components/library/FilterBar.tsx`, add `facets` to the props and gate the two dropdowns. Change the signature:

```tsx
export default function FilterBar({
  query, genres, decades, total, onChange, facets = true,
}: {
  query: LibraryQuery; genres: string[]; decades: number[]; total: number;
  onChange: (q: LibraryQuery) => void; facets?: boolean;
}) {
```

Wrap the two `<Dropdown>` blocks (Genre and Decade) in a fragment guarded by `facets`:

```tsx
      {facets && (
        <>
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
        </>
      )}
```

Then in `src/components/library/PosterGrid.tsx`, add the optional prop and use it. Change the signature and the empty branch:

```tsx
export default function PosterGrid({
  items, loading, onOpen, onLoadMore, hasMore, emptyMessage = 'No titles match these filters.',
}: {
  items: BaseItemDto[]; loading: boolean; onOpen: (i: BaseItemDto) => void;
  onLoadMore: () => void; hasMore: boolean; emptyMessage?: string;
}) {
```

```tsx
  if (!loading && items.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/library/FilterBar.test.tsx`
Expected: PASS (2 tests). Also run `npx vitest run` to confirm the existing Library-related tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/library/FilterBar.tsx src/components/library/PosterGrid.tsx src/components/library/FilterBar.test.tsx
git commit -m "feat: FilterBar facets toggle + PosterGrid emptyMessage"
```

---

### Task 6: `SearchBox` component + mount in `TopNav`

**Files:**
- Create: `src/components/nav/SearchBox.tsx`
- Create: `src/components/nav/SearchBox.module.css`
- Modify: `src/components/nav/TopNav.tsx`
- Test: `src/components/nav/SearchBox.test.tsx`

**Interfaces:**
- Consumes: `parseSearchParams`, `toSearchParams` (Task 2); `useNavigate`, `useLocation`, `useSearchParams` from react-router-dom; `Search`, `X` from lucide-react.
- Produces: default-exported `SearchBox` (no props). Debounces input ~300 ms then navigates to `/search?<params>`; preserves sort/order/status when already on `/search`; Escape/clear collapses and returns.

- [ ] **Step 1: Write the failing test**

Create `src/components/nav/SearchBox.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import SearchBox from './SearchBox';

beforeEach(() => { navigate.mockReset(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('typing debounces then navigates to /search?q=', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<MemoryRouter initialEntries={['/']}><SearchBox /></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: /search/i }));
  await user.type(screen.getByRole('textbox', { name: /search/i }), 'matrix');
  expect(navigate).not.toHaveBeenCalled();          // still within debounce window
  act(() => { vi.advanceTimersByTime(300); });
  expect(navigate).toHaveBeenCalledWith('/search?q=matrix', { replace: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/nav/SearchBox.test.tsx`
Expected: FAIL — module `./SearchBox` does not exist.

- [ ] **Step 3: Implement**

Create `src/components/nav/SearchBox.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { parseSearchParams, toSearchParams } from '../../lib/search/query';
import styles from './SearchBox.module.css';

const DEBOUNCE_MS = 300;

export default function SearchBox() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const onSearch = location.pathname === '/search';
  const [open, setOpen] = useState(onSearch);
  const [text, setText] = useState(onSearch ? (searchParams.get('q') ?? '') : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const term = text.trim();
      if (!term) return;
      const base = onSearch
        ? parseSearchParams(searchParams)
        : { q: '', sort: 'name' as const, order: 'asc' as const, status: 'all' as const };
      const sp = toSearchParams({ ...base, q: term });
      navigate(`/search?${sp.toString()}`, { replace: onSearch });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
    // Refine on each keystroke; onSearch/searchParams read at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, open]);

  const close = () => {
    clearTimeout(timer.current);
    setOpen(false);
    setText('');
    if (onSearch) navigate(-1);
  };

  return (
    <div className={`${styles.box} ${open ? styles.open : ''}`}>
      <button className={styles.icon} aria-label="Search" onClick={() => setOpen((o) => !o)}>
        <Search size={20} />
      </button>
      {open && (
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          aria-label="Search movies and shows"
          placeholder="Titles, genres…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
        />
      )}
      {open && text && (
        <button className={styles.clear} aria-label="Clear search" onClick={close}><X size={18} /></button>
      )}
    </div>
  );
}
```

Create `src/components/nav/SearchBox.module.css`:

```css
.box { display: inline-flex; align-items: center; gap: 4px; }
.icon, .clear { display: grid; place-items: center; width: 36px; height: 36px; color: #fff; }
.input {
  width: 220px; height: 36px; padding: 0 10px; color: #fff;
  background: rgba(0,0,0,.7); border: 1px solid var(--nf-outline); border-radius: var(--nf-radius);
}
.input::placeholder { color: var(--nf-grey); }
@media (max-width: 500px) { .input { width: 140px; } }
```

Then mount it in `src/components/nav/TopNav.tsx`. Add the import and place `<SearchBox />` just before the Sign-out button. Change the imports and the closing of the header:

```tsx
import SearchBox from './SearchBox';
```

```tsx
      <div className={styles.right}>
        <SearchBox />
        <button className={styles.logout} onClick={logout}>Sign out</button>
      </div>
    </header>
```

Add to `src/components/nav/TopNav.module.css` a `.right` rule (append):

```css
.right { display: flex; align-items: center; gap: 8px; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/nav/SearchBox.test.tsx`
Expected: PASS (1 test). Also run `npx tsc --noEmit` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/SearchBox.tsx src/components/nav/SearchBox.module.css src/components/nav/TopNav.tsx src/components/nav/TopNav.module.css src/components/nav/SearchBox.test.tsx
git commit -m "feat: TopNav SearchBox (debounced -> /search?q=)"
```

---

### Task 7: `/search` route + wiring + live E2E

**Files:**
- Create: `src/routes/Search.tsx`
- Create: `src/routes/Search.module.css`
- Modify: `src/router.tsx`
- Test: `src/routes/Search.test.tsx`

**Interfaces:**
- Consumes: `useSearchItems` (Task 4); `parseSearchParams`, `toSearchParams`, `asLibraryQuery`, `SearchQuery` (Task 2); `LibraryQuery` (library); `TopNav`, `FilterBar` (facets=false), `PosterGrid` (emptyMessage), `DetailModal`.
- Produces: default-exported `Search` route at path `/search`.

- [ ] **Step 1: Write the failing test**

Create `src/routes/Search.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';

vi.mock('../components/nav/TopNav', () => ({ default: () => <div>nav</div> }));
vi.mock('../components/detail/DetailModal', () => ({ default: () => <div>modal</div> }));
const useSearchItems = vi.fn();
vi.mock('../hooks/api/useSearchItems', () => ({ useSearchItems: (q: unknown) => useSearchItems(q) }));

import Search from './Search';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Search /></MemoryRouter>);
}

test('empty query shows the prompt and does not render the grid', () => {
  useSearchItems.mockReturnValue({ items: [], total: 0, fetchNextPage: () => {}, hasNextPage: false, isLoading: false, isError: false });
  renderAt('/search');
  expect(screen.getByText(/search for movies and shows/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/sort by/i)).not.toBeInTheDocument();
});

test('non-empty query renders results heading + sort control', () => {
  useSearchItems.mockReturnValue({ items: [{ Id: 'a', Name: 'A' }], total: 1, fetchNextPage: () => {}, hasNextPage: false, isLoading: false, isError: false });
  renderAt('/search?q=matrix');
  expect(screen.getByText(/results for/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/Search.test.tsx`
Expected: FAIL — module `./Search` does not exist.

- [ ] **Step 3: Implement**

Create `src/routes/Search.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import TopNav from '../components/nav/TopNav';
import FilterBar from '../components/library/FilterBar';
import PosterGrid from '../components/library/PosterGrid';
import DetailModal from '../components/detail/DetailModal';
import { useSearchItems } from '../hooks/api/useSearchItems';
import { parseSearchParams, toSearchParams, asLibraryQuery, type SearchQuery } from '../lib/search/query';
import type { LibraryQuery } from '../lib/library/query';
import styles from './Search.module.css';

export default function Search() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parseSearchParams(searchParams), [searchParams]);
  const { items, total, fetchNextPage, hasNextPage, isLoading } = useSearchItems(query);
  const [detail, setDetail] = useState<BaseItemDto | null>(null);
  const trimmed = query.q.trim();

  const onChange = useCallback((lq: LibraryQuery) => {
    const next: SearchQuery = { q: query.q, sort: lq.sort, order: lq.order, status: lq.status };
    setSearchParams(toSearchParams(next));
    window.scrollTo({ top: 0 });
  }, [query.q, setSearchParams]);
  const onOpen = useCallback((i: BaseItemDto) => setDetail(i), []);
  const onPlay = useCallback((i: BaseItemDto) => navigate(`/watch/${i.Id}`), [navigate]);

  return (
    <div className={styles.page}>
      <TopNav />
      <div className={styles.body}>
        {!trimmed ? (
          <p className={styles.prompt}>Search for movies and shows</p>
        ) : (
          <>
            <h1 className={styles.heading}>Results for “{trimmed}”</h1>
            <FilterBar query={asLibraryQuery(query)} genres={[]} decades={[]} facets={false} total={total} onChange={onChange} />
            <PosterGrid
              items={items} loading={isLoading} onOpen={onOpen}
              onLoadMore={fetchNextPage} hasMore={hasNextPage}
              emptyMessage={`No results for “${trimmed}”`}
            />
          </>
        )}
      </div>
      {detail?.Id && <DetailModal itemId={detail.Id} onClose={() => setDetail(null)} onPlay={onPlay} />}
    </div>
  );
}
```

Create `src/routes/Search.module.css`:

```css
.page { min-height: 100%; padding-bottom: 60px; }
.body { padding-top: var(--nf-nav-h); }
.heading { font-size: clamp(20px, 2.4vw, 30px); font-weight: 800; padding: 24px var(--nf-inset) 8px; }
.prompt { padding: 120px var(--nf-inset); text-align: center; color: var(--nf-grey); font-size: 20px; }
```

Then register the route in `src/router.tsx`. Add the import and the route entry:

```tsx
import Search from './routes/Search';
```

```tsx
  { path: '/search', element: <RequireAuth><Search /></RequireAuth> },
```

(Place it alongside the other `RequireAuth` routes, e.g. right after the `/library/:viewId` entry.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/Search.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Full gate**

Run: `npx tsc --noEmit` (clean) and `npx vitest run` (all tests pass, including the pre-existing suite).

- [ ] **Step 6: Live E2E (Playwright, against the running dev server)**

With the dev server up on `:5173` (start it if needed: `VITE_JELLYFIN_SERVER=… npx vite --port 5173 --strictPort`), run a headless Playwright script (in the scratchpad) that:
1. Logs in (username/password from `.env.local` `JELLYFIN_TEST_PASS`).
2. Clicks the TopNav search icon, types a term likely to match (e.g. a substring of a known title on the server), waits for debounce, and asserts the URL is `/#/search?q=…` and the poster grid shows ≥1 `ul li` poster with `TotalRecordCount` reflected in the FilterBar count.
3. Changes the Sort select and asserts `q` is preserved in the URL.
4. Opens the first result (asserts a DetailModal appears).
5. Clears the query (asserts the prompt "Search for movies and shows" shows).
6. Types a nonsense term (e.g. `zzzxqq`) and asserts the "No results for …" empty state.

Expected: all assertions pass. Capture a screenshot for the record. Stop any temporary dev server you started (the user runs the app locally).

- [ ] **Step 7: Commit**

```bash
git add src/routes/Search.tsx src/routes/Search.module.css src/router.tsx src/routes/Search.test.tsx
git commit -m "feat: /search route (grid + sort/status filters + DetailModal)"
```

---

## Notes for the executor
- `--nf-nav-h`, `--nf-inset`, `--nf-outline`, `--nf-grey`, `--nf-radius` are existing CSS custom properties (see `src/routes/Library.module.css` and the global stylesheet) — reuse them, do not hard-code.
- The `DetailModal` prop shape is `{ itemId: string; onClose: () => void; onPlay: (i: BaseItemDto) => void }` (see `src/routes/Library.tsx`).
- Keep `LIBRARY_PAGE_SIZE` exported from `useLibraryItems` — `useLibraryItems.test.tsx` imports it.
- If a reviewer flags the `react-hooks/exhaustive-deps` disable in `SearchBox`, note it is deliberate: the debounce must re-arm on `text`/`open` only, reading `onSearch`/`searchParams` at fire time; adding them as deps would reset the timer on every URL change.
