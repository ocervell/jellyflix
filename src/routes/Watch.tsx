import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useItem } from '../hooks/api/useItem';
import { usePlaybackSession } from '../hooks/player/usePlaybackSession';
import { useAbrController } from '../hooks/player/useAbrController';
import type { EngineState } from '../hooks/player/useVideoEngine';
import { getBackdropUrl } from '../lib/jellyfin/images';
import { reportStart, reportProgress, reportStopped } from '../lib/jellyfin/reporting';
import { selectTrickplay } from '../lib/jellyfin/trickplay';
import VideoPlayer from '../components/player/VideoPlayer';

const IDLE: EngineState = {
  paused: true, currentTime: 0, duration: 0, bufferedEnd: 0,
  volume: 1, muted: false, waiting: false, stallCount: 0,
};

export default function Watch() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const { api } = useApi();
  const { data: item } = useItem(itemId);
  const positionRef = useRef(0); // relative to the engine's currentTime (HLS transcodes restart at 0)
  const baseRef = useRef(0); // absolute-position offset for the current stream (0 for direct/progressive)
  const session = usePlaybackSession(itemId, () => baseRef.current + positionRef.current);
  baseRef.current = session.positionBaseSeconds;
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [engineState, setEngineState] = useState<EngineState | null>(null);

  // Mount ABR controller (unconditional top-level hook)
  useAbrController({
    engineState: engineState ?? IDLE,
    getPosition: () => positionRef.current,
    bandwidth: session.bandwidth,
    currentBitrate: session.currentBitrate,
    isTranscoding: session.isTranscoding,
    onShift: (b) => { void session.renegotiate({ maxBitrate: b, position: baseRef.current + positionRef.current }); },
  });

  // reportStart once when a stream first appears; report Stopped for the previous
  // playSessionId first (renegotiation mints a new one, which would otherwise orphan
  // the prior server-side play session).
  const reportedRef = useRef<string | null>(null);
  const prevReportedRef = useRef<{ playId: string; playSessionId: string } | null>(null);
  useEffect(() => {
    if (!session.stream || !session.playSessionId || reportedRef.current === session.playSessionId) return;
    reportedRef.current = session.playSessionId;
    const prev = prevReportedRef.current;
    if (prev && prev.playSessionId && prev.playSessionId !== session.playSessionId) {
      void reportStopped(api, { itemId: prev.playId, playSessionId: prev.playSessionId, positionTicks: Math.round((baseRef.current + positionRef.current) * 1e7) }).catch(() => {});
    }
    positionRef.current = session.stream.startSeconds;
    const absoluteStart = session.positionBaseSeconds + session.stream.startSeconds;
    void reportStart(api, { itemId: session.playId, playSessionId: session.playSessionId, positionTicks: Math.round(absoluteStart * 1e7) }).catch(() => {});
    prevReportedRef.current = { playId: session.playId, playSessionId: session.playSessionId };
  }, [session.stream, session.playSessionId, session.playId, session.positionBaseSeconds, api]);

  const onProgress = useCallback((seconds: number, paused: boolean) => {
    positionRef.current = seconds;
    if (!session.playSessionId) return;
    const positionTicks = Math.round((baseRef.current + seconds) * 1e7);
    void reportProgress(api, { itemId: session.playId, playSessionId: session.playSessionId, positionTicks, isPaused: paused }).catch(() => {});
  }, [api, session.playId, session.playSessionId]);

  // Mirror session.playId/playSessionId in a ref for unmount cleanup
  const playRefRef = useRef({ playId: session.playId, playSessionId: session.playSessionId });
  playRefRef.current = { playId: session.playId, playSessionId: session.playSessionId };

  // Report Stopped on unmount and Back
  useEffect(() => () => {
    const p = playRefRef.current;
    if (!p.playSessionId) return;
    const positionTicks = Math.round((baseRef.current + positionRef.current) * 1e7);
    void reportStopped(api, { itemId: p.playId, playSessionId: p.playSessionId, positionTicks }).catch(() => {});
  }, [api]);

  const onBack = useCallback(() => {
    const p = playRefRef.current;
    if (p.playSessionId) {
      const positionTicks = Math.round((baseRef.current + positionRef.current) * 1e7);
      void reportStopped(api, { itemId: p.playId, playSessionId: p.playSessionId, positionTicks }).catch(() => {});
      playRefRef.current = { playId: p.playId, playSessionId: '' };
    }
    navigate(-1);
  }, [api, navigate]);

  const trickplay = useMemo(
    () => item && session.mediaSource?.Id ? selectTrickplay(item, session.mediaSource.Id, window.screen.width, window.devicePixelRatio) : null,
    [item, session.mediaSource?.Id],
  );

  const errorMessage = session.error || playerError;
  if (errorMessage) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', gap: '1rem' }}>
        <p>{errorMessage}</p>
        <button onClick={() => navigate(-1)}>Back</button>
      </div>
    );
  }

  if (!session.stream) return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Preparing playback...</div>;
  return (
    <VideoPlayer
      session={session}
      poster={item ? getBackdropUrl(api, item, { width: 1280 }) : null}
      title={item?.Name ?? ''}
      onProgress={onProgress}
      onBack={onBack}
      onError={setPlayerError}
      onEngineState={setEngineState}
      trickplay={trickplay}
    />
  );
}
