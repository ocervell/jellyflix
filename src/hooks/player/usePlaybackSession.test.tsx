import { renderHook, act, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

// Stable references, mirroring useApi's real useMemo: an unstable `api`/`item` would
// re-fire the negotiate effect (which depends on them) on every render.
const API = {};
const SESSION = { userId: 'u', serverUrl: '/jf', accessToken: 't', userName: 'x' };
vi.mock('../useApi', () => ({ useApi: () => ({ api: API, session: SESSION }) }));
vi.mock('../../lib/jellyfin/device', () => ({ getDeviceId: () => 'dev' }));
// A stable object reference, mirroring react-query's structural sharing: `data` keeps
// the same identity across renders when unchanged, so the negotiate effect (which
// depends on `item`) doesn't re-fire on every render.
const ITEM = { Id: 'ep1' };
vi.mock('../api/useItem', () => ({ useItem: () => ({ data: ITEM }) }));
vi.mock('../../lib/jellyfin/bitrate', () => ({ measureBandwidth: vi.fn().mockResolvedValue(10_000_000) }));
const fetchPlaybackInfo = vi.fn();
const resolvePlayableItem = vi.fn().mockResolvedValue({ id: 'ep1', startTicks: 0 });
const resolveStreamUrl = vi.fn().mockReturnValue({ url: 'http://x/master.m3u8', isHls: true });
vi.mock('../../lib/jellyfin/playback', async (orig) => ({
  ...(await orig<typeof import('../../lib/jellyfin/playback')>()),
  fetchPlaybackInfo: (...a: unknown[]) => fetchPlaybackInfo(...a),
  stopEncoding: vi.fn().mockResolvedValue(undefined),
  resolvePlayableItem: (...a: unknown[]) => resolvePlayableItem(...a),
  resolveStreamUrl: (...a: unknown[]) => resolveStreamUrl(...a),
}));

import { usePlaybackSession } from './usePlaybackSession';

const MS = { Id: 'm', Bitrate: 25_000_000, MediaStreams: [{ Index: 1, Type: 'Audio', Language: 'eng', IsDefault: true }, { Index: 2, Type: 'Audio', Language: 'fre' }] };

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

test('setAudioTrack renegotiates with the current MediaSourceId (server ignores AudioStreamIndex without it)', async () => {
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 0));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps2' });
  await act(async () => { await result.current.setAudioTrack(2); });
  const lastCall = fetchPlaybackInfo.mock.calls[fetchPlaybackInfo.mock.calls.length - 1]!;
  // MS.Id is 'm'; renegotiation must carry it or the server falls back to the default audio.
  expect(lastCall[3]).toMatchObject({ audioStreamIndex: 2, mediaSourceId: 'm' });
});

test('a bitrate-only renegotiation (ABR shift) preserves the selected audio track', async () => {
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 0));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  // User picks English (index 2).
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps2' });
  await act(async () => { await result.current.setAudioTrack(2); });
  expect(result.current.audioIndex).toBe(2);
  // ABR later shifts quality with no explicit audio index — must keep index 2, not revert to default.
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps3' });
  await act(async () => { await result.current.renegotiate({ maxBitrate: 4_000_000, position: 0 }); });
  const lastCall = fetchPlaybackInfo.mock.calls[fetchPlaybackInfo.mock.calls.length - 1]!;
  expect(lastCall[3]).toMatchObject({ maxBitrate: 4_000_000, audioStreamIndex: 2 });
});

test('a bitrate-only renegotiation preserves a burned-in (Encode) subtitle selection', async () => {
  const MS_SUB = { Id: 'm', MediaStreams: [
    { Index: 1, Type: 'Audio', IsDefault: true },
    { Index: 3, Type: 'Subtitle', Language: 'fre', DeliveryMethod: 'Encode' },
  ] };
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS_SUB, playSessionId: 'ps' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 0));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS_SUB, playSessionId: 'ps2' });
  await act(async () => { await result.current.setSubtitleTrack(3); });
  expect(result.current.subtitleIndex).toBe(3);
  // ABR shift (bitrate only) must keep the burned-in subtitle, or the next quality change wipes it.
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS_SUB, playSessionId: 'ps3' });
  await act(async () => { await result.current.renegotiate({ maxBitrate: 4_000_000, position: 0 }); });
  const lastCall = fetchPlaybackInfo.mock.calls[fetchPlaybackInfo.mock.calls.length - 1]!;
  expect(lastCall[3]).toMatchObject({ maxBitrate: 4_000_000, subtitleStreamIndex: 3 });
});

test('a bitrate-only renegotiation does NOT re-send an External subtitle (it renders client-side)', async () => {
  const MS_EXT = { Id: 'm', MediaStreams: [
    { Index: 1, Type: 'Audio', IsDefault: true },
    { Index: 3, Type: 'Subtitle', Language: 'eng', DeliveryMethod: 'External', DeliveryUrl: '/s3' },
  ] };
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS_EXT, playSessionId: 'ps' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 0));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  await act(async () => { await result.current.setSubtitleTrack(3); }); // External: client-side, no renegotiation
  expect(result.current.subtitleIndex).toBe(3);
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS_EXT, playSessionId: 'ps3' });
  await act(async () => { await result.current.renegotiate({ maxBitrate: 4_000_000, position: 0 }); });
  const lastCall = fetchPlaybackInfo.mock.calls[fetchPlaybackInfo.mock.calls.length - 1]!;
  // Burning an External sub into the transcode would be wrong — leave it to the client <track>.
  expect(lastCall[3].subtitleStreamIndex).toBeUndefined();
});

test('currentBitrate is set to the measured bandwidth cap, not the source MediaSource.Bitrate', async () => {
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 0));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  // MS.Bitrate is 25_000_000 (source bitrate); the negotiated cap is the mocked bandwidth, 10_000_000.
  // A buggy apply() that sets currentBitrate from ms.Bitrate would clobber this to 25_000_000.
  expect(result.current.currentBitrate).toBe(10_000_000);
});

test('renegotiate with maxBitrate persists as currentBitrate (apply no longer clobbers it)', async () => {
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 0));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  expect(result.current.currentBitrate).toBe(10_000_000);
  // Renegotiation response still carries the high source Bitrate; only the requested cap should stick.
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps3' });
  await act(async () => { await result.current.renegotiate({ maxBitrate: 4_000_000, position: 0 }); });
  expect(result.current.currentBitrate).toBe(4_000_000);
});

test('HLS resume seeks to the absolute position (startSeconds), positionBaseSeconds stays 0, and renegotiation sends absolute startTicks', async () => {
  // Resume at 300s absolute. Jellyfin's HLS manifest is absolute, so the client seeks
  // there (hls.js startPosition): stream.startSeconds carries 300 and there is no offset.
  resolvePlayableItem.mockResolvedValueOnce({ id: 'ep1', startTicks: 300 * 10_000_000 });
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps' });
  // getPosition simulates Watch.tsx's baseRef(0) + positionRef: absolute currentTime 305.
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 305));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  expect(result.current.stream?.startSeconds).toBe(300);
  expect(result.current.positionBaseSeconds).toBe(0);

  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps-reneg' });
  await act(async () => { await result.current.setAudioTrack(2); });
  const lastCall = fetchPlaybackInfo.mock.calls[fetchPlaybackInfo.mock.calls.length - 1]!;
  // Must be the absolute 305s, not the relative 5s.
  expect(lastCall[3]).toMatchObject({ audioStreamIndex: 2, startTicks: Math.round(305 * 10_000_000) });
});

test('direct/progressive stream resumes via startSeconds with positionBaseSeconds 0', async () => {
  resolveStreamUrl.mockReturnValueOnce({ url: 'http://x/stream.mp4', isHls: false });
  resolvePlayableItem.mockResolvedValueOnce({ id: 'ep1', startTicks: 300 * 10_000_000 });
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps-direct' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 0));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  expect(result.current.stream?.startSeconds).toBe(300);
  expect(result.current.positionBaseSeconds).toBe(0);
});

test('turning subtitles Off after selecting an External subtitle does not renegotiate (client-side only)', async () => {
  const MS_EXTERNAL_SUB = {
    Id: 'm-sub', MediaStreams: [
      { Index: 1, Type: 'Audio', Language: 'eng', IsDefault: true },
      { Index: 3, Type: 'Subtitle', Language: 'eng', DeliveryMethod: 'External', DeliveryUrl: '/sub3' },
    ],
  };
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS_EXTERNAL_SUB, playSessionId: 'ps-sub' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 0));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  const callsBefore = fetchPlaybackInfo.mock.calls.length;

  await act(async () => { await result.current.setSubtitleTrack(3); });
  expect(result.current.subtitleIndex).toBe(3);
  expect(fetchPlaybackInfo).toHaveBeenCalledTimes(callsBefore); // External select: client-side, no renegotiation

  await act(async () => { await result.current.setSubtitleTrack(null); });
  expect(result.current.subtitleIndex).toBeUndefined();
  expect(fetchPlaybackInfo).toHaveBeenCalledTimes(callsBefore); // External off: still client-side, no renegotiation
});
