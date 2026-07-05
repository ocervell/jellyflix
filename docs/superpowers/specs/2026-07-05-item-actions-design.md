# Jellyflix Item Actions (My List + Watched) — Design Spec

**Date:** 2026-07-05
**Status:** Approved design → implementation planning
**Sub-project:** SP1 of the 9-feature set (My List / favorites + Mark watched/unwatched). Foundation: the optimistic UserData-mutation pattern reused by later features.

## 1. Scope
- **My List (favorites):** toggle a title's favorite state; a **"My List" row on the Home** (favorites, movies + series). Full list already reachable via the library grid's existing "Favorites" filter.
- **Mark watched / unwatched:** toggle a title's played state.
- **Controls** appear in the **DetailModal** (button cluster) and on **card hover** (PreviewCard info panel + PosterCard overlay).
- **Optimistic** cache updates: the toggle reflects instantly everywhere the item is shown, with rollback on error.

### Out of scope (this sub-project)
A dedicated `/mylist` route (the Favorites filter covers it), rating/thumbs, bulk actions, per-episode watched from the series card (marking a Series toggles all episodes via the API — item-level only here).

## 2. Verified server/SDK facts
- `getUserLibraryApi(api).markFavoriteItem({ userId, itemId })` / `unmarkFavoriteItem({ userId, itemId })` → `UserItemDataDto`. REST: `POST/DELETE /UserFavoriteItems/{itemId}`. Live-tested: POST → 200 `IsFavorite:true`; DELETE reverts.
- `getPlaystateApi(api).markPlayedItem({ userId, itemId })` / `markUnplayedItem({ userId, itemId })` → `UserItemDataDto`. REST: `POST/DELETE /UserPlayedItems/{itemId}`.
- Both return the updated `UserItemDataDto` (`IsFavorite`, `Played`, `PlayedPercentage`, `PlaybackPositionTicks`) — used to reconcile the optimistic patch.
- `getItemsApi(api).getItems({ userId, isFavorite: true, recursive: true, includeItemTypes: [Movie, Series], ... })` → the My List row.

## 3. Architecture (isolated, testable units)

```
src/
  lib/jellyfin/
    userData.ts        (new, pure)  patchItemUserData(item, patch) -> new item with updated UserData
    userData.test.ts
  hooks/api/
    useItemActions.ts  (new)  useToggleFavorite() / useToggleWatched() — useMutation + optimistic cache patch
    useItemActions.test.tsx
    useFavorites.ts    (new)  getItems(isFavorite:true) for the My List row
  lib/query/
    cacheUpdate.ts     (new, mostly pure)  applyItemUserDataToCache(queryClient, itemId, patch) + snapshot/restore
    cacheUpdate.test.ts
  components/common/
    ItemActions.tsx / .module.css   reusable favorite + watched circular buttons for an item
    ItemActions.test.tsx
  components/detail/DetailModal.tsx   (modify) add <ItemActions> to the hero button cluster
  components/row/PreviewCard.tsx      (modify) add <ItemActions> to the info panel
  components/library/PosterCard.tsx   (modify) add a hover <ItemActions> overlay
  routes/Home.tsx                     (modify) add the "My List" row (useFavorites)
```

### Unit contracts
- **`userData.ts`** (pure): `patchItemUserData(item: BaseItemDto, patch: { isFavorite?: boolean; played?: boolean }): BaseItemDto` — returns a shallow-cloned item with `UserData` merged: `IsFavorite` set when `patch.isFavorite` given; when `patch.played` given, sets `Played` and `PlayedPercentage` (`true→100`, `false→0`) and clears `PlaybackPositionTicks` to 0. Never mutates the input.
- **`cacheUpdate.ts`**: `applyItemUserDataToCache(qc: QueryClient, itemId: string, patch): () => void` — walks all cached queries via `qc.getQueriesData()`, and for each value shaped as an item array, a `{ Items: [] }` result, an infinite `{ pages: [{ Items: [] }] }`, or a single `BaseItemDto`, replaces any entry whose `Id === itemId` with `patchItemUserData(entry, patch)` (via `qc.setQueryData`). Returns a **rollback** closure that restores the exact previous values it changed. Pure logic over the cache API; tested with a real `QueryClient` seeded with each shape.
- **`useItemActions.ts`**:
  - `useToggleFavorite(): (item: BaseItemDto) => void` — a `useMutation`; `mutationFn` picks `markFavoriteItem` vs `unmarkFavoriteItem` from the item's current `UserData.IsFavorite`; `onMutate` cancels affected queries, applies `applyItemUserDataToCache(..., { isFavorite: !current })`, returns the rollback; `onError` rolls back; `onSuccess(data)` reconciles the item's UserData from the returned `UserItemDataDto`; `onSettled` invalidates the **My List** query (membership change) — the instant heart is optimistic, the row add/remove settles on refetch.
  - `useToggleWatched(): (item) => void` — same shape with `markPlayedItem`/`markUnplayedItem`, patch `{ played: !current }`; `onSettled` invalidates **resume** (Continue Watching membership) + the item detail.
- **`useFavorites()`** → `UseQueryResult<BaseItemDto[]>` via `getItems({ isFavorite: true, includeItemTypes: [Movie, Series], recursive: true, sortBy:[SortName], fields, enableImageTypes })`, keyed `['favorites', userId]` (the key `useToggleFavorite` invalidates).
- **`ItemActions.tsx`**: `ItemActions({ item, size?: 'sm'|'md' })` — two circular icon buttons: **favorite** (filled heart/♥ when `UserData.IsFavorite`, else ♡/＋) and **watched** (filled ✓ when `UserData.Played`, else ○). Clicks call `useToggleFavorite()(item)` / `useToggleWatched()(item)` and `stopPropagation` (so a card click doesn't also open detail). Buttons show the current state from `item.UserData`.

## 4. Data flow
Click favorite → `useToggleFavorite()(item)` → `onMutate`: patch this item's `UserData.IsFavorite` across every cached query it appears in (rows, grid, detail) → **heart fills instantly everywhere** → SDK mark/unmark → `onError` restores the snapshot → `onSuccess` reconciles from the returned UserData → `onSettled` invalidates `['favorites', userId]` so the My List row adds/removes the item. Watched is identical, invalidating `['resume', userId]` + the item's detail query so Continue-Watching and progress bars follow.

## 5. UI surfaces
- **DetailModal**: add `<ItemActions item={item} size="md" />` beside the Play button in the hero cluster.
- **PreviewCard** (home rows): add `<ItemActions item={item} size="sm" />` into the info panel's action row (next to Play / More).
- **PosterCard** (library grid): add a small hover overlay (top-right) with `<ItemActions item={item} size="sm" />`, shown on `:hover`/`:focus-within`.
- **Home**: insert a **"My List"** `Row` (from `useFavorites`) — placed after "Continue Watching" (only rendered when non-empty, per `Row`'s existing behavior).

## 6. Error handling
- Mutation failure → automatic rollback of the optimistic patch (the toggle visibly reverts) + a brief inline toast/console note; no crash.
- Concurrent toggles on the same item → react-query mutation keying + last-write reconciliation from the server response; the snapshot/rollback is per-mutation.
- `useFavorites` error/empty → the My List row simply doesn't render (Row returns null on empty), consistent with other rows.

## 7. Testing
- **Unit (`userData.ts`)**: `patchItemUserData` sets IsFavorite; sets Played+PlayedPercentage(100/0)+clears position; never mutates input; handles missing `UserData`.
- **Unit (`cacheUpdate.ts`)**: seed a real `QueryClient` with an item array, a `{Items}` result, an infinite `{pages}`, and a single item all containing item X; `applyItemUserDataToCache(qc,'X',{isFavorite:true})` flips X in all four; the returned rollback restores all four exactly; items ≠ X untouched.
- **Hook (`useItemActions`)**: `useToggleFavorite` on a non-favorite item calls `markFavoriteItem` (not unmark), optimistically flips the cache, and on mutation error rolls back; `useToggleWatched` calls `markPlayedItem` for an unplayed item.
- **Component (`ItemActions`)**: renders filled heart when `IsFavorite`, empty otherwise; clicking favorite calls the toggle and stops propagation; watched likewise.
- **E2E (Playwright, live)**: open a title → click My List → heart fills, and the "My List" home row shows it after settle; click Watched → played state reflects; reload → both persist (server-backed); un-favorite → removed from My List row.

## 8. Milestones (for the plan)
1. `userData.ts` (pure patch) + tests.
2. `cacheUpdate.ts` (cache walker + rollback) + tests.
3. `useItemActions.ts` (toggle mutations, optimistic) + `useFavorites.ts` + tests.
4. `ItemActions.tsx` component + tests.
5. Wire into DetailModal + PreviewCard + PosterCard + Home "My List" row; live E2E.

## 9. Open items / dependencies
- Confirm the exact `getItems` `isFavorite` + `includeItemTypes` field names against the installed SDK at implementation (already verified `isFavorite` exists on `ItemsApiGetItemsRequest`).
- Toast mechanism: the app has none yet; on mutation error use a minimal inline/console notice (a full toast system is out of scope) — the visible rollback is the primary feedback.
