import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useItem } from '../hooks/api/useItem';
import { usePlaybackSession } from '../hooks/player/usePlaybackSession';
import { getBackdropUrl } from '../lib/jellyfin/images';
import { reportStart, reportProgress, reportStopped } from '../lib/jellyfin/reporting';
import VideoPlayer from '../components/player/VideoPlayer';

export default function Watch() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const { api } = useApi();
  const { data: item } = useItem(itemId);
  const positionRef = useRef(0);
  const session = usePlaybackSession(itemId, () => positionRef.current);

  // reportStart once when a stream first appears
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session.stream || !session.playSessionId || reportedRef.current === session.playSessionId) return;
    reportedRef.current = session.playSessionId;
    void reportStart(api, { itemId: session.playId, playSessionId: session.playSessionId, positionTicks: Math.round(positionRef.current * 1e7) }).catch(() => {});
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
    }
    navigate(-1);
  }, [api, navigate]);

  if (session.error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', gap: '1rem' }}>
        <p>{session.error}</p>
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
    />
  );
}
