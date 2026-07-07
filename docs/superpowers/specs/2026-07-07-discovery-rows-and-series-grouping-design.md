# Discovery Rows & Series Grouping — Design

**Date:** 2026-07-07
**Status:** Approved, ready for implementation plan

## Goal

Add two discovery rows to the home page — **"Hot right now"** (new, high-rated releases) and **"Recently added"** — and collapse per-episode entries into a single series card across the pinned/discovery rows so that saving or liking a whole season no longer spams a row with individual episodes.

## Background

The home page (`src/routes/Home.tsx`) renders a stack of `<Row title items … />` sections. Each row is fed by a react-query hook that wraps a Jellyfin API call. `Row` self-hides when its item list is empty (`Row.tsx:11`), so rows need no loading/empty special-casing beyond an optional skeleton.

Two rendering helpers already do most of the work for series-vs-episode display:

- `getCardImageUrl` (`src/lib/jellyfin/images.ts`) falls back to `SeriesId` + `SeriesPrimaryImageTag` / `SeriesThumbImageTag` when an item is an episode.
- `cardTitle` (`src/lib/format.ts`) renders a `Series` item as `{ title: Name, subtitle: null }`.

So a synthesized `Series` card built from an episode's `Series*` fields renders correctly with no changes to the card components.

`CommunityRating` (0–10) is the field Jellyfin populates from the IMDb/TMDb community score — this is the "IMDB > 7/10" filter. Jellyfin's `getItems` accepts `minCommunityRating` and `maxPremiereDate` parameters.

## Scope decisions (locked)

- **"New release" definition:** newest-first, no recency window. Sort the whole library by `PremiereDate` descending, filter to rating > 7, take the top ~20. `maxPremiereDate: now` guards against an unreleased, future-dated title jumping to the top.
- **Grouped-card actions:** act on the **whole group**. Clicking remove un-favorites / un-saves every episode collapsed into the card, so the card drops out of the row.

## Components

### 1. `src/lib/rowGrouping.ts` (new)

Pure module — no React, no API. Unit-tested in isolation.

```ts
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

/** A card that may stand in for several collapsed episodes of one series. */
export type GroupedItem = BaseItemDto & { groupMembers?: BaseItemDto[] };

/**
 * Collapse episodes sharing a SeriesId into a single synthesized Series card.
 * Movies and series pass through untouched. First-seen order is preserved:
 * a series appears at the position of its first member in the input.
 */
export function groupEpisodesBySeries(items: BaseItemDto[]): GroupedItem[];

/** Read the collapsed episodes off a card, if it is a group. */
export function getGroupMembers(item: BaseItemDto): BaseItemDto[] | undefined;
```

**`groupEpisodesBySeries` behavior:**

- Non-episode items (`item.Type !== 'Episode'`) are appended unchanged.
- Episodes are keyed by `SeriesId`. The first episode of a given `SeriesId` produces a synthesized card and reserves the slot; later episodes of the same series are appended to that card's `groupMembers` and do **not** produce their own card.
- An episode with no `SeriesId` (should not happen, defensive) passes through unchanged.
- If a real `Series` item and episodes of that same series both appear in the input, they are **not** merged — the real series keeps its own card and the episodes collapse into a separate synthesized card. (This does not occur in practice for the rows we apply grouping to; documented so the helper's contract is unambiguous.)

**Synthesized card shape (from the first episode `ep`):**

```ts
{
  Id: ep.SeriesId,
  Name: ep.SeriesName,
  Type: 'Series',
  ImageTags: {
    ...(ep.SeriesPrimaryImageTag ? { Primary: ep.SeriesPrimaryImageTag } : {}),
    ...(ep.SeriesThumbImageTag ? { Thumb: ep.SeriesThumbImageTag } : {}),
  },
  SeriesId: ep.SeriesId,
  SeriesPrimaryImageTag: ep.SeriesPrimaryImageTag,
  SeriesThumbImageTag: ep.SeriesThumbImageTag,
  groupMembers: [ep, …],
}
```

`getGroupMembers` reads `(item as GroupedItem).groupMembers`. This keeps the rest of the app typed against plain `BaseItemDto`; only the grouping helper and `ItemActions` know about the extra field.

### 2. `src/hooks/api/useHotNow.ts` (new)

```ts
export function useHotNow() // → useQuery, returns BaseItemDto[]
```

One `getItemsApi(api).getItems` call:

| Param | Value |
|---|---|
| `userId` | session user |
| `recursive` | `true` (no `parentId` → all libraries) |
| `includeItemTypes` | `[Movie, Series]` |
| `sortBy` | `[ItemSortBy.PremiereDate]` |
| `sortOrder` | `[SortOrder.Descending]` |
| `minCommunityRating` | `7` |
| `maxPremiereDate` | now, as ISO string, computed **once at module load** (stable query key, no per-render refetch) |
| `limit` | `20` |
| `fields` | `[ItemFields.PrimaryImageAspectRatio]` |
| `enableImageTypes` | `[ImageType.Primary, ImageType.Thumb]` |

Query key: `qk.hotNow(userId)`. No grouping applied (no episodes in the result).

### 3. `src/hooks/api/useRecentlyAdded.ts` (new)

```ts
export function useRecentlyAdded() // → useQuery, returns GroupedItem[]
```

One `getItems` call, then grouped and sliced:

| Param | Value |
|---|---|
| `userId` | session user |
| `recursive` | `true` (no `parentId`) |
| `includeItemTypes` | `[Movie, Series, Episode]` |
| `sortBy` | `[ItemSortBy.DateCreated]` |
| `sortOrder` | `[SortOrder.Descending]` |
| `limit` | `60` (over-fetch; grouping collapses episodes) |
| `fields` | `[ItemFields.PrimaryImageAspectRatio]` |
| `enableImageTypes` | `[ImageType.Primary, ImageType.Thumb]` |

`queryFn` returns `groupEpisodesBySeries(data.Items ?? []).slice(0, 20)`. Query key: `qk.recentlyAdded(userId)`.

### 4. `src/hooks/api/queryKeys.ts` (modify)

Add:

```ts
hotNow: (userId: string) => ['hotNow', userId] as const,
recentlyAdded: (userId: string) => ['recentlyAdded', userId] as const,
```

### 5. `src/hooks/api/useFavorites.ts` (modify)

- Add `BaseItemKind.Episode` to `includeItemTypes` (today favorited episodes are silently dropped).
- Return `groupEpisodesBySeries(data.Items ?? [])`.
- Keep `sortBy: [SortName]`, `limit: 50`.

### 6. `src/hooks/api/useWatchlist.ts` (modify)

- After fetching playlist items, group them: the returned `items` become `groupEpisodesBySeries(res.data.Items ?? [])`.
- `indexWatchlist` must continue to run over the **raw, ungrouped** playlist items so membership (`ids`, `entryById`) still maps real media ids → `PlaylistItemId` for removal. That is, group for display only; index for membership off the raw list. The hook returns both: grouped `items` for rendering, raw-derived `membership`/`entryById` unchanged.

### 7. `src/components/common/ItemActions.tsx` (modify)

Detect a grouped card via `getGroupMembers(item)`.

- **Non-grouped (members `undefined`):** current behavior, unchanged.
- **Grouped:** derive state from members and fan the existing single-item toggles over only the members whose state does not already match the target:

  ```ts
  const members = getGroupMembers(item);
  // display state
  const fav     = members.some((m) => !!m.UserData?.IsFavorite);
  const saved   = members.some((m) => membership.has(m.Id ?? ''));
  const played  = members.every((m) => !!m.UserData?.Played);
  // toggles: target is the negation of the derived state
  const onFav = () => {
    const target = !fav;
    members.filter((m) => Boolean(m.UserData?.IsFavorite) !== target).forEach(toggleFavorite);
  };
  const onSave = () => {
    const target = !saved;
    members.filter((m) => membership.has(m.Id ?? '') !== target).forEach(toggleWatchlist);
  };
  const onWatched = () => {
    const target = !played;
    members.filter((m) => Boolean(m.UserData?.Played) !== target).forEach(toggleWatched);
  };
  ```

  Each `toggleX` reads the member's own `UserData` / cache state and flips it, so calling it only on mismatched members drives every member to `target`. The existing optimistic cache updates and `onSettled` invalidations fire per member; the Favorites / watchlist queries then refetch and the collapsed card leaves the row.

### 8. `src/routes/Home.tsx` (modify)

Add the two hooks and render the two rows. Placement:

```
Continue Watching
Next Up
Hot right now          ← new
Recently added         ← new
Saved for later
Latest <library>…
Favorites
```

```tsx
const hotQ = useHotNow();
const recentQ = useRecentlyAdded();
// …
{hotQ.isLoading ? <RowSkeleton title="Hot right now" /> : <Row title="Hot right now" items={hotQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
{recentQ.isLoading ? <RowSkeleton title="Recently added" /> : <Row title="Recently added" items={recentQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
```

## Data flow

```
getItems (Jellyfin)
  → hook queryFn
      → [Recently added / Favorites / Watchlist] groupEpisodesBySeries(items)
      → [Hot right now] items as-is
  → Row → PreviewCard
      → getCardImageUrl / cardTitle  (series poster + name for grouped cards)
      → ItemActions
          → getGroupMembers(item)
              → grouped: derive state + fan toggles over members
              → plain:   toggle the single item (unchanged)
```

## Error handling

- Hooks reuse react-query defaults already in use across the codebase; a failed query yields `data === undefined`, the row falls back to `[]`, and `Row` self-hides. No new error surfaces.
- `groupEpisodesBySeries` is total: any input array produces an output array; episodes missing `SeriesId` pass through rather than throwing.
- Fanned toggles reuse the existing per-item mutations, including their optimistic rollback on error. A partial failure (one member's toggle fails) rolls back only that member, consistent with today's single-card behavior.

## Testing

- **`rowGrouping.test.ts`** — movies/series pass through; N episodes of one series collapse to one card carrying all N as `groupMembers`; episodes of different series stay separate; first-seen order preserved; synthesized card has `Id === SeriesId`, `Type === 'Series'`, `Name === SeriesName`, and series image tags; `getGroupMembers` returns the members for a grouped card and `undefined` for a plain item.
- **`useHotNow.test.tsx`** — asserts the `getItems` request carries `minCommunityRating: 7`, `sortBy: [PremiereDate]`, `sortOrder: [Descending]`, `includeItemTypes` = Movie + Series, and a `maxPremiereDate` string.
- **`useRecentlyAdded.test.tsx`** — asserts `sortBy: [DateCreated]` descending, `includeItemTypes` includes Episode, and that the returned list is grouped (episodes of one series collapse to a single card).
- **`ItemActions` grouped tests** — a grouped card whose members are all favorited shows the heart as active and, on click, calls `toggleFavorite` once per member (removing all); a grouped card in Recently added whose members are not favorited shows the heart inactive and, on click, favorites every member. Plain-card behavior is unchanged (regression guard).

## Out of scope (YAGNI)

- No recency window, no critic-rating variant, no per-row config toggle.
- No grouping on Continue Watching / Next Up / Latest (those legitimately show episodes).
- No merging of a real series card with episode groups of the same series (does not arise in the rows we touch).
