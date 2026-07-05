import type { ItemsApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind, ItemFields, ImageType } from '@jellyfin/sdk/lib/generated-client';
import {
  parseParams, toParams, sortStatusArgs,
  type LibraryQuery, type SortField, type WatchedStatus,
} from '../library/query';

export type SearchQuery = { q: string; sort: SortField; order: 'asc' | 'desc'; status: WatchedStatus };

export function parseSearchParams(sp: URLSearchParams): SearchQuery {
  const { sort, order, status } = parseParams(sp);
  return { q: sp.get('q') ?? '', sort, order, status };
}

export function toSearchParams(q: SearchQuery): URLSearchParams {
  const sp = toParams({ sort: q.sort, order: q.order, genres: [], decades: [], status: q.status });
  if (q.q.trim()) sp.set('q', q.q);
  return sp;
}

export function asLibraryQuery(q: SearchQuery): LibraryQuery {
  return { sort: q.sort, order: q.order, genres: [], decades: [], status: q.status };
}

export function toSearchItemsArgs(
  q: SearchQuery,
  ctx: { userId: string; startIndex: number; limit: number },
): ItemsApiGetItemsRequest {
  return {
    userId: ctx.userId,
    recursive: true,
    includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
    searchTerm: q.q,
    ...sortStatusArgs(q),
    startIndex: ctx.startIndex,
    limit: ctx.limit,
    fields: [ItemFields.PrimaryImageAspectRatio],
    enableImageTypes: [ImageType.Primary, ImageType.Thumb],
    enableTotalRecordCount: true,
  };
}
