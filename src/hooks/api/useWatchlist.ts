import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';
import { BaseItemKind, ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { PLAYLIST_NAME, indexWatchlist } from '../../lib/jellyfin/watchlist';
import { groupEpisodesBySeries } from '../../lib/rowGrouping';
import type { GroupedItem } from '../../lib/rowGrouping';

export type WatchlistData = { playlistId: string | null; items: BaseItemDto[] };

export function useWatchlist() {
  const { api, session } = useApi();
  const q = useQuery<WatchlistData>({
    queryKey: ['watchlist', session.userId],
    queryFn: async ({ signal }) => {
      const found = await getItemsApi(api).getItems(
        { userId: session.userId, includeItemTypes: [BaseItemKind.Playlist], recursive: true },
        { signal },
      );
      const pl = (found.data.Items ?? []).find((p) => p.Name === PLAYLIST_NAME);
      if (!pl?.Id) return { playlistId: null, items: [] };
      const res = await getPlaylistsApi(api).getPlaylistItems(
        {
          playlistId: pl.Id, userId: session.userId,
          fields: [ItemFields.PrimaryImageAspectRatio],
          enableImageTypes: [ImageType.Primary, ImageType.Thumb],
        },
        { signal },
      );
      return { playlistId: pl.Id, items: res.data.Items ?? [] };
    },
  });
  const rawItems = q.data?.items ?? [];
  const { ids, entryById } = useMemo(() => indexWatchlist(rawItems), [rawItems]);
  const items = useMemo(() => groupEpisodesBySeries(rawItems), [rawItems]);
  return { playlistId: q.data?.playlistId ?? null, items, membership: ids, entryById, isLoading: q.isLoading };
}
