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
  const positionRef = useRef(0);
  const session = usePlaybackSession(itemId, () => positionRef.current);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [engineState, setEngineState] = useState<EngineState | null>(null);

  // Mount ABR controller (unconditional top-level hook)
  useAbrController({
    engineState: engineState ?? IDLE,
    getPosition: () => positionRef.current,
    bandwidth: session.bandwidth,
    currentBitrate: session.currentBitrate,
    isTranscoding: session.isTranscoding,
    onShift: (b) => { void session.renegotiate({ maxBitrate: b, position: positionRef.current }); },
  });

  // reportStart once when a stream first appears
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session.stream || !session.playSessionId || reportedRef.current === session.playSessionId) return;
    reportedRef.current = session.playSessionId;
    positionRef.current = session.stream.startSeconds;
    void reportStart(api, { itemId: session.playId, playSessionId: session.playSessionId, positionTicks: Math.round(session.stream.startSeconds * 1e7) }).catch(() => {});
  }, [session.stream, session.playSessionId, session.playId, api]);

  const onProgress = useCallback((seconds: number, paused: boolean) => {
    positionRef.current = seconds;
    if (!session.playSessionId) return;
    void reportProgress(api, { itemId: session.playId, playSessionId: session.playSessionId, positionTicks: Math.round(seconds * 1e7), isPaused: paused }).catch(() => {});
  }, [api, session.playId, session.playSessionId]);

  // Mirror session.playId/playSessionId in a ref for unmount cleanup
  const playRefRef = useRef({ playId: session.playId, playSessionId: session.playSessionId });
  playRefRef.current = { playId: session.playId, playSessionId: session.playSessionId };

  // Report Stopped on unmount and Back
  useEffect(() => () => {
    const p = playRefRef.current;
    if (!p.playSessionId) return;
    void reportStopped(api, { itemId: p.playId, playSessionId: p.playSessionId, positionTicks: Math.round(positionRef.current * 1e7) }).catch(() => {});
  }, [api]);

  const onBack = useCallback(() => {
    const p = playRefRef.current;
    if (p.playSessionId) {
      void reportStopped(api, { itemId: p.playId, playSessionId: p.playSessionId, positionTicks: Math.round(positionRef.current * 1e7) }).catch(() => {});
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
