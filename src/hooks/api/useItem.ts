import { useQuery } from '@tanstack/react-query';
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useItem(itemId: string | undefined) {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.item(session.userId, itemId ?? ''),
    enabled: !!itemId,
    queryFn: async ({ signal }) => {
      const { data } = await getUserLibraryApi(api).getItem({ userId: session.userId, itemId: itemId! }, { signal });
      return data;
    },
  });
}
