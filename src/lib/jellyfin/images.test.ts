import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('@jellyfin/sdk/lib/utils/api/image-api', () => ({
  getImageApi: () => ({
    getItemImageUrlById: (id: string, type: string, opts: { tag?: string; fillWidth?: number }) =>
      `/jf/Items/${id}/Images/${type}?tag=${opts.tag}&fillWidth=${opts.fillWidth}`,
  }),
}));

import { getCardImageUrl, getBackdropUrl, getLogoUrl, getPosterUrl } from './images';

const api = {} as never;

test('card prefers Thumb, falls back to Primary', () => {
  const withThumb = { Id: '1', ImageTags: { Thumb: 'tt', Primary: 'pp' } } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, withThumb, { width: 320 }))
    .toBe('/jf/Items/1/Images/Thumb?tag=tt&fillWidth=320');

  const primaryOnly = { Id: '2', ImageTags: { Primary: 'pp' } } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, primaryOnly, { width: 320 }))
    .toBe('/jf/Items/2/Images/Primary?tag=pp&fillWidth=320');
});

test('episode with only Primary and a series thumb falls back to Primary first', () => {
  const ep = { Id: '3', ImageTags: { Primary: 'ep' }, SeriesThumbImageTag: 'st', SeriesId: '9' } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, ep, { width: 320 })).toBe('/jf/Items/3/Images/Primary?tag=ep&fillWidth=320');
});

test('backdrop uses BackdropImageTags[0]', () => {
  const m = { Id: '4', BackdropImageTags: ['bd'] } as unknown as BaseItemDto;
  expect(getBackdropUrl(api, m, { width: 1280 })).toBe('/jf/Items/4/Images/Backdrop?tag=bd&fillWidth=1280');
});

test('returns null when no usable image', () => {
  const empty = { Id: '5', ImageTags: {} } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, empty)).toBeNull();
});

test('getCardImageUrl: ParentThumb fallback', () => {
  const item = {
    Id: '6',
    ImageTags: {},
    ParentThumbItemId: 'p1',
    ParentThumbImageTag: 'ptt',
  } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, item, { width: 320 }))
    .toBe('/jf/Items/p1/Images/Thumb?tag=ptt&fillWidth=320');
});

test('getCardImageUrl: Series ordering (SeriesThumb before SeriesPrimary)', () => {
  const item = {
    Id: '7',
    ImageTags: {},
    SeriesId: 's1',
    SeriesThumbImageTag: 'st',
    SeriesPrimaryImageTag: 'sp',
  } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, item, { width: 320 }))
    .toBe('/jf/Items/s1/Images/Thumb?tag=st&fillWidth=320');
});

test('getCardImageUrl: SeriesPrimary fallback', () => {
  const item = {
    Id: '8',
    ImageTags: {},
    SeriesId: 's2',
    SeriesPrimaryImageTag: 'sp',
  } as unknown as BaseItemDto;
  expect(getCardImageUrl(api, item, { width: 320 }))
    .toBe('/jf/Items/s2/Images/Primary?tag=sp&fillWidth=320');
});

test('getBackdropUrl: parent fallback', () => {
  const item = {
    Id: '9',
    BackdropImageTags: [],
    ParentBackdropItemId: 'pb1',
    ParentBackdropImageTags: ['pbd'],
  } as unknown as BaseItemDto;
  expect(getBackdropUrl(api, item, { width: 1280 }))
    .toBe('/jf/Items/pb1/Images/Backdrop?tag=pbd&fillWidth=1280');
});

test('getLogoUrl: item Logo', () => {
  const item = {
    Id: '10',
    ImageTags: { Logo: 'lg' },
  } as unknown as BaseItemDto;
  expect(getLogoUrl(api, item))
    .toBe('/jf/Items/10/Images/Logo?tag=lg&fillWidth=400');
});

test('getLogoUrl: parent Logo fallback', () => {
  const item = {
    Id: '11',
    ImageTags: {},
    ParentLogoItemId: 'pl1',
    ParentLogoImageTag: 'plt',
  } as unknown as BaseItemDto;
  expect(getLogoUrl(api, item))
    .toBe('/jf/Items/pl1/Images/Logo?tag=plt&fillWidth=400');
});

test('getLogoUrl: returns null when no logo', () => {
  const item = { Id: '12', ImageTags: {} } as unknown as BaseItemDto;
  expect(getLogoUrl(api, item)).toBeNull();
});

test('getPosterUrl: item Primary', () => {
  const item = {
    Id: '13',
    ImageTags: { Primary: 'pr' },
  } as unknown as BaseItemDto;
  expect(getPosterUrl(api, item, { width: 240 }))
    .toBe('/jf/Items/13/Images/Primary?tag=pr&fillWidth=240');
});

test('getPosterUrl: returns null when no Primary', () => {
  const item = { Id: '14', ImageTags: {} } as unknown as BaseItemDto;
  expect(getPosterUrl(api, item)).toBeNull();
});
