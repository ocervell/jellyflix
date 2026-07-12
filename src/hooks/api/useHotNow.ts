import { useQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { BaseItemKind, ItemSortBy, SortOrder, ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

// Computed once at module load so the query key stays stable (no per-render refetch).
// Guards against an unreleased, future-dated title jumping to the top of the row.
const MAX_PREMIERE_DATE = new Date().toISOString();

export function useHotNow() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.hotNow(session.userId),
    queryFn: async ({ signal }) => {
      const { data } = await getItemsApi(api).getItems({
        userId: session.userId,
        recursive: true,
        includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
        sortBy: [ItemSortBy.PremiereDate],
        sortOrder: [SortOrder.Descending],
        minCommunityRating: 7,
        isPlayed: false, // "Hot right now" is for discovery — hide already-watched titles
        maxPremiereDate: MAX_PREMIERE_DATE,
        limit: 20,
        fields: [ItemFields.PrimaryImageAspectRatio],
        enableImageTypes: [ImageType.Primary, ImageType.Thumb],
      }, { signal });
      return data.Items ?? [];
    },
  });
}
