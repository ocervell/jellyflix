import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('@jellyfin/sdk/lib/utils/api/image-api', () => ({
  getImageApi: () => ({
    getItemImageUrlById: (id: string, type: string, opts: { tag?: string; fillWidth?: number }) =>
      `/jf/Items/${id}/Images/${type}?tag=${opts.tag}&fillWidth=${opts.fillWidth}`,
  }),
}));

import { getCardImageUrl, getBackdropUrl } from './images';

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
