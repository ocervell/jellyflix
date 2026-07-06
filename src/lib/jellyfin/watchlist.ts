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
