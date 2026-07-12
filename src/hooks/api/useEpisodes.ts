import { useQuery } from '@tanstack/react-query';
import { getTvShowsApi } from '@jellyfin/sdk/lib/utils/api/tv-shows-api';
import { ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useEpisodes(seriesId?: string, seasonId?: string) {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.episodes(seriesId ?? '', seasonId ?? ''),
    enabled: !!seriesId && !!seasonId,
    queryFn: async ({ signal }) => {
      const { data } = await getTvShowsApi(api).getEpisodes(
        { seriesId: seriesId!, userId: session.userId, seasonId, fields: [ItemFields.Overview], enableImageTypes: [ImageType.Primary], enableUserData: true },
        { signal },
      );
      return data.Items ?? [];
    },
  });
}
