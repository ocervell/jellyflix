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
  createPlaylist.mockReset().mockResolvedValue({ data: { Id: 'NEW' } });
  addItemToPlaylist.mockReset().mockResolvedValue({ data: undefined });
  removeItemFromPlaylist.mockReset().mockResolvedValue({ data: undefined });
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
