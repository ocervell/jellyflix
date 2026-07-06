# Saved for later + Favorites Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Jellyfin-Playlist-backed "Saved for later" watchlist (a `+` button + a Home row) and split it from Favorites (renamed from "My List", moved to the bottom, heart icon), keeping the watched toggle.

**Architecture:** A new pure `watchlist.ts` (membership indexing + immutable list patchers), a `useWatchlist` query (find the "Saved for later" playlist, list its items, expose membership + entry-ids) and a `useToggleWatchlist` optimistic create/add/remove mutation. `ItemActions` becomes three buttons (save-for-later `+`/`✓`, favorite heart, watched circle). `Home` reorders rows and swaps the My List row for a Saved-for-later row plus a bottom Favorites row.

**Tech Stack:** Vite + React 19 + TypeScript (strict) + @tanstack/react-query v5 + @jellyfin/sdk + lucide-react.

## Global Constraints

- TypeScript strict; **no `any`** (narrow casts on `unknown` only where unavoidable).
- @jellyfin/sdk in request-object form: `getPlaylistsApi(api).createPlaylist({ name, ids, userId })`, `.addItemToPlaylist({ playlistId, ids, userId })`, `.removeItemFromPlaylist({ playlistId, entryIds })`, `.getPlaylistItems({ playlistId, userId, fields, enableImageTypes })`; `getItemsApi(api).getItems({ includeItemTypes: [Playlist], recursive: true, userId })`.
- Playlist name is exactly `"Saved for later"`. Removal uses `entryIds` = each item's `PlaylistItemId` (NOT its media `Id`).
- Toggles are optimistic with rollback, matching the existing favorites pattern; watchlist cache key is `['watchlist', userId]`, cache shape `{ playlistId: string | null; items: BaseItemDto[] }`.
- Home row order (top→bottom): Continue Watching, Next Up, **Saved for later**, Latest ‹view› rows, **Favorites**.
- ItemActions button order: **Save for later** (`+`/`✓`), **Favorite** (heart), **Watched** (circle). All `stopPropagation`. Icons from `lucide-react`.
- Do NOT modify `vitest.setup.ts` or `vite.config.ts`.
- Run tests with `npx vitest run <file>`, full suite `npx vitest run`, typecheck `npx tsc --noEmit`.

---

### Task 1: Pure watchlist helpers (`lib/jellyfin/watchlist.ts`)

**Files:**
- Create: `src/lib/jellyfin/watchlist.ts`
- Test: `src/lib/jellyfin/watchlist.test.ts`

**Interfaces:**
- Produces:
  - `PLAYLIST_NAME = 'Saved for later'`
  - `indexWatchlist(items: BaseItemDto[]): { ids: Set<string>; entryById: Map<string, string> }`
  - `addItemToList(items: BaseItemDto[], item: BaseItemDto): BaseItemDto[]`
  - `removeItemFromList(items: BaseItemDto[], itemId: string): BaseItemDto[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/jellyfin/watchlist.test.ts`:

```ts
import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { PLAYLIST_NAME, indexWatchlist, addItemToList, removeItemFromList } from './watchlist';

test('PLAYLIST_NAME is the exact display name', () => {
  expect(PLAYLIST_NAME).toBe('Saved for later');
});

test('indexWatchlist builds membership set + Id->PlaylistItemId map, skipping id-less', () => {
  const items = [
    { Id: 'a', PlaylistItemId: 'e1' },
    { Id: 'b' },                      // member but no entry id yet (optimistic)
    { PlaylistItemId: 'e3' },         // no media id -> skipped
  ] as BaseItemDto[];
  const { ids, entryById } = indexWatchlist(items);
  expect([...ids].sort()).toEqual(['a', 'b']);
  expect(entryById.get('a')).toBe('e1');
  expect(entryById.has('b')).toBe(false);
});

test('addItemToList appends when absent, no-ops (same ref) when present, never mutates', () => {
  const items = [{ Id: 'a' }] as BaseItemDto[];
  const added = addItemToList(items, { Id: 'b' } as BaseItemDto);
  expect(added.map((i) => i.Id)).toEqual(['a', 'b']);
  expect(items.map((i) => i.Id)).toEqual(['a']);          // input unchanged
  expect(addItemToList(items, { Id: 'a' } as BaseItemDto)).toBe(items); // dup -> same ref
});

test('removeItemFromList removes by media id, no-op when absent, never mutates', () => {
  const items = [{ Id: 'a' }, { Id: 'b' }] as BaseItemDto[];
  expect(removeItemFromList(items, 'a').map((i) => i.Id)).toEqual(['b']);
  expect(removeItemFromList(items, 'zzz').map((i) => i.Id)).toEqual(['a', 'b']);
  expect(items.map((i) => i.Id)).toEqual(['a', 'b']);     // input unchanged
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jellyfin/watchlist.test.ts`
Expected: FAIL — module `./watchlist` does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/jellyfin/watchlist.ts`:

```ts
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

export const PLAYLIST_NAME = 'Saved for later';

/** Build the membership set (media Ids) and the media-Id -> PlaylistItemId map (needed for removal). */
export function indexWatchlist(items: BaseItemDto[]): { ids: Set<string>; entryById: Map<string, string> } {
  const ids = new Set<string>();
  const entryById = new Map<string, string>();
  for (const it of items) {
    if (!it.Id) continue;
    ids.add(it.Id);
    if (it.PlaylistItemId) entryById.set(it.Id, it.PlaylistItemId);
  }
  return { ids, entryById };
}

/** Append the item unless already present (by media Id). Returns the same array reference when unchanged. */
export function addItemToList(items: BaseItemDto[], item: BaseItemDto): BaseItemDto[] {
  if (item.Id && items.some((i) => i.Id === item.Id)) return items;
  return [...items, item];
}

/** Remove any item with the given media Id. Never mutates the input. */
export function removeItemFromList(items: BaseItemDto[], itemId: string): BaseItemDto[] {
  return items.filter((i) => i.Id !== itemId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/jellyfin/watchlist.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jellyfin/watchlist.ts src/lib/jellyfin/watchlist.test.ts
git commit -m "feat: pure watchlist helpers (index + immutable list patchers)"
```

---

### Task 2: `useWatchlist` query hook

**Files:**
- Create: `src/hooks/api/useWatchlist.ts`
- Test: `src/hooks/api/useWatchlist.test.tsx`

**Interfaces:**
- Consumes: `PLAYLIST_NAME`, `indexWatchlist` (Task 1); `useApi`.
- Produces:
  - `type WatchlistData = { playlistId: string | null; items: BaseItemDto[] }`
  - `useWatchlist(): { playlistId: string | null; items: BaseItemDto[]; membership: Set<string>; entryById: Map<string,string>; isLoading: boolean }`, keyed `['watchlist', userId]`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/api/useWatchlist.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi, beforeEach } from 'vitest';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
const getItems = vi.fn();
const getPlaylistItems = vi.fn();
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/playlists-api', () => ({ getPlaylistsApi: () => ({ getPlaylistItems }) }));

import { useWatchlist } from './useWatchlist';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
beforeEach(() => { getItems.mockReset(); getPlaylistItems.mockReset(); });

test('no "Saved for later" playlist -> empty, membership empty', async () => {
  getItems.mockResolvedValue({ data: { Items: [{ Id: 'other', Name: 'Something else' }] } });
  const { result } = renderHook(() => useWatchlist(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.playlistId).toBeNull();
  expect(result.current.items).toEqual([]);
  expect(result.current.membership.size).toBe(0);
  expect(getPlaylistItems).not.toHaveBeenCalled();
});

test('with playlist -> items loaded, membership + entryById derived', async () => {
  getItems.mockResolvedValue({ data: { Items: [{ Id: 'PL', Name: 'Saved for later' }] } });
  getPlaylistItems.mockResolvedValue({ data: { Items: [{ Id: 'x', PlaylistItemId: 'e1' }] } });
  const { result } = renderHook(() => useWatchlist(), { wrapper });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  expect(result.current.playlistId).toBe('PL');
  expect(result.current.membership.has('x')).toBe(true);
  expect(result.current.entryById.get('x')).toBe('e1');
  expect(getPlaylistItems.mock.calls[0][0]).toMatchObject({ playlistId: 'PL', userId: 'u' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/api/useWatchlist.test.tsx`
Expected: FAIL — module `./useWatchlist` does not exist.

- [ ] **Step 3: Implement**

Create `src/hooks/api/useWatchlist.ts`:

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';
import { BaseItemKind, ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { PLAYLIST_NAME, indexWatchlist } from '../../lib/jellyfin/watchlist';

export type WatchlistData = { playlistId: string | null; items: BaseItemDto[] };

export function useWatchlist() {
  const { api, session } = useApi();
  const q = useQuery<WatchlistData>({
    queryKey: ['watchlist', session.userId],
    queryFn: async ({ signal }) => {
      const found = await getItemsApi(api).getItems(
        { userId: session.userId, includeItemTypes: [BaseItemKind.Playlist], recursive: true },
        { signal },
      );
      const pl = (found.data.Items ?? []).find((p) => p.Name === PLAYLIST_NAME);
      if (!pl?.Id) return { playlistId: null, items: [] };
      const res = await getPlaylistsApi(api).getPlaylistItems(
        {
          playlistId: pl.Id, userId: session.userId,
          fields: [ItemFields.PrimaryImageAspectRatio],
          enableImageTypes: [ImageType.Primary, ImageType.Thumb],
        },
        { signal },
      );
      return { playlistId: pl.Id, items: res.data.Items ?? [] };
    },
  });
  const items = q.data?.items ?? [];
  const { ids, entryById } = useMemo(() => indexWatchlist(items), [items]);
  return { playlistId: q.data?.playlistId ?? null, items, membership: ids, entryById, isLoading: q.isLoading };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/api/useWatchlist.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/api/useWatchlist.ts src/hooks/api/useWatchlist.test.tsx
git commit -m "feat: useWatchlist (find Saved-for-later playlist + membership)"
```

---

### Task 3: `useToggleWatchlist` optimistic mutation

**Files:**
- Create: `src/hooks/api/useToggleWatchlist.ts`
- Test: `src/hooks/api/useToggleWatchlist.test.tsx`

**Interfaces:**
- Consumes: `PLAYLIST_NAME`, `indexWatchlist`, `addItemToList`, `removeItemFromList` (Task 1); `WatchlistData` (Task 2); `useApi`.
- Produces: `useToggleWatchlist(): (item: BaseItemDto) => void`.

The decision (add-vs-remove, `playlistId`, `entryId`) is captured from the cache **at call time**, before `onMutate` optimistically flips it — so `mutationFn` never reads post-optimistic state.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/api/useToggleWatchlist.test.tsx`:

```tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi, beforeEach } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
const createPlaylist = vi.fn();
const addItemToPlaylist = vi.fn();
const removeItemFromPlaylist = vi.fn();
vi.mock('@jellyfin/sdk/lib/utils/api/playlists-api', () => ({
  getPlaylistsApi: () => ({ createPlaylist, addItemToPlaylist, removeItemFromPlaylist }),
}));

import { useToggleWatchlist } from './useToggleWatchlist';

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  createPlaylist.mockResolvedValue({ data: { Id: 'NEW' } });
  addItemToPlaylist.mockResolvedValue({ data: undefined });
  removeItemFromPlaylist.mockResolvedValue({ data: undefined });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

test('not a member + no playlist -> createPlaylist (seeded with the item)', async () => {
  qc.setQueryData(['watchlist', 'u'], { playlistId: null, items: [] });
  const { result } = renderHook(() => useToggleWatchlist(), { wrapper });
  act(() => result.current({ Id: 'x' } as BaseItemDto));
  await waitFor(() => expect(createPlaylist).toHaveBeenCalled());
  expect(createPlaylist.mock.calls[0][0]).toMatchObject({ name: 'Saved for later', ids: ['x'], userId: 'u' });
  expect(addItemToPlaylist).not.toHaveBeenCalled();
  // optimistic: item is in the cached list immediately
  expect((qc.getQueryData(['watchlist', 'u']) as { items: BaseItemDto[] }).items.map((i) => i.Id)).toContain('x');
});

test('not a member + existing playlist -> addItemToPlaylist', async () => {
  qc.setQueryData(['watchlist', 'u'], { playlistId: 'PL', items: [] });
  const { result } = renderHook(() => useToggleWatchlist(), { wrapper });
  act(() => result.current({ Id: 'y' } as BaseItemDto));
  await waitFor(() => expect(addItemToPlaylist).toHaveBeenCalled());
  expect(addItemToPlaylist.mock.calls[0][0]).toMatchObject({ playlistId: 'PL', ids: ['y'], userId: 'u' });
  expect(createPlaylist).not.toHaveBeenCalled();
});

test('member -> removeItemFromPlaylist with the PlaylistItemId', async () => {
  qc.setQueryData(['watchlist', 'u'], { playlistId: 'PL', items: [{ Id: 'x', PlaylistItemId: 'e1' }] });
  const { result } = renderHook(() => useToggleWatchlist(), { wrapper });
  act(() => result.current({ Id: 'x' } as BaseItemDto));
  await waitFor(() => expect(removeItemFromPlaylist).toHaveBeenCalled());
  expect(removeItemFromPlaylist.mock.calls[0][0]).toMatchObject({ playlistId: 'PL', entryIds: ['e1'] });
});

test('rolls back the optimistic add when the request fails', async () => {
  createPlaylist.mockRejectedValueOnce(new Error('boom'));
  qc.setQueryData(['watchlist', 'u'], { playlistId: null, items: [] });
  const { result } = renderHook(() => useToggleWatchlist(), { wrapper });
  act(() => result.current({ Id: 'x' } as BaseItemDto));
  await waitFor(() => expect(createPlaylist).toHaveBeenCalled());
  await waitFor(() => expect((qc.getQueryData(['watchlist', 'u']) as { items: BaseItemDto[] }).items).toHaveLength(0));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/api/useToggleWatchlist.test.tsx`
Expected: FAIL — module `./useToggleWatchlist` does not exist.

- [ ] **Step 3: Implement**

Create `src/hooks/api/useToggleWatchlist.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { PLAYLIST_NAME, indexWatchlist, addItemToList, removeItemFromList } from '../../lib/jellyfin/watchlist';
import type { WatchlistData } from './useWatchlist';

type ToggleVars = { item: BaseItemDto; wasMember: boolean; playlistId: string | null; entryId: string | undefined };

const EMPTY: WatchlistData = { playlistId: null, items: [] };

export function useToggleWatchlist(): (item: BaseItemDto) => void {
  const { api, session } = useApi();
  const qc = useQueryClient();
  const key = ['watchlist', session.userId];
  const m = useMutation({
    mutationFn: async (v: ToggleVars) => {
      const id = v.item.Id ?? '';
      const pls = getPlaylistsApi(api);
      if (!v.wasMember) {
        if (v.playlistId) await pls.addItemToPlaylist({ playlistId: v.playlistId, ids: [id], userId: session.userId });
        else await pls.createPlaylist({ name: PLAYLIST_NAME, ids: [id], userId: session.userId });
        return;
      }
      let playlistId = v.playlistId;
      let entryId = v.entryId;
      if (!playlistId || !entryId) {
        // Rare first-add race: entry id not yet reconciled — refetch to obtain it.
        await qc.refetchQueries({ queryKey: key });
        const fresh = qc.getQueryData<WatchlistData>(key) ?? EMPTY;
        playlistId = fresh.playlistId;
        entryId = indexWatchlist(fresh.items).entryById.get(id);
      }
      if (playlistId && entryId) await pls.removeItemFromPlaylist({ playlistId, entryIds: [entryId] });
    },
    onMutate: async (v: ToggleVars) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WatchlistData>(key) ?? EMPTY;
      const items = v.wasMember ? removeItemFromList(prev.items, v.item.Id ?? '') : addItemToList(prev.items, v.item);
      qc.setQueryData<WatchlistData>(key, { ...prev, items });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key }); },
  });
  return (item) => {
    const current = qc.getQueryData<WatchlistData>(key) ?? EMPTY;
    const { ids, entryById } = indexWatchlist(current.items);
    const id = item.Id ?? '';
    m.mutate({ item, wasMember: ids.has(id), playlistId: current.playlistId, entryId: entryById.get(id) });
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/api/useToggleWatchlist.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/api/useToggleWatchlist.ts src/hooks/api/useToggleWatchlist.test.tsx
git commit -m "feat: useToggleWatchlist optimistic create/add/remove"
```

---

### Task 4: `ItemActions` three-button redesign

**Files:**
- Modify: `src/components/common/ItemActions.tsx`
- Modify: `src/components/common/ItemActions.module.css`
- Test: `src/components/common/ItemActions.test.tsx` (replace)

**Interfaces:**
- Consumes: `useToggleWatchlist` (Task 3), `useWatchlist` (Task 2), existing `useToggleFavorite`/`useToggleWatched` from `../../hooks/api/useItemActions`.
- Produces: `ItemActions` renders three buttons — save-for-later (`+`/`✓` from `useWatchlist().membership`), favorite (heart, `UserData.IsFavorite`), watched (`○`/`⊘`).

- [ ] **Step 1: Write the failing test**

Replace `src/components/common/ItemActions.test.tsx` with:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi, beforeEach } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

const toggleWatchlist = vi.fn();
const toggleFav = vi.fn();
const toggleWatched = vi.fn();
let membership = new Set<string>();
vi.mock('../../hooks/api/useToggleWatchlist', () => ({ useToggleWatchlist: () => toggleWatchlist }));
vi.mock('../../hooks/api/useWatchlist', () => ({ useWatchlist: () => ({ membership }) }));
vi.mock('../../hooks/api/useItemActions', () => ({ useToggleFavorite: () => toggleFav, useToggleWatched: () => toggleWatched }));
import ItemActions from './ItemActions';

beforeEach(() => { toggleWatchlist.mockReset(); toggleFav.mockReset(); toggleWatched.mockReset(); membership = new Set(); });

test('renders three buttons; not-saved shows Save-for-later and toggles it, stopping propagation', () => {
  const item = { Id: 'x', UserData: { IsFavorite: false, Played: false } } as BaseItemDto;
  const onParent = vi.fn();
  render(<div onClick={onParent}><ItemActions item={item} /></div>);
  expect(screen.getByRole('button', { name: /save for later/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add to favorites/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /mark watched/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /save for later/i }));
  expect(toggleWatchlist).toHaveBeenCalledWith(item);
  expect(onParent).not.toHaveBeenCalled(); // stopPropagation
});

test('reflects saved + favorite state and toggles favorite/watched', () => {
  membership = new Set(['x']);
  const item = { Id: 'x', UserData: { IsFavorite: true, Played: false } } as BaseItemDto;
  render(<ItemActions item={item} />);
  expect(screen.getByRole('button', { name: /remove from saved for later/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /remove from favorites/i }));
  expect(toggleFav).toHaveBeenCalledWith(item);
  fireEvent.click(screen.getByRole('button', { name: /mark watched/i }));
  expect(toggleWatched).toHaveBeenCalledWith(item);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/common/ItemActions.test.tsx`
Expected: FAIL — no save-for-later / favorites-labelled buttons yet.

- [ ] **Step 3: Implement**

Replace `src/components/common/ItemActions.tsx` with:

```tsx
import { Plus, Check, Heart, Circle, CircleCheck } from 'lucide-react';
import { useToggleWatchlist } from '../../hooks/api/useToggleWatchlist';
import { useWatchlist } from '../../hooks/api/useWatchlist';
import { useToggleFavorite, useToggleWatched } from '../../hooks/api/useItemActions';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './ItemActions.module.css';

export default function ItemActions({ item, size = 'md' }: { item: BaseItemDto; size?: 'sm' | 'md' }) {
  const toggleWatchlist = useToggleWatchlist();
  const toggleFavorite = useToggleFavorite();
  const toggleWatched = useToggleWatched();
  const { membership } = useWatchlist();
  const saved = membership.has(item.Id ?? '');
  const fav = !!item.UserData?.IsFavorite;
  const played = !!item.UserData?.Played;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const iconSize = size === 'sm' ? 16 : 19;
  const savedLabel = saved ? 'Remove from Saved for later' : 'Save for later';
  const favLabel = fav ? 'Remove from Favorites' : 'Add to Favorites';
  const watchLabel = played ? 'Mark unwatched' : 'Mark watched';
  return (
    <div className={`${styles.actions} ${size === 'sm' ? styles.sm : ''}`}>
      <button className={styles.btn} aria-label={savedLabel} title={savedLabel}
        onClick={(e) => { stop(e); toggleWatchlist(item); }}>
        {saved ? <Check size={iconSize} /> : <Plus size={iconSize} />}
      </button>
      <button className={`${styles.btn} ${fav ? styles.fav : ''}`} aria-label={favLabel} title={favLabel}
        onClick={(e) => { stop(e); toggleFavorite(item); }}>
        <Heart size={iconSize} fill={fav ? 'currentColor' : 'none'} />
      </button>
      <button className={`${styles.btn} ${played ? styles.on : ''}`} aria-label={watchLabel} title={watchLabel}
        onClick={(e) => { stop(e); toggleWatched(item); }}>
        {played ? <CircleCheck size={iconSize} /> : <Circle size={iconSize} />}
      </button>
    </div>
  );
}
```

Append to `src/components/common/ItemActions.module.css` a `.fav` rule (so the filled heart reads as "favorited"):

```css
.fav { border-color: var(--nf-red); color: var(--nf-red); }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/common/ItemActions.test.tsx`
Expected: PASS (2 tests). Also run `npx vitest run` (full suite — PreviewCard/PosterCard/DetailModal tests mock `ItemActions`, so they are unaffected) and `npx tsc --noEmit` (clean).

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ItemActions.tsx src/components/common/ItemActions.module.css src/components/common/ItemActions.test.tsx
git commit -m "feat: ItemActions three buttons (save-for-later + heart favorite + watched)"
```

---

### Task 5: Home reorder + Saved-for-later row + Favorites rename/move; live E2E

**Files:**
- Modify: `src/routes/Home.tsx`

**Interfaces:**
- Consumes: `useWatchlist` (Task 2); existing `useResumeItems`, `useNextUp`, `useLatestMedia`, `useFavorites`, `Row`, `RowSkeleton`.

Home has no unit test; this task is verified by `tsc`, the full suite staying green, and a live E2E.

- [ ] **Step 1: Implement the row changes**

In `src/routes/Home.tsx`, add the import and the hook, then reorder the rows.

Add with the other hook imports:

```tsx
import { useWatchlist } from '../hooks/api/useWatchlist';
```

Add with the other query calls (near `const favoritesQ = useFavorites();`):

```tsx
  const watchlist = useWatchlist();
```

Replace the `<div className={styles.rows}>…</div>` block with:

```tsx
      <div className={styles.rows}>
        {resumeQ.isLoading ? <RowSkeleton title="Continue Watching" /> : <Row title="Continue Watching" items={resumeQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
        {nextUpQ.isLoading ? <RowSkeleton title="Next Up" /> : <Row title="Next Up" items={nextUpQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
        <Row title="Saved for later" items={watchlist.items} onOpen={onOpen} onPlay={onPlay} />
        {mediaViews.map((v) => <LatestRow key={v.Id} view={v} onOpen={onOpen} onPlay={onPlay} />)}
        <Row title="Favorites" items={favoritesQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />
      </div>
```

(`Row` already returns `null` when `items` is empty, so the Saved-for-later and Favorites rows hide themselves until they have content.)

- [ ] **Step 2: Typecheck + full suite**

Run: `npx tsc --noEmit` (expected clean) and `npx vitest run` (expected: whole suite passes; no Home unit test exists, and `ItemActions` consumers mock it).

- [ ] **Step 3: Live E2E (Playwright, against the running dev server)**

A dev server may already be running on `:5173` serving this working tree — reuse it if so; otherwise start one (`VITE_JELLYFIN_SERVER=… npx vite --port 5173 --strictPort`) and stop only a server you started. Write the script in the scratchpad. Login: username `jellyfin`, password from `.env.local` key `JELLYFIN_TEST_PASS`. Headless chromium, viewport 1440x900. Login flow: fill `getByLabel(/username/i)` + `getByLabel(/password/i)`, click `getByRole('button',{name:/sign in/i})`, wait for an `h2`.

Assert:
1. Open a library item's DetailModal (navigate to a library, click a poster) → the hero shows three action buttons: `Save for later`, `Add to Favorites` (or Remove…), `Mark watched` (or unwatched).
2. Click **Save for later** → it flips to **Remove from Saved for later** and a `/Playlists` request fires (`page.on('request', … /Playlists/)`), created on first use.
3. Go Home → a **"Saved for later"** row is present (after "Next Up") and contains the item. Reload → still present (server-backed).
4. Click **Remove from Saved for later** on the item → it flips back and (after settle) leaves the row.
5. Click the heart (**Add to Favorites**) → it flips to **Remove from Favorites** and a `/UserFavoriteItems` request fires; Home shows a **"Favorites"** row **after the Latest rows** with the item.
6. Confirm the Home row order top→bottom includes "Next Up" before "Saved for later", and "Favorites" appears below at least one "Latest …" row.

Capture a screenshot. Report each assertion's result. Stop any dev server you started.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Home.tsx
git commit -m "feat: Home rows — Saved for later (after Next Up) + Favorites (bottom)"
```

---

## Notes for the executor
- `Row` renders nothing when `items` is empty (existing behavior) — no extra guarding needed for the two new rows.
- `useWatchlist()` is intentionally called both by the Saved-for-later `Row` (for `items`) and by every `ItemActions` (for `membership`) — react-query dedupes to one `['watchlist', userId]` query.
- Playlist removal MUST use `entryIds` = the item's `PlaylistItemId` (from `getPlaylistItems`), never its media `Id`.
- Do not change `useToggleFavorite`/`useToggleWatched`/`useFavorites` — Favorites keeps its existing behavior; only the row label/position and the ItemActions icon change.
- `--nf-red`, `--nf-outline` are existing CSS custom properties.
