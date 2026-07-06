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
