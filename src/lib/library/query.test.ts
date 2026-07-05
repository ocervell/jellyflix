import { expect, test } from 'vitest';
import { parseParams, toParams, toGetItemsArgs, sortStatusArgs, DEFAULT_QUERY } from './query';

test('sortStatusArgs maps sort/order and status', () => {
  expect(sortStatusArgs({ sort: 'year', order: 'desc', status: 'unplayed' }))
    .toEqual({ sortBy: ['PremiereDate'], sortOrder: ['Descending'], filters: ['IsUnplayed'] });
  expect(sortStatusArgs({ sort: 'name', order: 'asc', status: 'played' }))
    .toEqual({ sortBy: ['SortName'], sortOrder: ['Ascending'], filters: ['IsPlayed'] });
  expect(sortStatusArgs({ sort: 'name', order: 'asc', status: 'favorites' }))
    .toEqual({ sortBy: ['SortName'], sortOrder: ['Ascending'], isFavorite: true });
  expect(sortStatusArgs({ sort: 'name', order: 'asc', status: 'all' }))
    .toEqual({ sortBy: ['SortName'], sortOrder: ['Ascending'] });
});

test('parseParams falls back to defaults for empty/invalid', () => {
  expect(parseParams(new URLSearchParams(''))).toEqual(DEFAULT_QUERY);
  expect(parseParams(new URLSearchParams('sort=bogus&order=sideways&status=nope')))
    .toEqual(DEFAULT_QUERY);
});

test('parseParams reads all fields', () => {
  const q = parseParams(new URLSearchParams('sort=year&order=desc&genres=Action,Drame&decades=2010,2000&status=unplayed'));
  expect(q).toEqual({ sort: 'year', order: 'desc', genres: ['Action', 'Drame'], decades: [2010, 2000], status: 'unplayed' });
});

test('toParams omits defaults and round-trips', () => {
  expect(toParams(DEFAULT_QUERY).toString()).toBe('');
  const q = { sort: 'rating' as const, order: 'desc' as const, genres: ['Action'], decades: [2010], status: 'favorites' as const };
  expect(parseParams(toParams(q))).toEqual(q);
});

test('toGetItemsArgs maps sort, decades->years, status->filters, pagination', () => {
  const q = { sort: 'year' as const, order: 'desc' as const, genres: ['Action'], decades: [2010], status: 'unplayed' as const };
  const args = toGetItemsArgs(q, { viewId: 'V', userId: 'U', includeItemTypes: ['Movie'], startIndex: 60, limit: 60 });
  expect(args).toMatchObject({
    userId: 'U', parentId: 'V', recursive: true, includeItemTypes: ['Movie'],
    sortBy: ['PremiereDate'], sortOrder: ['Descending'], genres: ['Action'],
    years: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019],
    filters: ['IsUnplayed'], startIndex: 60, limit: 60, enableTotalRecordCount: true,
  });
});

test('toGetItemsArgs favorites uses isFavorite, random sort ignores order default', () => {
  const fav = toGetItemsArgs({ ...DEFAULT_QUERY, status: 'favorites' }, { viewId: 'V', userId: 'U', includeItemTypes: ['Series'], startIndex: 0, limit: 60 });
  expect(fav.isFavorite).toBe(true);
  expect(fav.filters ?? []).not.toContain('IsFavorite'); // uses isFavorite flag, not the filter
  const rnd = toGetItemsArgs({ ...DEFAULT_QUERY, sort: 'random' }, { viewId: 'V', userId: 'U', includeItemTypes: ['Movie'], startIndex: 0, limit: 60 });
  expect(rnd.sortBy).toEqual(['Random']);
});
