import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { PLAYLIST_NAME, indexWatchlist, addItemToList, removeItemFromList } from '../../lib/jellyfin/watchlist';
import type { WatchlistData } from './useWatchlist';

type ToggleVars = { item: BaseItemDto; wasMember: boolean; playlistId: string | null; entryId: string | undefined };

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
        else await pls.createPlaylist({ name: PLAYLIST_NAME, ids: [id], userId: session.userId });
        return;
      }
      let playlistId = v.playlistId;
      let entryId = v.entryId;
      if (!playlistId || !entryId) {
        // Rare first-add race: entry id not yet reconciled — refetch to obtain it.
        await qc.refetchQueries({ queryKey: key });
        const fresh = qc.getQueryData<WatchlistData>(key) ?? EMPTY;
        playlistId = fresh.playlistId;
        entryId = indexWatchlist(fresh.items).entryById.get(id);
      }
      if (playlistId && entryId) await pls.removeItemFromPlaylist({ playlistId, entryIds: [entryId] });
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
    const { ids, entryById } = indexWatchlist(current.items);
    const id = item.Id ?? '';
    m.mutate({ item, wasMember: ids.has(id), playlistId: current.playlistId, entryId: entryById.get(id) });
  };
}
