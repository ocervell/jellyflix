import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { PLAYLIST_NAME, indexWatchlist, addItemToList, removeItemFromList } from '../../lib/jellyfin/watchlist';
import type { WatchlistData } from './useWatchlist';

type ToggleVars = { item: BaseItemDto; wasMember: boolean; playlistId: string | null; currentIds: string[] };

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
        else await pls.createPlaylist({ createPlaylistDto: { Name: PLAYLIST_NAME, Ids: [id], UserId: session.userId } });
        return;
      }
      if (v.playlistId) {
        const nextIds = v.currentIds.filter((x) => x !== id);
        await pls.updatePlaylist({ playlistId: v.playlistId, updatePlaylistDto: { Ids: nextIds } });
      }
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
    const { ids } = indexWatchlist(current.items);
    const id = item.Id ?? '';
    const currentIds = current.items.map((i) => i.Id).filter((x): x is string => !!x);
    m.mutate({ item, wasMember: ids.has(id), playlistId: current.playlistId, currentIds });
  };
}
