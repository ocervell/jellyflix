import { beforeEach, expect, test, vi } from 'vitest';
import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';

const getNextUp = vi.fn();
const getSeasons = vi.fn();
const getEpisodes = vi.fn();
vi.mock('@jellyfin/sdk/lib/utils/api/tv-shows-api', () => ({
  getTvShowsApi: () => ({ getNextUp, getSeasons, getEpisodes }),
}));

import { resolveStreamUrl, resolvePlayableItem } from './playback';

beforeEach(() => {
  getNextUp.mockReset();
  getSeasons.mockReset();
  getEpisodes.mockReset();
});

const base = { url: '/jf', token: 'tok', deviceId: 'dev', itemId: 'itm' };

test('direct stream when SupportsDirectStream', () => {
  const ms = { Id: 'ms1', Container: 'mkv', SupportsDirectStream: true, SupportsDirectPlay: true } as MediaSourceInfo;
  const r = resolveStreamUrl(base.url, base.token, base.itemId, ms, base.deviceId);
  expect(r.isHls).toBe(false);
  expect(r.url).toBe('/jf/Videos/itm/stream.mkv?Static=true&mediaSourceId=ms1&deviceId=dev&api_key=tok');
});

test('hls transcode when TranscodingUrl present and hls subprotocol', () => {
  const ms = { Id: 'ms2', SupportsDirectStream: false, SupportsTranscoding: true, TranscodingUrl: '/videos/itm/master.m3u8?x=1', TranscodingSubProtocol: 'hls' } as MediaSourceInfo;
  const r = resolveStreamUrl(base.url, base.token, base.itemId, ms, base.deviceId);
  expect(r.isHls).toBe(true);
  expect(r.url).toBe('/jf/videos/itm/master.m3u8?x=1');
});

test('resolvePlayableItem returns the item itself for a movie', async () => {
  const item = { Id: 'movie1', Type: 'Movie', UserData: { PlaybackPositionTicks: 12345 } } as BaseItemDto;
  const result = await resolvePlayableItem({} as Api, 'user1', item);
  expect(result).toEqual({ id: 'movie1', startTicks: 12345 });
  expect(getNextUp).not.toHaveBeenCalled();
});

test('resolvePlayableItem resolves the series next-up episode', async () => {
  getNextUp.mockResolvedValue({ data: { Items: [{ Id: 'ep1', UserData: { PlaybackPositionTicks: 500 } }] } });
  const item = { Id: 'series1', Type: 'Series' } as BaseItemDto;
  const result = await resolvePlayableItem({} as Api, 'user1', item);
  expect(result).toEqual({ id: 'ep1', startTicks: 500 });
  expect(getNextUp).toHaveBeenCalledWith(expect.objectContaining({ seriesId: 'series1', userId: 'user1', limit: 1 }));
  expect(getSeasons).not.toHaveBeenCalled();
});

test('resolvePlayableItem falls back to first season/episode when no next-up', async () => {
  getNextUp.mockResolvedValue({ data: { Items: [] } });
  getSeasons.mockResolvedValue({ data: { Items: [{ Id: 'season1' }] } });
  getEpisodes.mockResolvedValue({ data: { Items: [{ Id: 'ep2', UserData: {} }] } });
  const item = { Id: 'series2', Type: 'Series' } as BaseItemDto;
  const result = await resolvePlayableItem({} as Api, 'user1', item);
  expect(result).toEqual({ id: 'ep2', startTicks: 0 });
  expect(getSeasons).toHaveBeenCalledWith(expect.objectContaining({ seriesId: 'series2' }));
  expect(getEpisodes).toHaveBeenCalledWith(expect.objectContaining({ seriesId: 'series2', seasonId: 'season1' }));
});

test('resolvePlayableItem throws when a series has no episodes at all', async () => {
  getNextUp.mockResolvedValue({ data: { Items: [] } });
  getSeasons.mockResolvedValue({ data: { Items: [] } });
  const item = { Id: 'series3', Type: 'Series' } as BaseItemDto;
  await expect(resolvePlayableItem({} as Api, 'user1', item)).rejects.toThrow();
});
