import { useQuery } from '@tanstack/react-query';
import { getTvShowsApi } from '@jellyfin/sdk/lib/utils/api/tv-shows-api';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useSeasons(seriesId: string | undefined) {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.seasons(seriesId ?? ''),
    enabled: !!seriesId,
    queryFn: async ({ signal }) => {
      const { data } = await getTvShowsApi(api).getSeasons({ seriesId: seriesId!, userId: session.userId }, { signal });
      return data.Items ?? [];
    },
  });
}
