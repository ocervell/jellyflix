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
