import { useQuery } from '@tanstack/react-query';
import { getUserViewsApi } from '@jellyfin/sdk/lib/utils/api/user-views-api';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useUserViews() {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.userViews(session.userId),
    queryFn: async ({ signal }) => {
      const { data } = await getUserViewsApi(api).getUserViews({ userId: session.userId }, { signal });
      return data.Items ?? [];
    },
  });
}
