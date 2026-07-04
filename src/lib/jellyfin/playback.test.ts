import { beforeEach, expect, test, vi } from 'vitest';
import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';

const getNextUp = vi.fn();
const getSeasons = vi.fn();
const getEpisodes = vi.fn();
vi.mock('@jellyfin/sdk/lib/utils/api/tv-shows-api', () => ({
  getTvShowsApi: () => ({ getNextUp, getSeasons, getEpisodes }),
}));

const mockGetPostedPlaybackInfo = vi.fn().mockResolvedValue({ data: { MediaSources: [{ Id: 'm' }], PlaySessionId: 'p' } });
vi.mock('@jellyfin/sdk/lib/utils/api/media-info-api', () => ({
  getMediaInfoApi: () => ({ getPostedPlaybackInfo: mockGetPostedPlaybackInfo }),
}));

import { resolveStreamUrl, resolvePlayableItem, fetchPlaybackInfo, stopEncoding } from './playback';

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

test('direct-stream wins even when a TranscodingUrl is also present', () => {
  const ms = { Id: 'ms1', Container: 'mkv', SupportsDirectStream: true, SupportsDirectPlay: true, TranscodingUrl: '/videos/itm/master.m3u8?x=1', TranscodingSubProtocol: 'hls' } as unknown as MediaSourceInfo;
  const r = resolveStreamUrl('/jf', 'tok', 'itm', ms, 'dev');
  expect(r.isHls).toBe(false);
  expect(r.url).toBe('/jf/Videos/itm/stream.mkv?Static=true&mediaSourceId=ms1&deviceId=dev&api_key=tok');
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

test('fetchPlaybackInfo forwards negotiation params', async () => {
  mockGetPostedPlaybackInfo.mockClear();
  await fetchPlaybackInfo({} as never, 'u', 'itm', { startTicks: 50, maxBitrate: 3_000_000, audioStreamIndex: 2, subtitleStreamIndex: 3 });
  const arg = mockGetPostedPlaybackInfo.mock.calls[0][0].playbackInfoDto;
  expect(arg).toMatchObject({ UserId: 'u', StartTimeTicks: 50, MaxStreamingBitrate: 3_000_000, AudioStreamIndex: 2, SubtitleStreamIndex: 3 });
});

test('stopEncoding calls delete with api_key, deviceId, and playSessionId', async () => {
  const mockDelete = vi.fn().mockResolvedValue({});
  const api = {
    basePath: '/jf',
    accessToken: 'tok',
    axiosInstance: { delete: mockDelete },
  } as never;
  await stopEncoding(api, 'dev', 'ps');
  expect(mockDelete).toHaveBeenCalledWith(
    expect.stringContaining('/Videos/ActiveEncodings'),
    expect.objectContaining({
      params: expect.objectContaining({
        deviceId: 'dev',
        playSessionId: 'ps',
        api_key: 'tok',
      }),
    }),
  );
});

test('stopEncoding no-ops when playSessionId is empty', async () => {
  const mockDelete = vi.fn();
  const api = {
    basePath: '/jf',
    accessToken: 'tok',
    axiosInstance: { delete: mockDelete },
  } as never;
  await stopEncoding(api, 'dev', '');
  expect(mockDelete).not.toHaveBeenCalled();
});

test('stopEncoding swallows delete rejection', async () => {
  const mockDelete = vi.fn().mockRejectedValue(new Error('Network error'));
  const api = {
    basePath: '/jf',
    accessToken: 'tok',
    axiosInstance: { delete: mockDelete },
  } as never;
  // Should not throw
  await expect(stopEncoding(api, 'dev', 'ps')).resolves.toBeUndefined();
});
