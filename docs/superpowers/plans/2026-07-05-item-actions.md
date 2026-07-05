# Item Actions (My List + Watched) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add favorite ("My List") and watched/unwatched toggles that update optimistically everywhere a title appears, plus a "My List" row on the Home.

**Architecture:** A pure `patchItemUserData` + a react-query cache walker (`applyItemUserDataToCache`) patch an item's `UserData` across every cached query it appears in, with a rollback closure. `useToggleFavorite`/`useToggleWatched` wrap the SDK mark/unmark mutations around that optimistic patch and invalidate membership-defining queries on settle. A reusable `ItemActions` component surfaces the toggles in the DetailModal and on card hover.

**Tech Stack:** React 18 + TS, `@jellyfin/sdk`, `@tanstack/react-query` (`useMutation`/`useQuery`/`QueryClient`), Vitest + RTL.

## Global Constraints

- TypeScript `strict: true`; **no `any`** in `lib/`/`hooks/` (tests may cast; narrow `as {…}` casts on `unknown` cache values are allowed, not `as any`).
- `session.serverUrl === '/jf'`; same-origin. Delete regenerated `vite.config.js`/`.d.ts` after `tsc -b`/build.
- Known rare Node-26 `localStorage` test flake (~1/5 full runs); re-run once, don't chase it.
- Verified SDK (object/request form): `getUserLibraryApi(api).markFavoriteItem({userId,itemId})` / `unmarkFavoriteItem({userId,itemId})` → `{ data: UserItemDataDto }`; `getPlaystateApi(api).markPlayedItem({userId,itemId})` / `markUnplayedItem({userId,itemId})` → `{ data: UserItemDataDto }`. Live: POST `/UserFavoriteItems/{id}` → 200 `IsFavorite:true`.
- `getItemsApi(api).getItems({ userId, isFavorite:true, recursive:true, includeItemTypes:[Movie,Series], sortBy:[SortName], sortOrder:[Ascending], fields:[PrimaryImageAspectRatio], enableImageTypes:[Primary,Thumb] })` → favorites.
- `UserData` fields: `IsFavorite: boolean`, `Played: boolean`, `PlayedPercentage: number|null`, `PlaybackPositionTicks: number`.
- react-query keys already in use (from `src/hooks/api/*`): `['resume', userId]`, `['nextUp', userId]`, `['item', userId, itemId]`, plus library keys. New: `['favorites', userId]`.
- Reused existing: `useApi()` (`{api, session:{userId}}`), `Row` (`src/components/row/Row.tsx`, props `{title, items, onOpen, onPlay}`), tokens.
- Commit after each task with the shown message.

---

## Task 1: `patchItemUserData` (pure)

**Files:**
- Create: `src/lib/jellyfin/userData.ts`, `src/lib/jellyfin/userData.test.ts`

**Interfaces:**
- Produces:
  - `type UserDataPatch = { isFavorite?: boolean; played?: boolean }`
  - `patchItemUserData(item: BaseItemDto, patch: UserDataPatch): BaseItemDto` — returns a new item (never mutates input) with merged `UserData`: sets `IsFavorite` when `patch.isFavorite !== undefined`; when `patch.played !== undefined` sets `Played`, `PlayedPercentage` (`true→100, false→0`), and `PlaybackPositionTicks: 0`.

- [ ] **Step 1: Write failing test** — `src/lib/jellyfin/userData.test.ts`
```ts
import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { patchItemUserData } from './userData';

test('sets IsFavorite without touching played fields', () => {
  const item = { Id: 'x', UserData: { IsFavorite: false, Played: true, PlayedPercentage: 100 } } as BaseItemDto;
  const out = patchItemUserData(item, { isFavorite: true });
  expect(out.UserData?.IsFavorite).toBe(true);
  expect(out.UserData?.Played).toBe(true);
  expect(item.UserData?.IsFavorite).toBe(false); // input not mutated
  expect(out).not.toBe(item);
});

test('played=true sets Played+100% and clears position', () => {
  const item = { Id: 'x', UserData: { Played: false, PlayedPercentage: 40, PlaybackPositionTicks: 999 } } as BaseItemDto;
  const out = patchItemUserData(item, { played: true });
  expect(out.UserData).toMatchObject({ Played: true, PlayedPercentage: 100, PlaybackPositionTicks: 0 });
});

test('played=false sets 0%; handles missing UserData', () => {
  expect(patchItemUserData({ Id: 'x' } as BaseItemDto, { played: false }).UserData)
    .toMatchObject({ Played: false, PlayedPercentage: 0, PlaybackPositionTicks: 0 });
});
```

- [ ] **Step 2: Run, verify fail** — `npm test src/lib/jellyfin/userData.test.ts`.

- [ ] **Step 3: Implement `userData.ts`**
```ts
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

export type UserDataPatch = { isFavorite?: boolean; played?: boolean };

export function patchItemUserData(item: BaseItemDto, patch: UserDataPatch): BaseItemDto {
  const ud = { ...(item.UserData ?? {}) };
  if (patch.isFavorite !== undefined) ud.IsFavorite = patch.isFavorite;
  if (patch.played !== undefined) {
    ud.Played = patch.played;
    ud.PlayedPercentage = patch.played ? 100 : 0;
    ud.PlaybackPositionTicks = 0;
  }
  return { ...item, UserData: ud };
}
```

- [ ] **Step 4: Run, verify pass. Commit** — `git add -A && git commit -m "feat: patchItemUserData pure helper"`

---

## Task 2: `applyItemUserDataToCache` (cache walker + rollback)

**Files:**
- Create: `src/lib/query/cacheUpdate.ts`, `src/lib/query/cacheUpdate.test.ts`

**Interfaces:**
- Consumes: `patchItemUserData`, `UserDataPatch` (Task 1); `QueryClient` from `@tanstack/react-query`.
- Produces: `applyItemUserDataToCache(qc: QueryClient, itemId: string, patch: UserDataPatch): () => void` — patches the item everywhere in the cache; returns a rollback closure restoring exactly the changed queries. Recognizes value shapes: a single `BaseItemDto`, an array of items, a `{ Items: [] }` result, and an infinite `{ pages: [{ Items: [] }] }` result.

- [ ] **Step 1: Write failing test** — `src/lib/query/cacheUpdate.test.ts`
```ts
import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { applyItemUserDataToCache } from './cacheUpdate';

const item = (id: string, fav = false): BaseItemDto => ({ Id: id, Name: id, UserData: { IsFavorite: fav } } as BaseItemDto);

test('patches item X across array / {Items} / infinite / single shapes and rolls back', () => {
  const qc = new QueryClient();
  qc.setQueryData(['arr'], [item('a'), item('X')]);
  qc.setQueryData(['res'], { Items: [item('X'), item('b')], TotalRecordCount: 2 });
  qc.setQueryData(['inf'], { pages: [{ Items: [item('c')] }, { Items: [item('X')] }], pageParams: [0, 60] });
  qc.setQueryData(['one'], item('X'));
  qc.setQueryData(['other'], [item('a')]); // no X -> untouched, not in rollback

  const rollback = applyItemUserDataToCache(qc, 'X', { isFavorite: true });

  const favOf = (v: BaseItemDto | undefined) => v?.UserData?.IsFavorite;
  expect(favOf((qc.getQueryData(['arr']) as BaseItemDto[])[1])).toBe(true);
  expect(favOf((qc.getQueryData(['res']) as { Items: BaseItemDto[] }).Items[0])).toBe(true);
  expect(favOf((qc.getQueryData(['inf']) as { pages: { Items: BaseItemDto[] }[] }).pages[1].Items[0])).toBe(true);
  expect(favOf(qc.getQueryData(['one']) as BaseItemDto)).toBe(true);
  // untouched query keeps its identity
  const otherBefore = qc.getQueryData(['other']);

  rollback();
  expect(favOf((qc.getQueryData(['arr']) as BaseItemDto[])[1])).toBe(false);
  expect(favOf(qc.getQueryData(['one']) as BaseItemDto)).toBe(false);
  expect(qc.getQueryData(['other'])).toBe(otherBefore);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `cacheUpdate.ts`**
```ts
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { patchItemUserData, type UserDataPatch } from '../jellyfin/userData';

function isItem(v: unknown): v is BaseItemDto {
  return !!v && typeof v === 'object' && typeof (v as { Id?: unknown }).Id === 'string';
}

// Returns the (possibly new) value and whether it changed.
function patchValue(value: unknown, itemId: string, patch: UserDataPatch): { value: unknown; changed: boolean } {
  if (isItem(value)) {
    return value.Id === itemId ? { value: patchItemUserData(value, patch), changed: true } : { value, changed: false };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const r = patchValue(v, itemId, patch);
      if (r.changed) changed = true;
      return r.value;
    });
    return changed ? { value: next, changed: true } : { value, changed: false };
  }
  if (value && typeof value === 'object') {
    const obj = value as { Items?: unknown; pages?: unknown };
    if (Array.isArray(obj.Items)) {
      const r = patchValue(obj.Items, itemId, patch);
      return r.changed ? { value: { ...value, Items: r.value }, changed: true } : { value, changed: false };
    }
    if (Array.isArray(obj.pages)) {
      let changed = false;
      const pages = obj.pages.map((pg) => {
        const r = patchValue(pg, itemId, patch);
        if (r.changed) changed = true;
        return r.value;
      });
      return changed ? { value: { ...value, pages }, changed: true } : { value, changed: false };
    }
  }
  return { value, changed: false };
}

export function applyItemUserDataToCache(qc: QueryClient, itemId: string, patch: UserDataPatch): () => void {
  const prev: [QueryKey, unknown][] = [];
  for (const [key, data] of qc.getQueriesData({})) {
    const r = patchValue(data, itemId, patch);
    if (r.changed) {
      prev.push([key, data]);
      qc.setQueryData(key, r.value);
    }
  }
  return () => { for (const [key, data] of prev) qc.setQueryData(key, data); };
}
```

- [ ] **Step 4: Run, verify pass. Commit** — `git add -A && git commit -m "feat: applyItemUserDataToCache optimistic cache patch + rollback"`

---

## Task 3: `useToggleFavorite` / `useToggleWatched` + `useFavorites`

**Files:**
- Create: `src/hooks/api/useItemActions.ts`, `src/hooks/api/useItemActions.test.tsx`
- Create: `src/hooks/api/useFavorites.ts`

**Interfaces:**
- Consumes: `useApi`, `applyItemUserDataToCache` (Task 2), SDK `getUserLibraryApi`/`getPlaystateApi`/`getItemsApi`.
- Produces:
  - `useToggleFavorite(): (item: BaseItemDto) => void`
  - `useToggleWatched(): (item: BaseItemDto) => void`
  - `useFavorites(): UseQueryResult<BaseItemDto[]>` (key `['favorites', userId]`)
  - The toggles are optimistic (patch cache on mutate, rollback on error) and invalidate membership queries on settle. Boolean toggles are deterministic, so no server reconcile is needed beyond the settle-invalidate.

- [ ] **Step 1: Write failing test** — `src/hooks/api/useItemActions.test.tsx`
```tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u', serverUrl: '/jf', accessToken: 't', userName: 'x' } }) }));
const mark = vi.fn().mockResolvedValue({ data: { IsFavorite: true } });
const unmark = vi.fn().mockResolvedValue({ data: { IsFavorite: false } });
vi.mock('@jellyfin/sdk/lib/utils/api/user-library-api', () => ({ getUserLibraryApi: () => ({ markFavoriteItem: mark, unmarkFavoriteItem: unmark }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/playstate-api', () => ({ getPlaystateApi: () => ({ markPlayedItem: vi.fn().mockResolvedValue({ data: {} }), markUnplayedItem: vi.fn().mockResolvedValue({ data: {} }) }) }));

import { useToggleFavorite } from './useItemActions';

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('favoriting a non-favorite calls markFavoriteItem and optimistically patches the cache', async () => {
  const qc = new QueryClient();
  qc.setQueryData(['resume', 'u'], [{ Id: 'X', UserData: { IsFavorite: false } } as BaseItemDto]);
  const { result } = renderHook(() => useToggleFavorite(), { wrapper: makeWrapper(qc) });
  await act(async () => { result.current({ Id: 'X', UserData: { IsFavorite: false } } as BaseItemDto); });
  // optimistic patch is synchronous in onMutate
  expect((qc.getQueryData(['resume', 'u']) as BaseItemDto[])[0].UserData?.IsFavorite).toBe(true);
  await waitFor(() => expect(mark).toHaveBeenCalledWith({ userId: 'u', itemId: 'X' }));
  expect(unmark).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `useItemActions.ts`**
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api';
import { getPlaystateApi } from '@jellyfin/sdk/lib/utils/api/playstate-api';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { applyItemUserDataToCache } from '../../lib/query/cacheUpdate';

export function useToggleFavorite(): (item: BaseItemDto) => void {
  const { api, session } = useApi();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (item: BaseItemDto) => {
      const lib = getUserLibraryApi(api);
      const req = { userId: session.userId, itemId: item.Id ?? '' };
      const res = item.UserData?.IsFavorite ? await lib.unmarkFavoriteItem(req) : await lib.markFavoriteItem(req);
      return res.data;
    },
    onMutate: async (item: BaseItemDto) => {
      await qc.cancelQueries();
      const rollback = applyItemUserDataToCache(qc, item.Id ?? '', { isFavorite: !item.UserData?.IsFavorite });
      return { rollback };
    },
    onError: (_e, _item, ctx) => ctx?.rollback(),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['favorites', session.userId] }); },
  });
  return (item) => m.mutate(item);
}

export function useToggleWatched(): (item: BaseItemDto) => void {
  const { api, session } = useApi();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (item: BaseItemDto) => {
      const ps = getPlaystateApi(api);
      const req = { userId: session.userId, itemId: item.Id ?? '' };
      const res = item.UserData?.Played ? await ps.markUnplayedItem(req) : await ps.markPlayedItem(req);
      return res.data;
    },
    onMutate: async (item: BaseItemDto) => {
      await qc.cancelQueries();
      const rollback = applyItemUserDataToCache(qc, item.Id ?? '', { played: !item.UserData?.Played });
      return { rollback };
    },
    onError: (_e, _item, ctx) => ctx?.rollback(),
    onSettled: (_d, _e, item) => {
      void qc.invalidateQueries({ queryKey: ['resume', session.userId] });
      void qc.invalidateQueries({ queryKey: ['nextUp', session.userId] });
      void qc.invalidateQueries({ queryKey: ['item', session.userId, item.Id ?? ''] });
    },
  });
  return (item) => m.mutate(item);
}
```

- [ ] **Step 4: Implement `useFavorites.ts`**
```ts
import { useQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { BaseItemKind, ItemFields, ItemSortBy, SortOrder, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';

export function useFavorites() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: ['favorites', session.userId],
    queryFn: async ({ signal }) => {
      const { data } = await getItemsApi(api).getItems({
        userId: session.userId,
        isFavorite: true,
        recursive: true,
        includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
        sortBy: [ItemSortBy.SortName],
        sortOrder: [SortOrder.Ascending],
        fields: [ItemFields.PrimaryImageAspectRatio],
        enableImageTypes: [ImageType.Primary, ImageType.Thumb],
        limit: 50,
      }, { signal });
      return data.Items ?? [];
    },
  });
}
```

- [ ] **Step 5: Run tests + `tsc -b`. Commit** — `git add -A && git commit -m "feat: useToggleFavorite/useToggleWatched (optimistic) + useFavorites"`

---

## Task 4: `ItemActions` component

**Files:**
- Create: `src/components/common/ItemActions.tsx`, `ItemActions.module.css`, `ItemActions.test.tsx`

**Interfaces:**
- Consumes: `useToggleFavorite`/`useToggleWatched` (Task 3), `BaseItemDto`.
- Produces: `ItemActions({ item, size = 'md' }: { item: BaseItemDto; size?: 'sm' | 'md' })` — two circular buttons: favorite (aria-label "Add to My List" / "Remove from My List") and watched (aria-label "Mark watched" / "Mark unwatched"), state from `item.UserData`; each click calls the toggle and `stopPropagation`.

- [ ] **Step 1: Write failing test** — `src/components/common/ItemActions.test.tsx`
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

const toggleFav = vi.fn(); const toggleWatched = vi.fn();
vi.mock('../../hooks/api/useItemActions', () => ({ useToggleFavorite: () => toggleFav, useToggleWatched: () => toggleWatched }));
import ItemActions from './ItemActions';

test('reflects state and toggles favorite + watched, stopping propagation', () => {
  const item = { Id: 'x', UserData: { IsFavorite: true, Played: false } } as BaseItemDto;
  const onParent = vi.fn();
  render(<div onClick={onParent}><ItemActions item={item} /></div>);
  expect(screen.getByRole('button', { name: /remove from my list/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /remove from my list/i }));
  expect(toggleFav).toHaveBeenCalledWith(item);
  fireEvent.click(screen.getByRole('button', { name: /mark watched/i }));
  expect(toggleWatched).toHaveBeenCalledWith(item);
  expect(onParent).not.toHaveBeenCalled(); // stopPropagation
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `ItemActions.tsx`**
```tsx
import { useToggleFavorite, useToggleWatched } from '../../hooks/api/useItemActions';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './ItemActions.module.css';

export default function ItemActions({ item, size = 'md' }: { item: BaseItemDto; size?: 'sm' | 'md' }) {
  const toggleFavorite = useToggleFavorite();
  const toggleWatched = useToggleWatched();
  const fav = !!item.UserData?.IsFavorite;
  const played = !!item.UserData?.Played;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className={`${styles.actions} ${size === 'sm' ? styles.sm : ''}`}>
      <button
        className={styles.btn}
        aria-label={fav ? 'Remove from My List' : 'Add to My List'}
        onClick={(e) => { stop(e); toggleFavorite(item); }}
      >{fav ? '✓' : '＋'}</button>
      <button
        className={`${styles.btn} ${played ? styles.on : ''}`}
        aria-label={played ? 'Mark unwatched' : 'Mark watched'}
        onClick={(e) => { stop(e); toggleWatched(item); }}
      >{played ? '↺' : '⌾'}</button>
    </div>
  );
}
```
`ItemActions.module.css`:
```css
.actions { display: inline-flex; gap: 8px; }
.btn { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--nf-outline); background: rgba(20,20,20,.7); color: #fff; display: grid; place-items: center; font-size: 15px; }
.btn:hover { border-color: #fff; background: rgba(40,40,40,.9); }
.sm .btn { width: 30px; height: 30px; font-size: 13px; }
.on { border-color: var(--nf-red); color: var(--nf-red); }
```

- [ ] **Step 4: Run tests + `tsc -b`. Commit** — `git add -A && git commit -m "feat: ItemActions favorite + watched buttons"`

---

## Task 5: Wire into DetailModal + PreviewCard + PosterCard + Home My List row

**Files:**
- Modify: `src/components/detail/DetailModal.tsx`, `src/components/row/PreviewCard.tsx`, `src/components/library/PosterCard.tsx` (+ `PosterCard.module.css`), `src/routes/Home.tsx`

**Interfaces:**
- Consumes: `ItemActions` (Task 4), `useFavorites` (Task 3), `Row`.

- [ ] **Step 1: DetailModal** — add `import ItemActions from '../common/ItemActions';` and render it right after the Play button in the hero content (it currently is `<button className={styles.play} onClick={() => onPlay(item)}>▶ Play</button>`):
```tsx
<button className={styles.play} onClick={() => onPlay(item)}>▶ Play</button>
<ItemActions item={item} size="md" />
```
(Both live in the same `.heroContent` container; wrap them in a flex row if needed — add `display:flex; gap:12px; align-items:center;` to `.heroContent`'s button area or a new `.heroButtons` wrapper.)

- [ ] **Step 2: PreviewCard** — add `import ItemActions from '../common/ItemActions';` and render `<ItemActions item={item} size="sm" />` inside the `.actions` div, after the Play and More buttons:
```tsx
<div className={styles.actions}>
  <button className={styles.play} onClick={() => onPlay(item)} aria-label={`Play ${label}`}>▶</button>
  <button className={styles.more} onClick={() => onOpen(item)} aria-label={`More info ${label}`}>⌄</button>
  <ItemActions item={item} size="sm" />
</div>
```
(These are already siblings inside the `.panel` div — not nested in the `.art` button — so no nesting problem.)

- [ ] **Step 3: PosterCard — restructure to avoid nested buttons.** The card is currently one `<button>` wrapping everything; nesting `ItemActions` buttons inside it is invalid HTML. Change the outer element to a relative `<div>` with the clickable region as an inner button, and overlay `ItemActions` as a sibling:
```tsx
import { useApi } from '../../hooks/useApi';
import { getPosterUrl } from '../../lib/jellyfin/images';
import { playedPercent } from '../../lib/format';
import { Img } from '../common/Img';
import { ProgressBar } from '../common/ProgressBar';
import ItemActions from '../common/ItemActions';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './PosterCard.module.css';

export default function PosterCard({ item, onOpen }: { item: BaseItemDto; onOpen: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const label = item.Name ?? 'Untitled';
  return (
    <div className={styles.card}>
      <button className={styles.hit} onClick={() => onOpen(item)} aria-label={label}>
        <div className={styles.poster}>
          <Img src={getPosterUrl(api, item, { width: 240 })} alt={label} />
          <ProgressBar percent={playedPercent(item)} />
        </div>
        <div className={styles.title}>{label}</div>
        {item.ProductionYear ? <div className={styles.year}>{item.ProductionYear}</div> : null}
      </button>
      <div className={styles.overlay}><ItemActions item={item} size="sm" /></div>
    </div>
  );
}
```
Update `PosterCard.module.css`: keep `.poster/.title/.year` rules unchanged; make `.card { position: relative; }`; move the old `.card` flex layout onto the inner button — `.hit { display:flex; flex-direction:column; gap:6px; text-align:left; width:100%; }`; add `.overlay { position:absolute; top:6px; right:6px; opacity:0; transition:opacity .15s ease; } .card:hover .overlay, .card:focus-within .overlay { opacity:1; }`. The existing hover-scale selectors `.card:hover .poster, .card:focus-visible .poster` still work unchanged (`.poster` is still a descendant of `.card`); leave them as-is. Under `@media (prefers-reduced-motion: reduce)` also disable the `.overlay` transition.

- [ ] **Step 4: Home "My List" row** — in `src/routes/Home.tsx`, add `import { useFavorites } from '../hooks/api/useFavorites';`, call `const favoritesQ = useFavorites();`, and render a My List row right after "Continue Watching":
```tsx
<Row title="My List" items={favoritesQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />
```
(`Row` returns null when empty, so it disappears when there are no favorites.)

- [ ] **Step 5: Run `npm test` + `npx tsc -b` + `npm run build`.** All pass; delete regenerated `vite.config.js`/`.d.ts`. Update any snapshot/DOM assumption only if an existing test breaks (none expected — PosterCard has no test; DetailModal test mocks its subtree).

- [ ] **Step 6: Playwright E2E (live).** Log in; open a title's DetailModal → click "Add to My List" → the favorite button flips to ✓ and, after settle, the title appears in the Home "My List" row; click "Mark watched" → the watched button flips; reload the page → both states persist (server-backed); hover a library `PosterCard` → the action overlay appears and toggling favorite reflects in My List. Capture a screenshot.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: wire ItemActions into detail/cards + My List home row"`

---

## Self-Review

**Spec coverage:**
- §1 My List toggle + Home row; Mark watched/unwatched; controls in detail + card hover; optimistic → Tasks 1–5. ✓
- §3 architecture (userData, cacheUpdate, useItemActions, useFavorites, ItemActions, integrations) → all tasked. ✓
- §4 data flow (optimistic patch everywhere → SDK → rollback on error → invalidate membership) → Task 3. ✓
- §5 surfaces (DetailModal cluster, PreviewCard panel, PosterCard overlay, Home My List) → Task 5. ✓
- §6 error handling (rollback on error, empty My List row hidden) → Tasks 3,5. ✓
- §7 testing (patch unit, cache-walker unit, mutation hook test, ItemActions component test, live E2E) → Tasks 1–5. ✓

**Type consistency:** `UserDataPatch`, `patchItemUserData`, `applyItemUserDataToCache`, `useToggleFavorite`/`useToggleWatched` (`(item)=>void`), `useFavorites`, `ItemActions({item,size})` are defined once and consumed consistently. `getItems`/mark/unmark use the SDK object form. Query keys `['favorites'|'resume'|'nextUp'|'item', userId, ...]` match existing hooks.

**Placeholder scan:** no TBD/TODO; every code step complete. The spec's "reconcile from returned UserData" is intentionally simplified to optimistic-patch + settle-invalidate (deterministic boolean toggles) — stated in Task 3's Interfaces, not left implicit.

**Known follow-ups (Minor):**
- `useToggleWatched` invalidates resume/nextUp/item; a Series played-toggle also affects its episodes' rows — the invalidations refetch the affected library/latest rows lazily on next view; acceptable for v1.
- No toast system; the visible optimistic rollback is the error feedback (per spec §9).
