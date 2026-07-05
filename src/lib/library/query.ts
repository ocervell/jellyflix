import type { ItemsApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client';
import {
  ItemSortBy, SortOrder, ItemFilter, BaseItemKind, ItemFields, ImageType,
} from '@jellyfin/sdk/lib/generated-client';

export type SortField = 'name' | 'dateAdded' | 'year' | 'rating' | 'random';
export type WatchedStatus = 'all' | 'unplayed' | 'played' | 'favorites';
export type LibraryQuery = {
  sort: SortField; order: 'asc' | 'desc'; genres: string[]; decades: number[]; status: WatchedStatus;
};

export const DEFAULT_QUERY: LibraryQuery = { sort: 'name', order: 'asc', genres: [], decades: [], status: 'all' };

const SORT_FIELDS: SortField[] = ['name', 'dateAdded', 'year', 'rating', 'random'];
const STATUSES: WatchedStatus[] = ['all', 'unplayed', 'played', 'favorites'];

const SORT_MAP: Record<SortField, ItemSortBy> = {
  name: ItemSortBy.SortName,
  dateAdded: ItemSortBy.DateCreated,
  year: ItemSortBy.PremiereDate,
  rating: ItemSortBy.CommunityRating,
  random: ItemSortBy.Random,
};

function parseList(v: string | null): string[] {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export function parseParams(sp: URLSearchParams): LibraryQuery {
  const sortRaw = sp.get('sort');
  const sort: SortField = SORT_FIELDS.includes(sortRaw as SortField) ? (sortRaw as SortField) : DEFAULT_QUERY.sort;
  const order = sp.get('order') === 'desc' ? 'desc' : 'asc';
  const statusRaw = sp.get('status');
  const status: WatchedStatus = STATUSES.includes(statusRaw as WatchedStatus) ? (statusRaw as WatchedStatus) : DEFAULT_QUERY.status;
  const decades = parseList(sp.get('decades')).map(Number).filter((n) => Number.isInteger(n));
  return { sort, order, genres: parseList(sp.get('genres')), decades, status };
}

export function toParams(q: LibraryQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.sort !== DEFAULT_QUERY.sort) sp.set('sort', q.sort);
  if (q.order !== DEFAULT_QUERY.order) sp.set('order', q.order);
  if (q.genres.length) sp.set('genres', q.genres.join(','));
  if (q.decades.length) sp.set('decades', q.decades.join(','));
  if (q.status !== DEFAULT_QUERY.status) sp.set('status', q.status);
  return sp;
}

export type ItemsArgsCtx = { viewId: string; userId: string; includeItemTypes: string[]; startIndex: number; limit: number };

export function toGetItemsArgs(q: LibraryQuery, ctx: ItemsArgsCtx): ItemsApiGetItemsRequest {
  const years = q.decades.flatMap((d) => Array.from({ length: 10 }, (_, i) => d + i));
  const filters: ItemFilter[] = q.status === 'unplayed' ? [ItemFilter.IsUnplayed]
    : q.status === 'played' ? [ItemFilter.IsPlayed] : [];
  return {
    userId: ctx.userId,
    parentId: ctx.viewId,
    recursive: true,
    includeItemTypes: ctx.includeItemTypes as BaseItemKind[],
    sortBy: [SORT_MAP[q.sort]],
    sortOrder: [q.order === 'desc' ? SortOrder.Descending : SortOrder.Ascending],
    ...(q.genres.length ? { genres: q.genres } : {}),
    ...(years.length ? { years } : {}),
    ...(filters.length ? { filters } : {}),
    ...(q.status === 'favorites' ? { isFavorite: true } : {}),
    startIndex: ctx.startIndex,
    limit: ctx.limit,
    fields: [ItemFields.PrimaryImageAspectRatio],
    enableImageTypes: [ImageType.Primary, ImageType.Thumb],
    enableTotalRecordCount: true,
  };
}
