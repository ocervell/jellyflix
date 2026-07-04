import { expect, test } from 'vitest';
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { resolveStreamUrl } from './playback';

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
