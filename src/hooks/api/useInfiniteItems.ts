import { useInfiniteQuery } from '@tanstack/react-query';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import type { BaseItemDto, ItemsApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';

export const ITEMS_PAGE_SIZE = 60;

export function useInfiniteItems(opts: {
  queryKey: unknown[];
  enabled: boolean;
  argsFor: (startIndex: number) => ItemsApiGetItemsRequest;
}) {
  const { api } = useApi();
  const q = useInfiniteQuery({
    queryKey: opts.queryKey,
    enabled: opts.enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await getItemsApi(api).getItems(opts.argsFor(pageParam), { signal });
      return data;
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + (p.Items?.length ?? 0), 0);
      return loaded < (lastPage.TotalRecordCount ?? 0) ? allPages.length * ITEMS_PAGE_SIZE : undefined;
    },
  });
  const seen = new Set<string>();
  const items: BaseItemDto[] = (q.data?.pages ?? [])
    .flatMap((p) => p.Items ?? [])
    .filter((it) => {
      const id = it.Id ?? '';
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const total = q.data?.pages[0]?.TotalRecordCount ?? 0;
  return {
    items, total,
    fetchNextPage: () => { void q.fetchNextPage(); },
    hasNextPage: !!q.hasNextPage,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
