import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { groupEpisodesBySeries, getGroupMembers } from './rowGrouping';

const ep = (id: string, seriesId: string): BaseItemDto =>
  ({ Id: id, Type: 'Episode', SeriesId: seriesId, SeriesName: `Show ${seriesId}`,
     SeriesPrimaryImageTag: `p-${seriesId}`, SeriesThumbImageTag: `t-${seriesId}`,
     UserData: { IsFavorite: true } } as BaseItemDto);

test('movies and series pass through untouched', () => {
  const movie = { Id: 'm', Type: 'Movie', Name: 'Film' } as BaseItemDto;
  const series = { Id: 's', Type: 'Series', Name: 'Show' } as BaseItemDto;
  const out = groupEpisodesBySeries([movie, series]);
  expect(out).toEqual([movie, series]);
  expect(getGroupMembers(out[0])).toBeUndefined();
});

test('episodes of one series collapse into a single series card carrying all members', () => {
  const out = groupEpisodesBySeries([ep('e1', 'S'), ep('e2', 'S'), ep('e3', 'S')]);
  expect(out).toHaveLength(1);
  expect(out[0].Id).toBe('S');
  expect(out[0].Type).toBe('Series');
  expect(out[0].Name).toBe('Show S');
  expect(out[0].ImageTags).toEqual({ Primary: 'p-S', Thumb: 't-S' });
  expect(getGroupMembers(out[0])).toHaveLength(3);
});

test('episodes of different series stay separate, first-seen order preserved', () => {
  const movie = { Id: 'm', Type: 'Movie' } as BaseItemDto;
  const out = groupEpisodesBySeries([ep('a1', 'A'), movie, ep('b1', 'B'), ep('a2', 'A')]);
  expect(out.map((i) => i.Id)).toEqual(['A', 'm', 'B']);
  expect(getGroupMembers(out[0])).toHaveLength(2); // a1, a2
});

test('an episode without a SeriesId passes through unchanged', () => {
  const orphan = { Id: 'o', Type: 'Episode' } as BaseItemDto;
  const out = groupEpisodesBySeries([orphan]);
  expect(out).toEqual([orphan]);
});
