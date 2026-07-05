import { useInfiniteQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { toGetItemsArgs, toParams, type LibraryQuery } from '../../lib/library/query';

export const LIBRARY_PAGE_SIZE = 60;

export function useLibraryItems(query: LibraryQuery, view: { id: string; includeItemTypes: string[] }) {
  const { api, session } = useApi();
  const q = useInfiniteQuery({
    queryKey: ['library', session.userId, view.id, view.includeItemTypes.join(','), toParams(query).toString()],
    enabled: !!view.id,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const args = toGetItemsArgs(query, {
        viewId: view.id, userId: session.userId, includeItemTypes: view.includeItemTypes,
        startIndex: pageParam, limit: LIBRARY_PAGE_SIZE,
      });
      const { data } = await getItemsApi(api).getItems(args, { signal });
      return data;
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + (p.Items?.length ?? 0), 0);
      return loaded < (lastPage.TotalRecordCount ?? 0) ? allPages.length * LIBRARY_PAGE_SIZE : undefined;
    },
  });
  const items: BaseItemDto[] = (q.data?.pages ?? []).flatMap((p) => p.Items ?? []);
  const total = q.data?.pages[0]?.TotalRecordCount ?? 0;
  return {
    items, total,
    fetchNextPage: () => { void q.fetchNextPage(); },
    hasNextPage: !!q.hasNextPage,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
