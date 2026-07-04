import { useQuery } from '@tanstack/react-query';
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api';
import { ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { qk } from './queryKeys';

export function useLatestMedia(parentId: string) {
  const { api, session } = useApi();
  return useQuery({
    queryKey: qk.latest(session.userId, parentId),
    enabled: !!parentId,
    queryFn: async ({ signal }) => {
      const { data } = await getUserLibraryApi(api).getLatestMedia(
        { userId: session.userId, parentId, limit: 20, fields: [ItemFields.PrimaryImageAspectRatio, ItemFields.Overview], enableImageTypes: [ImageType.Primary, ImageType.Thumb, ImageType.Backdrop, ImageType.Logo] },
        { signal },
      );
      return data ?? [];
    },
  });
}
