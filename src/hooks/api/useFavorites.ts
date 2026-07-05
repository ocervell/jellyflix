import { useQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { BaseItemKind, ItemFields, ItemSortBy, SortOrder, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';

export function useFavorites() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: ['favorites', session.userId],
    queryFn: async ({ signal }) => {
      const { data } = await getItemsApi(api).getItems({
        userId: session.userId,
        isFavorite: true,
        recursive: true,
        includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
        sortBy: [ItemSortBy.SortName],
        sortOrder: [SortOrder.Ascending],
        fields: [ItemFields.PrimaryImageAspectRatio],
        enableImageTypes: [ImageType.Primary, ImageType.Thumb],
        limit: 50,
      }, { signal });
      return data.Items ?? [];
    },
  });
}
