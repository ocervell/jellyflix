import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { PLAYLIST_NAME, indexWatchlist, addItemToList, removeItemFromList } from '../../lib/jellyfin/watchlist';
import type { WatchlistData } from './useWatchlist';

const EMPTY: WatchlistData = { playlistId: null, items: [] };

export function useToggleWatchlist(): (item: BaseItemDto) => void {
  const { api, session } = useApi();
  const qc = useQueryClient();
  const key = ['watchlist', session.userId];
  const m = useMutation({
    // Serialize all watchlist writes for this user across every ItemActions instance,
    // so a queued click derives its decision from the previous one's settled result.
    scope: { id: `watchlist:${session.userId}` },
    mutationFn: async (item: BaseItemDto) => {
      const id = item.Id ?? '';
      const pls = getPlaylistsApi(api);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WatchlistData>(key) ?? EMPTY;      // execution-time, pre-optimistic
      const wasMember = indexWatchlist(prev.items).ids.has(id);
      // optimistic patch
      const items = wasMember ? removeItemFromList(prev.items, id) : addItemToList(prev.items, item);
      qc.setQueryData<WatchlistData>(key, { ...prev, items });
      try {
        if (!wasMember) {
          if (prev.playlistId) {
            await pls.addItemToPlaylist({ playlistId: prev.playlistId, ids: [id], userId: session.userId });
          } else {
            const res = await pls.createPlaylist({ createPlaylistDto: { Name: PLAYLIST_NAME, Ids: [id], UserId: session.userId } });
            const newId = res.data.Id ?? null;
            qc.setQueryData<WatchlistData>(key, (c) => ({ ...(c ?? EMPTY), playlistId: newId }));
          }
        } else if (prev.playlistId) {
          const nextIds = prev.items.map((i) => i.Id).filter((x): x is string => !!x).filter((x) => x !== id);
          await pls.updatePlaylist({ playlistId: prev.playlistId, updatePlaylistDto: { Ids: nextIds } });
        }
      } catch (e) {
        qc.setQueryData(key, prev);   // rollback
        throw e;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  return (item) => m.mutate(item);
}
