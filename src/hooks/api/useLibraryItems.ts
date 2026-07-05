import { useApi } from '../useApi';
import { useInfiniteItems, ITEMS_PAGE_SIZE } from './useInfiniteItems';
import { toGetItemsArgs, toParams, type LibraryQuery } from '../../lib/library/query';

export const LIBRARY_PAGE_SIZE = ITEMS_PAGE_SIZE;

export function useLibraryItems(query: LibraryQuery, view: { id: string; includeItemTypes: string[] }) {
  const { session } = useApi();
  return useInfiniteItems({
    queryKey: ['library', session.userId, view.id, view.includeItemTypes.join(','), toParams(query).toString()],
    enabled: !!view.id,
    argsFor: (startIndex) => toGetItemsArgs(query, {
      viewId: view.id, userId: session.userId, includeItemTypes: view.includeItemTypes,
      startIndex, limit: ITEMS_PAGE_SIZE,
    }),
  });
}
