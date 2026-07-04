import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { getDeviceId } from '../../lib/jellyfin/device';
import { useItem } from '../api/useItem';
import { fetchPlaybackInfo, resolvePlayableItem, resolveStreamUrl, stopEncoding, type NegotiateParams } from '../../lib/jellyfin/playback';
import { getAudioTracks, getSubtitleTracks, defaultAudioIndex, defaultSubtitleIndex, type AudioTrack, type SubtitleTrack } from '../../lib/jellyfin/mediaStreams';
import { measureBandwidth } from '../../lib/jellyfin/bitrate';

export type SessionStream = { url: string; isHls: boolean; startSeconds: number };
export type PlaybackSession = {
  stream: SessionStream | null; error: string | null;
  playId: string; playSessionId: string;
  audioTracks: AudioTrack[]; subtitleTracks: SubtitleTrack[];
  audioIndex?: number; subtitleIndex?: number; mediaSource: MediaSourceInfo | null;
  bandwidth: number; currentBitrate: number; isTranscoding: boolean;
  setAudioTrack(index: number): Promise<void>;
  setSubtitleTrack(index: number | null): Promise<void>;
  renegotiate(p: NegotiateParams & { position: number }): Promise<void>;
};

export function usePlaybackSession(rawItemId: string, getPosition: () => number): PlaybackSession {
  const { api, session } = useApi();
  const { userId, serverUrl, accessToken } = session;
  const { data: item } = useItem(rawItemId);
  const [stream, setStream] = useState<SessionStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaSource, setMediaSource] = useState<MediaSourceInfo | null>(null);
  const [audioIndex, setAudioIndex] = useState<number | undefined>();
  const [subtitleIndex, setSubtitleIndex] = useState<number | undefined>();
  const [bandwidth, setBandwidth] = useState(0);
  const [currentBitrate, setCurrentBitrate] = useState(0);
  const playRef = useRef<{ playId: string; playSessionId: string }>({ playId: '', playSessionId: '' });
  const startedFor = useRef<string | null>(null);
  const negId = useRef(0);

  const apply = useCallback((ms: MediaSourceInfo, playSessionId: string, playId: string, position: number) => {
    const resolved = resolveStreamUrl(serverUrl, accessToken, playId, ms, getDeviceId());
    playRef.current = { playId, playSessionId };
    setMediaSource(ms);
    setCurrentBitrate(ms.Bitrate ?? 0);
    setStream({ ...resolved, startSeconds: resolved.isHls ? 0 : position });
  }, [serverUrl, accessToken]);

  // initial negotiate, once per rawItemId, after item load
  useEffect(() => {
    if (!item?.Id || startedFor.current === rawItemId) return;
    startedFor.current = rawItemId; // claim synchronously, before any await (StrictMode-safe)
    let active = true; setError(null);
    (async () => {
      const bw = await measureBandwidth(api);
      setBandwidth(bw);
      const { id: playId, startTicks } = await resolvePlayableItem(api, userId, item);
      const { mediaSource: ms, playSessionId } = await fetchPlaybackInfo(api, userId, playId, { startTicks, maxBitrate: bw });
      if (!active) return;
      setAudioIndex(defaultAudioIndex(ms));
      setSubtitleIndex(defaultSubtitleIndex(ms));
      apply(ms, playSessionId, playId, startTicks / 10_000_000);
    })().catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'This title can\'t be played right now.'); });
    return () => { active = false; };
  }, [item, rawItemId, api, userId, apply]);

  const renegotiate = useCallback(async (p: NegotiateParams & { position: number }) => {
    const myId = ++negId.current;
    const { playId, playSessionId } = playRef.current;
    await stopEncoding(api, getDeviceId(), playSessionId);
    const { mediaSource: ms, playSessionId: nps } = await fetchPlaybackInfo(api, userId, playId, {
      startTicks: Math.round(p.position * 10_000_000),
      maxBitrate: p.maxBitrate, audioStreamIndex: p.audioStreamIndex, subtitleStreamIndex: p.subtitleStreamIndex,
    });
    if (myId !== negId.current) return; // superseded
    if (p.maxBitrate !== undefined) setCurrentBitrate(p.maxBitrate);
    apply(ms, nps, playId, p.position);
  }, [api, userId, apply]);

  const setAudioTrack = useCallback(async (index: number) => {
    setAudioIndex(index);
    await renegotiate({ audioStreamIndex: index, position: getPosition() });
  }, [renegotiate, getPosition]);

  const setSubtitleTrack = useCallback(async (index: number | null) => {
    setSubtitleIndex(index ?? undefined);
    const target = index == null || !mediaSource ? null : getSubtitleTracks(mediaSource).find((t) => t.index === index);
    // External subs render client-side (VideoPlayer swaps the <track>); no renegotiation.
    if (target && target.deliveryMethod === 'External') return;
    await renegotiate({ subtitleStreamIndex: index ?? -1, position: getPosition() });
  }, [renegotiate, getPosition, mediaSource]);

  return {
    stream, error, playId: playRef.current.playId, playSessionId: playRef.current.playSessionId,
    audioTracks: mediaSource ? getAudioTracks(mediaSource) : [],
    subtitleTracks: mediaSource ? getSubtitleTracks(mediaSource) : [],
    audioIndex, subtitleIndex, mediaSource, bandwidth, currentBitrate, isTranscoding: stream?.isHls ?? false,
    setAudioTrack, setSubtitleTrack, renegotiate,
  };
}
