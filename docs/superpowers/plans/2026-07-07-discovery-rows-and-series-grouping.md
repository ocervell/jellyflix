# Discovery Rows & Series Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Hot right now" and "Recently added" home rows, and collapse per-episode entries into a single series card across the Recently added, Favorites, and Saved-for-later rows so pinning a whole season stops spamming a row with individual episodes.

**Architecture:** Two new react-query hooks wrap Jellyfin `getItems` for the discovery rows. A pure `groupEpisodesBySeries` helper collapses episodes sharing a `SeriesId` into a synthesized `Series` card that carries its member episodes on a `groupMembers` field. `ItemActions` detects that field, derives its button state from the members, and fans the existing per-item toggles over them — so "remove" acts on the whole group with no new mutation logic.

**Tech Stack:** Vite + React 19 + TypeScript (strict), @jellyfin/sdk, @tanstack/react-query v5, Vitest + @testing-library/react.

## Global Constraints

- Cross-library queries use `recursive: true` with **no** `parentId` (spans all libraries).
- `CommunityRating` (0–10) is the IMDb/TMDb score field; "IMDB > 7/10" = `minCommunityRating: 7`.
- Every `getItems` call for a row uses `fields: [ItemFields.PrimaryImageAspectRatio]` and `enableImageTypes: [ImageType.Primary, ImageType.Thumb]`, matching existing rows.
- Grouping applies to **Recently added, Favorites, Saved for later** only. Do NOT group Hot right now (Movie/Series only — no episodes), Continue Watching, Next Up, or Latest.
- Grouped-card actions act on the **whole group**: one click drives every member to the target state.
- Home row order (top → bottom): Continue Watching, Next Up, **Hot right now**, **Recently added**, Saved for later, Latest `<library>`, Favorites.
- Run a single test file with: `npx vitest run <path>`. Run the whole suite with `npx vitest run`. Type-check/build with `npm run build`.
- Enum values come from `@jellyfin/sdk/lib/generated-client`: `BaseItemKind`, `ItemSortBy`, `SortOrder`, `ItemFields`, `ImageType`.

---

### Task 1: `groupEpisodesBySeries` helper

**Files:**
- Create: `src/lib/rowGrouping.ts`
- Test: `src/lib/rowGrouping.test.ts`

**Interfaces:**
- Consumes: `BaseItemDto` from `@jellyfin/sdk/lib/generated-client`.
- Produces:
  - `export type GroupedItem = BaseItemDto & { groupMembers?: BaseItemDto[] }`
  - `export function groupEpisodesBySeries(items: BaseItemDto[]): GroupedItem[]`
  - `export function getGroupMembers(item: BaseItemDto): BaseItemDto[] | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/rowGrouping.test.ts
import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { groupEpisodesBySeries, getGroupMembers } from './rowGrouping';

const ep = (id: string, seriesId: string): BaseItemDto =>
  ({ Id: id, Type: 'Episode', SeriesId: seriesId, SeriesName: `Show ${seriesId}`,
     SeriesPrimaryImageTag: `p-${seriesId}`, SeriesThumbImageTag: `t-${seriesId}`,
     UserData: { IsFavorite: true } } as BaseItemDto);

test('movies and series pass through untouched', () => {
  const movie = { Id: 'm', Type: 'Movie', Name: 'Film' } as BaseItemDto;
  const series = { Id: 's', Type: 'Series', Name: 'Show' } as BaseItemDto;
  const out = groupEpisodesBySeries([movie, series]);
  expect(out).toEqual([movie, series]);
  expect(getGroupMembers(out[0])).toBeUndefined();
});

test('episodes of one series collapse into a single series card carrying all members', () => {
  const out = groupEpisodesBySeries([ep('e1', 'S'), ep('e2', 'S'), ep('e3', 'S')]);
  expect(out).toHaveLength(1);
  expect(out[0].Id).toBe('S');
  expect(out[0].Type).toBe('Series');
  expect(out[0].Name).toBe('Show S');
  expect(out[0].ImageTags).toEqual({ Primary: 'p-S', Thumb: 't-S' });
  expect(getGroupMembers(out[0])).toHaveLength(3);
});

test('episodes of different series stay separate, first-seen order preserved', () => {
  const movie = { Id: 'm', Type: 'Movie' } as BaseItemDto;
  const out = groupEpisodesBySeries([ep('a1', 'A'), movie, ep('b1', 'B'), ep('a2', 'A')]);
  expect(out.map((i) => i.Id)).toEqual(['A', 'm', 'B']);
  expect(getGroupMembers(out[0])).toHaveLength(2); // a1, a2
});

test('an episode without a SeriesId passes through unchanged', () => {
  const orphan = { Id: 'o', Type: 'Episode' } as BaseItemDto;
  const out = groupEpisodesBySeries([orphan]);
  expect(out).toEqual([orphan]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rowGrouping.test.ts`
Expected: FAIL — cannot find module `./rowGrouping`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/rowGrouping.ts
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

/** A card that may stand in for several collapsed episodes of one series. */
export type GroupedItem = BaseItemDto & { groupMembers?: BaseItemDto[] };

/**
 * Collapse episodes sharing a SeriesId into a single synthesized Series card.
 * Movies and series pass through untouched. First-seen order is preserved:
 * a series appears at the position of its first member in the input.
 */
export function groupEpisodesBySeries(items: BaseItemDto[]): GroupedItem[] {
  const out: GroupedItem[] = [];
  const bySeriesId = new Map<string, GroupedItem>();
  for (const item of items) {
    if (item.Type !== 'Episode' || !item.SeriesId) {
      out.push(item);
      continue;
    }
    const existing = bySeriesId.get(item.SeriesId);
    if (existing) {
      existing.groupMembers!.push(item);
      continue;
    }
    const card: GroupedItem = {
      Id: item.SeriesId,
      Name: item.SeriesName,
      Type: BaseItemKind.Series,
      ImageTags: {
        ...(item.SeriesPrimaryImageTag ? { Primary: item.SeriesPrimaryImageTag } : {}),
        ...(item.SeriesThumbImageTag ? { Thumb: item.SeriesThumbImageTag } : {}),
      },
      SeriesId: item.SeriesId,
      SeriesPrimaryImageTag: item.SeriesPrimaryImageTag,
      SeriesThumbImageTag: item.SeriesThumbImageTag,
      groupMembers: [item],
    };
    bySeriesId.set(item.SeriesId, card);
    out.push(card);
  }
  return out;
}

/** Read the collapsed episodes off a card, if it is a group. */
export function getGroupMembers(item: BaseItemDto): BaseItemDto[] | undefined {
  return (item as GroupedItem).groupMembers;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rowGrouping.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rowGrouping.ts src/lib/rowGrouping.test.ts
git commit -m "feat: groupEpisodesBySeries helper for collapsing episode cards"
```

---

### Task 2: `useHotNow` hook

**Files:**
- Create: `src/hooks/api/useHotNow.ts`
- Modify: `src/hooks/api/queryKeys.ts` (add `hotNow`)
- Test: `src/hooks/api/useHotNow.test.tsx`

**Interfaces:**
- Consumes: `qk.hotNow(userId)`; `getItemsApi(api).getItems`.
- Produces: `export function useHotNow()` — react-query result whose `data` is `BaseItemDto[]`.

- [ ] **Step 1: Add the query key**

In `src/hooks/api/queryKeys.ts`, add inside the `qk` object (after the `latest` line):

```ts
  hotNow: (userId: string) => ['hotNow', userId] as const,
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/hooks/api/useHotNow.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { BaseItemKind, ItemSortBy, SortOrder } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
const getItems = vi.fn().mockResolvedValue({ data: { Items: [{ Id: 'a', Name: 'Hot Film' }] } });
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));

import { useHotNow } from './useHotNow';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('requests newest high-rated movies + series', async () => {
  const { result } = renderHook(() => useHotNow(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const arg = getItems.mock.calls[0][0];
  expect(arg.minCommunityRating).toBe(7);
  expect(arg.sortBy).toEqual([ItemSortBy.PremiereDate]);
  expect(arg.sortOrder).toEqual([SortOrder.Descending]);
  expect(arg.includeItemTypes).toEqual([BaseItemKind.Movie, BaseItemKind.Series]);
  expect(arg.recursive).toBe(true);
  expect(arg.parentId).toBeUndefined();
  expect(typeof arg.maxPremiereDate).toBe('string');
  expect(result.current.data?.[0].Name).toBe('Hot Film');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/hooks/api/useHotNow.test.tsx`
Expected: FAIL — cannot find module `./useHotNow`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/hooks/api/useHotNow.ts
import { useQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { BaseItemKind, ItemSortBy, SortOrder, ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

// Computed once at module load so the query key stays stable (no per-render refetch).
// Guards against an unreleased, future-dated title jumping to the top of the row.
const MAX_PREMIERE_DATE = new Date().toISOString();

export function useHotNow() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.hotNow(session.userId),
    queryFn: async ({ signal }) => {
      const { data } = await getItemsApi(api).getItems({
        userId: session.userId,
        recursive: true,
        includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
        sortBy: [ItemSortBy.PremiereDate],
        sortOrder: [SortOrder.Descending],
        minCommunityRating: 7,
        maxPremiereDate: MAX_PREMIERE_DATE,
        limit: 20,
        fields: [ItemFields.PrimaryImageAspectRatio],
        enableImageTypes: [ImageType.Primary, ImageType.Thumb],
      }, { signal });
      return data.Items ?? [];
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/hooks/api/useHotNow.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/api/useHotNow.ts src/hooks/api/useHotNow.test.tsx src/hooks/api/queryKeys.ts
git commit -m "feat: useHotNow hook for newest high-rated titles"
```

---

### Task 3: `useRecentlyAdded` hook

**Files:**
- Create: `src/hooks/api/useRecentlyAdded.ts`
- Modify: `src/hooks/api/queryKeys.ts` (add `recentlyAdded`)
- Test: `src/hooks/api/useRecentlyAdded.test.tsx`

**Interfaces:**
- Consumes: `qk.recentlyAdded(userId)`; `getItemsApi(api).getItems`; `groupEpisodesBySeries` from `src/lib/rowGrouping.ts` (Task 1).
- Produces: `export function useRecentlyAdded()` — react-query result whose `data` is `GroupedItem[]`.

- [ ] **Step 1: Add the query key**

In `src/hooks/api/queryKeys.ts`, add inside the `qk` object (after the `hotNow` line):

```ts
  recentlyAdded: (userId: string) => ['recentlyAdded', userId] as const,
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/hooks/api/useRecentlyAdded.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { BaseItemKind, ItemSortBy, SortOrder } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
const getItems = vi.fn().mockResolvedValue({ data: { Items: [
  { Id: 'm', Type: 'Movie', Name: 'Film' },
  { Id: 'e1', Type: 'Episode', SeriesId: 'S', SeriesName: 'Show' },
  { Id: 'e2', Type: 'Episode', SeriesId: 'S', SeriesName: 'Show' },
] } });
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));

import { useRecentlyAdded } from './useRecentlyAdded';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('sorts by DateCreated desc, includes episodes, and groups them', async () => {
  const { result } = renderHook(() => useRecentlyAdded(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const arg = getItems.mock.calls[0][0];
  expect(arg.sortBy).toEqual([ItemSortBy.DateCreated]);
  expect(arg.sortOrder).toEqual([SortOrder.Descending]);
  expect(arg.includeItemTypes).toEqual([BaseItemKind.Movie, BaseItemKind.Series, BaseItemKind.Episode]);
  expect(arg.recursive).toBe(true);
  // movie + one grouped series card (the two episodes collapse)
  expect(result.current.data).toHaveLength(2);
  expect(result.current.data?.find((i) => i.Id === 'S')?.Type).toBe('Series');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/hooks/api/useRecentlyAdded.test.tsx`
Expected: FAIL — cannot find module `./useRecentlyAdded`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/hooks/api/useRecentlyAdded.ts
import { useQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { BaseItemKind, ItemSortBy, SortOrder, ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';
import { groupEpisodesBySeries } from '../../lib/rowGrouping';

export function useRecentlyAdded() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.recentlyAdded(session.userId),
    queryFn: async ({ signal }) => {
      const { data } = await getItemsApi(api).getItems({
        userId: session.userId,
        recursive: true,
        includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series, BaseItemKind.Episode],
        sortBy: [ItemSortBy.DateCreated],
        sortOrder: [SortOrder.Descending],
        limit: 60, // over-fetch: grouping collapses episodes; slice to 20 after
        fields: [ItemFields.PrimaryImageAspectRatio],
        enableImageTypes: [ImageType.Primary, ImageType.Thumb],
      }, { signal });
      return groupEpisodesBySeries(data.Items ?? []).slice(0, 20);
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/hooks/api/useRecentlyAdded.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/api/useRecentlyAdded.ts src/hooks/api/useRecentlyAdded.test.tsx src/hooks/api/queryKeys.ts
git commit -m "feat: useRecentlyAdded hook, grouped by series"
```

---

### Task 4: Favorites includes episodes and groups them

**Files:**
- Modify: `src/hooks/api/useFavorites.ts`
- Test: `src/hooks/api/useFavorites.test.tsx` (create)

**Interfaces:**
- Consumes: `groupEpisodesBySeries` from `src/lib/rowGrouping.ts` (Task 1).
- Produces: `useFavorites()` returns react-query result whose `data` is `GroupedItem[]` (favorited movies, series, and one card per series with favorited episodes).

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/api/useFavorites.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
const getItems = vi.fn().mockResolvedValue({ data: { Items: [
  { Id: 'mv', Type: 'Movie', Name: 'Film', UserData: { IsFavorite: true } },
  { Id: 'e1', Type: 'Episode', SeriesId: 'S', SeriesName: 'Show', UserData: { IsFavorite: true } },
  { Id: 'e2', Type: 'Episode', SeriesId: 'S', SeriesName: 'Show', UserData: { IsFavorite: true } },
] } });
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));

import { useFavorites } from './useFavorites';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('requests episodes too and groups favorited episodes into one series card', async () => {
  const { result } = renderHook(() => useFavorites(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(getItems.mock.calls[0][0].includeItemTypes).toContain(BaseItemKind.Episode);
  // movie + one grouped series card
  expect(result.current.data).toHaveLength(2);
  const seriesCard = result.current.data?.find((i) => i.Id === 'S');
  expect(seriesCard?.Type).toBe('Series');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/api/useFavorites.test.tsx`
Expected: FAIL — result has 3 items (episodes not grouped) and/or `includeItemTypes` lacks `Episode`.

- [ ] **Step 3: Edit the implementation**

In `src/hooks/api/useFavorites.ts`:

1. Add `Episode` to the imported kinds and to `includeItemTypes`. Change the import line to:

```ts
import { BaseItemKind, ItemFields, ItemSortBy, SortOrder, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { groupEpisodesBySeries } from '../../lib/rowGrouping';
```

2. Change `includeItemTypes` to:

```ts
        includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series, BaseItemKind.Episode],
```

3. Change the return line from `return data.Items ?? [];` to:

```ts
      return groupEpisodesBySeries(data.Items ?? []);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/api/useFavorites.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/api/useFavorites.ts src/hooks/api/useFavorites.test.tsx
git commit -m "feat: favorites includes episodes, grouped by series"
```

---

### Task 5: Watchlist groups for display, indexes membership off raw items

**Files:**
- Modify: `src/hooks/api/useWatchlist.ts`
- Test: `src/hooks/api/useWatchlist.test.tsx:1-60` (add one test)

**Interfaces:**
- Consumes: `groupEpisodesBySeries` from `src/lib/rowGrouping.ts` (Task 1); existing `indexWatchlist` from `src/lib/jellyfin/watchlist.ts`.
- Produces: `useWatchlist()` returns `{ playlistId, items, membership, entryById, isLoading }` where `items` is now `GroupedItem[]` (grouped for display) but `membership`/`entryById` are derived from the **raw, ungrouped** playlist items (unchanged).

- [ ] **Step 1: Write the failing test**

Add to `src/hooks/api/useWatchlist.test.tsx` (after the existing tests):

```tsx
test('groups episodes for display but indexes membership on the raw items', async () => {
  getItems.mockResolvedValue({ data: { Items: [{ Id: 'PL', Name: 'Saved for later' }] } });
  getPlaylistItems.mockResolvedValue({ data: { Items: [
    { Id: 'e1', PlaylistItemId: 'p1', Type: 'Episode', SeriesId: 'S', SeriesName: 'Show' },
    { Id: 'e2', PlaylistItemId: 'p2', Type: 'Episode', SeriesId: 'S', SeriesName: 'Show' },
  ] } });
  const { result } = renderHook(() => useWatchlist(), { wrapper });
  await waitFor(() => expect(result.current.items).toHaveLength(1)); // collapsed to one series card
  expect(result.current.items[0].Type).toBe('Series');
  expect(result.current.membership.has('e1')).toBe(true);
  expect(result.current.membership.has('e2')).toBe(true);
  expect(result.current.entryById.get('e1')).toBe('p1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/api/useWatchlist.test.tsx`
Expected: FAIL — `items` has length 2 (ungrouped) and `items[0].Type` is `'Episode'`.

- [ ] **Step 3: Edit the implementation**

In `src/hooks/api/useWatchlist.ts`:

1. Add the import near the other imports:

```ts
import { groupEpisodesBySeries } from '../../lib/rowGrouping';
```

2. Replace the tail of the hook (from `const items = q.data?.items ?? [];` through the `return`) with:

```ts
  const rawItems = q.data?.items ?? [];
  const { ids, entryById } = useMemo(() => indexWatchlist(rawItems), [rawItems]);
  const items = useMemo(() => groupEpisodesBySeries(rawItems), [rawItems]);
  return { playlistId: q.data?.playlistId ?? null, items, membership: ids, entryById, isLoading: q.isLoading };
```

(`indexWatchlist` runs on the raw list so `membership`/`entryById` still map real episode ids → `PlaylistItemId`; only the displayed `items` are grouped.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/api/useWatchlist.test.tsx`
Expected: PASS (existing tests still pass — a single non-episode item passes through grouping unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/api/useWatchlist.ts src/hooks/api/useWatchlist.test.tsx
git commit -m "feat: watchlist groups episodes for display, membership off raw items"
```

---

### Task 6: Group-aware `ItemActions`

**Files:**
- Modify: `src/components/common/ItemActions.tsx`
- Test: `src/components/common/ItemActions.test.tsx:1-38` (add grouped-card tests)

**Interfaces:**
- Consumes: `getGroupMembers` from `src/lib/rowGrouping.ts` (Task 1); existing `useToggleWatchlist`, `useToggleFavorite`, `useToggleWatched`, `useWatchlist`.
- Produces: unchanged public prop signature `ItemActions({ item, size })`. New behavior: when `getGroupMembers(item)` is defined, button state is derived from members and each toggle fans over the members whose state doesn't already match the target.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/common/ItemActions.test.tsx` (after the existing tests). Also add this import at the top of the file, below the existing imports:

```tsx
import type { GroupedItem } from '../../lib/rowGrouping';
```

Tests:

```tsx
test('grouped card with all members favorited: shows active heart, unfavorites every member on click', () => {
  const m1 = { Id: 'e1', UserData: { IsFavorite: true, Played: false } } as BaseItemDto;
  const m2 = { Id: 'e2', UserData: { IsFavorite: true, Played: false } } as BaseItemDto;
  const item = { Id: 'S', Type: 'Series', groupMembers: [m1, m2] } as GroupedItem;
  render(<ItemActions item={item} />);
  fireEvent.click(screen.getByRole('button', { name: /remove from favorites/i }));
  expect(toggleFav).toHaveBeenCalledTimes(2);
  expect(toggleFav).toHaveBeenCalledWith(m1);
  expect(toggleFav).toHaveBeenCalledWith(m2);
});

test('grouped card with no member favorited: shows inactive heart, favorites every member on click', () => {
  const m1 = { Id: 'e1', UserData: { IsFavorite: false, Played: false } } as BaseItemDto;
  const m2 = { Id: 'e2', UserData: { IsFavorite: false, Played: false } } as BaseItemDto;
  const item = { Id: 'S', Type: 'Series', groupMembers: [m1, m2] } as GroupedItem;
  render(<ItemActions item={item} />);
  fireEvent.click(screen.getByRole('button', { name: /add to favorites/i }));
  expect(toggleFav).toHaveBeenCalledTimes(2);
});

test('grouped card save state reflects member watchlist membership and removes only members still in it', () => {
  membership = new Set(['e1']); // only e1 is saved
  const m1 = { Id: 'e1', UserData: {} } as BaseItemDto;
  const m2 = { Id: 'e2', UserData: {} } as BaseItemDto;
  const item = { Id: 'S', Type: 'Series', groupMembers: [m1, m2] } as GroupedItem;
  render(<ItemActions item={item} />);
  // some member saved -> shows "remove"; target is "not saved", so only e1 (currently saved) is toggled
  fireEvent.click(screen.getByRole('button', { name: /remove from saved for later/i }));
  expect(toggleWatchlist).toHaveBeenCalledTimes(1);
  expect(toggleWatchlist).toHaveBeenCalledWith(m1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/common/ItemActions.test.tsx`
Expected: FAIL — grouped `item` has no `UserData`, so the heart shows "Add to Favorites" not "Remove", and clicking toggles the group card itself (single call), not each member.

- [ ] **Step 3: Edit the implementation**

Rewrite `src/components/common/ItemActions.tsx` as:

```tsx
import { Plus, Check, Heart, Circle, CircleCheck } from 'lucide-react';
import { useToggleWatchlist } from '../../hooks/api/useToggleWatchlist';
import { useWatchlist } from '../../hooks/api/useWatchlist';
import { useToggleFavorite, useToggleWatched } from '../../hooks/api/useItemActions';
import { getGroupMembers } from '../../lib/rowGrouping';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './ItemActions.module.css';

export default function ItemActions({ item, size = 'md' }: { item: BaseItemDto; size?: 'sm' | 'md' }) {
  const toggleWatchlist = useToggleWatchlist();
  const toggleFavorite = useToggleFavorite();
  const toggleWatched = useToggleWatched();
  const { membership } = useWatchlist();

  const members = getGroupMembers(item);
  const isSaved = (i: BaseItemDto) => membership.has(i.Id ?? '');

  // Grouped cards derive their state from their member episodes and fan each
  // toggle over the members whose state doesn't already match the target, so a
  // single click drives the whole group.
  const saved = members ? members.some(isSaved) : isSaved(item);
  const fav = members ? members.some((m) => !!m.UserData?.IsFavorite) : !!item.UserData?.IsFavorite;
  const played = members
    ? members.length > 0 && members.every((m) => !!m.UserData?.Played)
    : !!item.UserData?.Played;

  const onSave = () => {
    if (!members) { toggleWatchlist(item); return; }
    const target = !saved;
    members.filter((m) => isSaved(m) !== target).forEach((m) => toggleWatchlist(m));
  };
  const onFav = () => {
    if (!members) { toggleFavorite(item); return; }
    const target = !fav;
    members.filter((m) => Boolean(m.UserData?.IsFavorite) !== target).forEach((m) => toggleFavorite(m));
  };
  const onWatched = () => {
    if (!members) { toggleWatched(item); return; }
    const target = !played;
    members.filter((m) => Boolean(m.UserData?.Played) !== target).forEach((m) => toggleWatched(m));
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const iconSize = size === 'sm' ? 16 : 19;
  const savedLabel = saved ? 'Remove from Saved for later' : 'Save for later';
  const favLabel = fav ? 'Remove from Favorites' : 'Add to Favorites';
  const watchLabel = played ? 'Mark unwatched' : 'Mark watched';
  return (
    <div className={`${styles.actions} ${size === 'sm' ? styles.sm : ''}`}>
      <button className={styles.btn} aria-label={savedLabel} title={savedLabel}
        onClick={(e) => { stop(e); onSave(); }}>
        {saved ? <Check size={iconSize} /> : <Plus size={iconSize} />}
      </button>
      <button className={`${styles.btn} ${fav ? styles.fav : ''}`} aria-label={favLabel} title={favLabel}
        onClick={(e) => { stop(e); onFav(); }}>
        <Heart size={iconSize} fill={fav ? 'currentColor' : 'none'} />
      </button>
      <button className={`${styles.btn} ${played ? styles.on : ''}`} aria-label={watchLabel} title={watchLabel}
        onClick={(e) => { stop(e); onWatched(); }}>
        {played ? <CircleCheck size={iconSize} /> : <Circle size={iconSize} />}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/common/ItemActions.test.tsx`
Expected: PASS (existing 2 tests + 3 new tests). The existing tests still pass because a plain item (no `groupMembers`) takes the `!members` branch, preserving old behavior.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ItemActions.tsx src/components/common/ItemActions.test.tsx
git commit -m "feat: ItemActions acts on the whole group for grouped series cards"
```

---

### Task 7: Wire the two rows into the home page

**Files:**
- Modify: `src/routes/Home.tsx`

**Interfaces:**
- Consumes: `useHotNow` (Task 2), `useRecentlyAdded` (Task 3); existing `Row`, `RowSkeleton`.
- Produces: rendered "Hot right now" and "Recently added" rows in the documented order.

- [ ] **Step 1: Add the imports**

In `src/routes/Home.tsx`, after the `useLatestMedia` import (line 12), add:

```tsx
import { useHotNow } from '../hooks/api/useHotNow';
import { useRecentlyAdded } from '../hooks/api/useRecentlyAdded';
```

- [ ] **Step 2: Call the hooks**

After the `const watchlist = useWatchlist();` line, add:

```tsx
  const hotQ = useHotNow();
  const recentQ = useRecentlyAdded();
```

- [ ] **Step 3: Render the rows**

In the `.rows` block, between the Next Up line and the `Saved for later` line, insert:

```tsx
        {hotQ.isLoading ? <RowSkeleton title="Hot right now" /> : <Row title="Hot right now" items={hotQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
        {recentQ.isLoading ? <RowSkeleton title="Recently added" /> : <Row title="Recently added" items={recentQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
```

The resulting `.rows` block order is: Continue Watching, Next Up, Hot right now, Recently added, Saved for later, `mediaViews.map(LatestRow)`, Favorites.

- [ ] **Step 4: Verify build and full suite**

Run: `npm run build`
Expected: type-checks and builds with no errors.

Run: `npx vitest run`
Expected: entire suite passes.

- [ ] **Step 5: Verify in the running app**

Run: `npm run dev`, open the app, log in, and confirm on the home page:
- "Hot right now" appears under Next Up with high-rated recent titles.
- "Recently added" appears under it; any series with multiple recently-added episodes shows a **single** series card, not one card per episode.
- On a Saved-for-later or Favorites series card built from episodes, clicking the ♥ (or ✕/Check) removes the whole group and the card leaves the row.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Home.tsx
git commit -m "feat: add Hot right now and Recently added rows to home"
```

---

## Self-Review

**Spec coverage:**
- Hot right now row → Task 2. ✅
- Recently added row → Task 3. ✅
- `groupEpisodesBySeries` + `getGroupMembers` + `GroupedItem` → Task 1. ✅
- Favorites broadened to episodes + grouped → Task 4. ✅
- Watchlist grouped for display, membership off raw → Task 5. ✅
- Group-aware `ItemActions` (whole-group actions, derived state) → Task 6. ✅
- Query keys `hotNow` / `recentlyAdded` → Tasks 2 / 3. ✅
- Home placement/order → Task 7 + Global Constraints. ✅

**Placeholder scan:** No TBD/TODO; every code step contains full code and exact commands.

**Type consistency:** `GroupedItem`, `groupEpisodesBySeries`, `getGroupMembers` are defined in Task 1 and consumed with identical signatures in Tasks 3–6. `qk.hotNow` / `qk.recentlyAdded` defined and used consistently. `ItemActions` prop signature unchanged. `useHotNow` returns `BaseItemDto[]`; `useRecentlyAdded`/`useFavorites` return `GroupedItem[]`, both assignable to `Row`'s `items: BaseItemDto[]`.
