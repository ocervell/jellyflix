import { renderHook, act, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u', serverUrl: '/jf', accessToken: 't', userName: 'x' } }) }));
vi.mock('../../lib/jellyfin/device', () => ({ getDeviceId: () => 'dev' }));
vi.mock('../api/useItem', () => ({ useItem: () => ({ data: { Id: 'ep1' } }) }));
vi.mock('../../lib/jellyfin/bitrate', () => ({ measureBandwidth: vi.fn().mockResolvedValue(8_000_000) }));
const fetchPlaybackInfo = vi.fn();
vi.mock('../../lib/jellyfin/playback', async (orig) => ({
  ...(await orig<typeof import('../../lib/jellyfin/playback')>()),
  fetchPlaybackInfo: (...a: unknown[]) => fetchPlaybackInfo(...a),
  stopEncoding: vi.fn().mockResolvedValue(undefined),
  resolvePlayableItem: vi.fn().mockResolvedValue({ id: 'ep1', startTicks: 0 }),
  resolveStreamUrl: () => ({ url: 'http://x/master.m3u8', isHls: true }),
}));

import { usePlaybackSession } from './usePlaybackSession';

const MS = { Id: 'm', MediaStreams: [{ Index: 1, Type: 'Audio', Language: 'eng', IsDefault: true }, { Index: 2, Type: 'Audio', Language: 'fre' }] };

test('negotiates once and exposes audio tracks', async () => {
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 0));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  expect(result.current.audioTracks.map((t) => t.index)).toEqual([1, 2]);
  expect(fetchPlaybackInfo).toHaveBeenCalledTimes(1);
  // Regression: apply() must not clobber the default audio index picked at negotiate time.
  expect(result.current.audioIndex).toBe(1);
});

test('setAudioTrack renegotiates at the given position and keeps the selected audio index', async () => {
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 42));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  expect(result.current.audioIndex).toBe(1);
  // Renegotiation response has no top-level DefaultAudioStreamIndex, so a buggy apply()
  // would fall back to a stale closure value and clobber the explicit selection.
  const MS_NO_DEFAULT = { Id: 'm2', MediaStreams: MS.MediaStreams };
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS_NO_DEFAULT, playSessionId: 'ps2' });
  await act(async () => { await result.current.setAudioTrack(2); });
  const lastCall = fetchPlaybackInfo.mock.calls[fetchPlaybackInfo.mock.calls.length - 1]!;
  expect(lastCall[3]).toMatchObject({ audioStreamIndex: 2, startTicks: 42 * 10_000_000 });
  // Regression (lost update): audioIndex must remain 2, not be reverted by apply().
  expect(result.current.audioIndex).toBe(2);
});
