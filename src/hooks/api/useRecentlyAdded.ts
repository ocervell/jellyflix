import { useQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { BaseItemKind, ItemSortBy, SortOrder, ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';
import { groupEpisodesBySeries } from '../../lib/rowGrouping';

export function useRecentlyAdded() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.recentlyAdded(session.userId),
    queryFn: async ({ signal }) => {
      const { data } = await getItemsApi(api).getItems({
        userId: session.userId,
        recursive: true,
        includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series, BaseItemKind.Episode],
        sortBy: [ItemSortBy.DateCreated],
        sortOrder: [SortOrder.Descending],
        limit: 60, // over-fetch: grouping collapses episodes; slice to 20 after
        fields: [ItemFields.PrimaryImageAspectRatio],
        enableImageTypes: [ImageType.Primary, ImageType.Thumb],
      }, { signal });
      return groupEpisodesBySeries(data.Items ?? []).slice(0, 20);
    },
  });
}
