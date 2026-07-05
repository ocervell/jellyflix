import { expect, test } from 'vitest';
import { parseSearchParams, toSearchParams, asLibraryQuery, toSearchItemsArgs } from './query';

test('parseSearchParams reads q plus sort/order/status with fallback', () => {
  expect(parseSearchParams(new URLSearchParams('q=matrix&sort=year&order=desc&status=unplayed')))
    .toEqual({ q: 'matrix', sort: 'year', order: 'desc', status: 'unplayed' });
  expect(parseSearchParams(new URLSearchParams('')))
    .toEqual({ q: '', sort: 'name', order: 'asc', status: 'all' });
});

test('toSearchParams omits defaults and empty q, round-trips', () => {
  expect(toSearchParams({ q: '', sort: 'name', order: 'asc', status: 'all' }).toString()).toBe('');
  const q = { q: 'matrix', sort: 'year' as const, order: 'desc' as const, status: 'played' as const };
  expect(parseSearchParams(toSearchParams(q))).toEqual(q);
});

test('asLibraryQuery keeps sort/status, empties facets', () => {
  expect(asLibraryQuery({ q: 'x', sort: 'rating', order: 'desc', status: 'favorites' }))
    .toEqual({ sort: 'rating', order: 'desc', genres: [], decades: [], status: 'favorites' });
});

test('toSearchItemsArgs searches globally over Movie+Series with searchTerm and no parentId', () => {
  const args = toSearchItemsArgs(
    { q: 'matrix', sort: 'year', order: 'desc', status: 'unplayed' },
    { userId: 'U', startIndex: 60, limit: 60 },
  );
  expect(args).toMatchObject({
    userId: 'U', recursive: true, includeItemTypes: ['Movie', 'Series'],
    searchTerm: 'matrix', sortBy: ['PremiereDate'], sortOrder: ['Descending'],
    filters: ['IsUnplayed'], startIndex: 60, limit: 60, enableTotalRecordCount: true,
  });
  expect('parentId' in args).toBe(false);
});
