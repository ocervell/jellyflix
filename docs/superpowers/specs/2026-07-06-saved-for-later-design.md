# Jellyflix "Saved for later" + Favorites split — Design Spec

**Date:** 2026-07-06
**Status:** Approved design → implementation planning
**Sub-project:** Splits the single "My List" (favorites) affordance into two independent lists — a **Saved for later** watchlist (backed by a Jellyfin Playlist) and **Favorites** (native `IsFavorite`) — and reorders the Home rows.

## 1. Scope
- **Saved for later (watchlist):** a manual list backed by a Jellyfin **Playlist** named `"Saved for later"`. A `+` button on every item toggles membership; a **"Saved for later" Home row** shows its items (placed after "Next Up").
- **Favorites:** the existing `IsFavorite` list, but the Home row is **renamed** from "My List" to **"Favorites"**, **moved** to the bottom (after the Latest rows), and its button uses a **heart** icon.
- **Watched:** unchanged — the watched/unwatched toggle stays on cards.
- Both toggles are **optimistic** (instant everywhere, rollback on error), matching the existing favorites pattern.

### Out of scope
- Reordering items within the playlist; multiple watchlists; sharing/permissions; a dedicated `/saved` route (the Home row + future search cover discovery); migrating existing favorites into the watchlist.

## 2. Verified server/SDK facts
- **Find the playlist:** `getItemsApi(api).getItems({ userId, includeItemTypes: [BaseItemKind.Playlist], recursive: true })` → find the entry whose `Name === "Saved for later"`. Absent = the user has never saved anything.
- **Create (first-ever add):** `getPlaylistsApi(api).createPlaylist({ name: "Saved for later", ids: [itemId], userId })` → `PlaylistCreationResult` with `{ Id }` (the new playlist id).
- **Add:** `getPlaylistsApi(api).addItemToPlaylist({ playlistId, ids: [itemId], userId })` → `void`.
- **List items:** `getPlaylistsApi(api).getPlaylistItems({ playlistId, userId, fields: [PrimaryImageAspectRatio], enableImageTypes: [Primary, Thumb] })` → `{ Items }`. **Each returned item carries `PlaylistItemId`** (the per-entry id), distinct from its `Id` (the media id).
- **Remove:** `getPlaylistsApi(api).removeItemFromPlaylist({ playlistId, entryIds: [playlistItemId] })` → `void`. **`entryIds` are `PlaylistItemId`s, NOT media ids** — so removal requires the entry id from the listed items.
- `BaseItemDto` has both `Id` and `PlaylistItemId`.

## 3. Key difference from Favorites (why a new data layer)
Favorites is a **per-item flag** (`UserData.IsFavorite`) — every card already knows its own state. Playlist membership is **not** on the item, so cards cannot tell whether they are "saved" without the playlist's contents. The design therefore adds a small watchlist data layer that fetches the playlist once and exposes membership (and the entry ids needed for removal) to every `ItemActions`.

## 4. Architecture (isolated, testable units)

```
src/
  lib/jellyfin/
    watchlist.ts        (new, pure)  PLAYLIST_NAME + indexWatchlist(items) + optimistic list patchers
    watchlist.test.ts
  hooks/api/
    useWatchlist.ts     (new)  find playlist + list items; exposes items/membership/entryById/playlistId
    useWatchlist.test.tsx
    useToggleWatchlist.ts (new) optimistic create/add/remove mutation
    useToggleWatchlist.test.tsx
  components/common/
    ItemActions.tsx     (modify)  add Saved-for-later (+/✓) button; Favorites -> heart icon; watched unchanged
    ItemActions.module.css (modify if needed)
    ItemActions.test.tsx (modify)  three buttons + states
  routes/
    Home.tsx            (modify)  reorder rows; add "Saved for later" row; rename "My List" -> "Favorites", move to bottom
```

### Unit contracts
- **`watchlist.ts`** (pure):
  - `export const PLAYLIST_NAME = 'Saved for later'`.
  - `indexWatchlist(items: BaseItemDto[]): { ids: Set<string>; entryById: Map<string, string> }` — `ids` = the set of media `Id`s in the playlist (membership); `entryById` maps media `Id → PlaylistItemId` (for removal). Skips items missing `Id`.
  - `addItemToList(items, item)` / `removeItemFromList(items, itemId)` — pure, immutable helpers used by the optimistic cache patch (append if absent / filter out by media `Id`). Used so add/remove and their rollback are testable without a cache.
- **`useWatchlist()`** → `{ playlistId: string | null; items: BaseItemDto[]; membership: Set<string>; entryById: Map<string,string>; isLoading: boolean }`, keyed `['watchlist', userId]`. `queryFn`: find the `"Saved for later"` playlist; if none, return `{ playlistId: null, items: [] }`; else `getPlaylistItems` and return `{ playlistId, items }`. `membership`/`entryById` are derived from `items` via `indexWatchlist`. Data shape stored in the cache is `{ playlistId: string | null; items: BaseItemDto[] }`.
- **`useToggleWatchlist(): (item: BaseItemDto) => void`** — a `useMutation`:
  - `mutationFn`: read current `{ playlistId, items }` from the `['watchlist', userId]` cache. If the item is **not** a member → `playlistId` ? `addItemToPlaylist({ playlistId, ids:[id], userId })` : `createPlaylist({ name: PLAYLIST_NAME, ids:[id], userId })`. If it **is** a member → `removeItemFromPlaylist({ playlistId, entryIds:[ entryById.get(id)! ] })`.
  - `onMutate`: cancel `['watchlist', userId]`, optimistically patch the cached `items` (append the toggled item, or remove it by `Id`) so the `+`/`✓` state and the "Saved for later" row update instantly; return the snapshot for rollback.
  - `onError`: restore the snapshot.
  - `onSettled`: invalidate `['watchlist', userId]` so a refetch reconciles the real `playlistId` (after a first-ever create) and the real `PlaylistItemId`s.
- **`ItemActions.tsx`** — now three circular buttons, in order:
  1. **Saved for later**: `+` when not saved, `✓` when saved (state from `useWatchlist().membership.has(item.Id)`); `onClick` → `useToggleWatchlist()(item)`. `aria-label`/`title`: "Save for later" / "Remove from Saved for later".
  2. **Favorite**: heart outline when not favorite, filled heart when favorite (`item.UserData.IsFavorite`); `useToggleFavorite()`. Labels "Add to Favorites" / "Remove from Favorites".
  3. **Watched**: unchanged (`○`/`⊘`, `useToggleWatched()`).
  All buttons `stopPropagation`. Icons from `lucide-react` (`Plus`, `Check`, `Heart`, `Circle`, `CircleCheck`).

## 5. UI surfaces
- **Home** row order becomes:
  1. Continue Watching
  2. Next Up
  3. **Saved for later** (`useWatchlist().items`, renders only when non-empty via `Row`'s existing behavior)
  4. Latest ‹view› rows
  5. **Favorites** (`useFavorites`, renamed from "My List")
- **ItemActions** appears wherever it does today (DetailModal hero, PreviewCard panel, PosterCard grid overlay) — all three buttons, everywhere.

## 6. Data flow
`+` click → `useToggleWatchlist()(item)` → `onMutate` optimistically appends/removes the item in the `['watchlist']` cache → the `+`→`✓` flips on every card and the "Saved for later" row adds/removes instantly → SDK create/add/remove → `onError` rolls back → `onSettled` invalidates `['watchlist']`, refetch reconciles the new `playlistId` (first create) and real `PlaylistItemId`s (needed for the next removal). Favorites is unchanged (existing optimistic `IsFavorite`); only the row title/position and the icon change.

## 7. Error handling
- Toggle failure → rollback (the `+`/`✓` and the row visibly revert); no crash.
- **First-add race:** before the settle-refetch returns, a freshly created playlist's items have no real `PlaylistItemId` in the optimistic cache. If a **remove** finds `entryById.get(id)` missing (only possible in that brief post-create window), the mutation first `await`s a refetch of `['watchlist', userId]` to obtain the real `PlaylistItemId`, then calls `removeItemFromPlaylist`; if still absent afterward, it no-ops rather than issue a bad `removeItemFromPlaylist([])`. This prevents both server/UI drift and an empty-entryIds call.
- Empty/absent playlist → `useWatchlist` returns empty; the Row renders nothing (consistent with other rows).
- `useWatchlist` fires on any page showing `ItemActions` (one shared, cached query) — acceptable; it loads once per session.

## 8. Testing
- **Unit (`watchlist.ts`)**: `indexWatchlist` builds the membership set and `Id→PlaylistItemId` map, skipping id-less items; `addItemToList`/`removeItemFromList` are immutable and idempotent (no dup on re-add, no-op remove when absent).
- **Hook (`useWatchlist`)**: no playlist → `{ playlistId: null, items: [] }`, `membership` empty; with a playlist → items loaded, `membership` and `entryById` derived.
- **Hook (`useToggleWatchlist`)**: not-member + no playlist → calls `createPlaylist` (not add); not-member + existing playlist → calls `addItemToPlaylist`; member → calls `removeItemFromPlaylist` with the item's `PlaylistItemId`; optimistic cache flips then rolls back on error.
- **Component (`ItemActions`)**: renders three buttons; save-for-later shows `+` vs `✓` from membership and calls the toggle + `stopPropagation`; favorite shows heart states; watched unchanged. (Mock `useWatchlist`/toggles.)
- **E2E (Playwright, live)**: open a title → click `+` → `+`→`✓` and it appears in the "Saved for later" row (created on first use); reload → persists; click `✓` → removed; favorite (heart) fills and the title appears in the bottom "Favorites" row; watched still works. Verify the Home row order (Saved for later after Next Up, Favorites last).

## 9. Milestones (for the plan)
1. `watchlist.ts` (pure: `PLAYLIST_NAME`, `indexWatchlist`, list patchers) + tests.
2. `useWatchlist.ts` (find + list, membership/entryById) + tests.
3. `useToggleWatchlist.ts` (optimistic create/add/remove) + tests.
4. `ItemActions.tsx` three-button redesign (save-for-later + heart favorite + watched) + tests.
5. `Home.tsx` reorder + "Saved for later" row + rename/move "Favorites"; live E2E.

## 10. Open items / dependencies
- Confirm `createPlaylist`/`addItemToPlaylist`/`removeItemFromPlaylist`/`getPlaylistItems` request-object field names against the installed SDK at implementation (verified: `entryIds` for remove, `ids` for add/create, `PlaylistItemId` on listed items).
- No new dependencies (`lucide-react` already provides `Heart`).
