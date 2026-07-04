import { useQuery } from '@tanstack/react-query';
import { getTvShowsApi } from '@jellyfin/sdk/lib/utils/api/tv-shows-api';
import { ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useNextUp() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.nextUp(session.userId),
    queryFn: async ({ signal }) => {
      const { data } = await getTvShowsApi(api).getNextUp(
        { userId: session.userId, limit: 20, fields: [ItemFields.PrimaryImageAspectRatio], enableImageTypes: [ImageType.Primary, ImageType.Thumb, ImageType.Backdrop] },
        { signal },
      );
      return data.Items ?? [];
    },
  });
}
