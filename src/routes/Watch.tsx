import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useItem } from '../hooks/api/useItem';
import { getDeviceId } from '../lib/jellyfin/device';
import { getBackdropUrl } from '../lib/jellyfin/images';
import { fetchPlaybackInfo, resolvePlayableItem, resolveStreamUrl } from '../lib/jellyfin/playback';
import { reportStart, reportProgress, reportStopped } from '../lib/jellyfin/reporting';
import { ticksToSeconds } from '../lib/format';
import VideoPlayer from '../components/player/VideoPlayer';

type PlaySession = { playSessionId: string; itemId: string };

export default function Watch() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const { api, session } = useApi();
  const { data: item } = useItem(itemId);
  const { userId, serverUrl, accessToken } = session;
  const [stream, setStream] = useState<{ url: string; isHls: boolean; startSeconds: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedForRef = useRef<string | null>(null);
  const playRef = useRef<PlaySession | null>(null);
  const lastPositionRef = useRef(0);

  // Runs the playback setup exactly once per itemId, and only once `item` has
  // loaded (so a Continue-Watching resume position is final, not a 0 -> N flip).
  useEffect(() => {
    if (!item?.Id || startedForRef.current === itemId) return;
    let active = true;
    setError(null);
    (async () => {
      const { id: playId, startTicks } = await resolvePlayableItem(api, userId, item);
      const { mediaSource, playSessionId } = await fetchPlaybackInfo(api, userId, playId, startTicks);
      if (!active) return;
      startedForRef.current = itemId;
      playRef.current = { playSessionId, itemId: playId };
      const resolved = resolveStreamUrl(serverUrl, accessToken, playId, mediaSource, getDeviceId());
      setStream({ ...resolved, startSeconds: ticksToSeconds(startTicks) });
      // fire-and-forget: a reporting failure must not tear down playback
      void reportStart(api, { itemId: playId, playSessionId, positionTicks: startTicks }).catch(() => {});
    })().catch((e: unknown) => {
      if (!active) return;
      setError(e instanceof Error ? e.message : 'This title can’t be played right now.');
    });
    return () => { active = false; };
  }, [item, itemId, api, userId, serverUrl, accessToken]);

  // Report Stopped whenever the player goes away, however that happens
  // (in-app Back, browser back, refresh, hash-change unmount, ...).
  useEffect(() => () => {
    const p = playRef.current;
    if (!p) return;
    void reportStopped(api, { itemId: p.itemId, playSessionId: p.playSessionId, positionTicks: Math.round(lastPositionRef.current * 10_000_000) }).catch(() => {});
  }, [api]);

  const onProgress = useCallback((seconds: number, paused: boolean) => {
    lastPositionRef.current = seconds;
    const p = playRef.current;
    if (!p) return;
    void reportProgress(api, { itemId: p.itemId, playSessionId: p.playSessionId, positionTicks: Math.round(seconds * 10_000_000), isPaused: paused }).catch(() => {});
  }, [api]);

  const onPlayerError = useCallback((msg: string) => { setError(msg); }, []);

  const onBack = useCallback(() => {
    const p = playRef.current;
    if (p) {
      void reportStopped(api, { itemId: p.itemId, playSessionId: p.playSessionId, positionTicks: Math.round(lastPositionRef.current * 10_000_000) }).catch(() => {});
      playRef.current = null;
    }
    navigate(-1);
  }, [api, navigate]);

  if (error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', gap: '1rem' }}>
        <p>{error}</p>
        <button onClick={() => navigate(-1)}>‹ Back</button>
      </div>
    );
  }

  if (!stream) return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Preparing playback…</div>;
  return (
    <VideoPlayer
      src={stream.url}
      isHls={stream.isHls}
      poster={item ? getBackdropUrl(api, item, { width: 1280 }) : null}
      startSeconds={stream.startSeconds}
      title={item?.Name ?? ''}
      onProgress={onProgress}
      onBack={onBack}
      onError={onPlayerError}
    />
  );
}
