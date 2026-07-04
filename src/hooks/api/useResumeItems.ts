import { useQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { ItemFields, MediaType, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useResumeItems() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.resume(session.userId),
    queryFn: async ({ signal }) => {
      const { data } = await getItemsApi(api).getResumeItems(
        {
          userId: session.userId,
          limit: 20,
          mediaTypes: [MediaType.Video],
          fields: [ItemFields.PrimaryImageAspectRatio],
          enableImageTypes: [ImageType.Primary, ImageType.Thumb, ImageType.Backdrop],
        },
        { signal },
      );
      return data.Items ?? [];
    },
  });
}
