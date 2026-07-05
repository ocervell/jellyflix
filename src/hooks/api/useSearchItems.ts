import { useApi } from '../useApi';
import { useInfiniteItems, ITEMS_PAGE_SIZE } from './useInfiniteItems';
import { toSearchItemsArgs, toSearchParams, type SearchQuery } from '../../lib/search/query';

export function useSearchItems(query: SearchQuery) {
  const { session } = useApi();
  return useInfiniteItems({
    queryKey: ['search', session.userId, toSearchParams(query).toString()],
    enabled: query.q.trim().length > 0,
    argsFor: (startIndex) => toSearchItemsArgs(query, { userId: session.userId, startIndex, limit: ITEMS_PAGE_SIZE }),
  });
}
