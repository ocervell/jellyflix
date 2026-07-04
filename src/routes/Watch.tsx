import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useItem } from '../hooks/api/useItem';
import { getDeviceId } from '../lib/jellyfin/device';
import { getBackdropUrl } from '../lib/jellyfin/images';
import { fetchPlaybackInfo, resolveStreamUrl } from '../lib/jellyfin/playback';
import { reportStart, reportProgress, reportStopped } from '../lib/jellyfin/reporting';
import { ticksToSeconds } from '../lib/format';
import VideoPlayer from '../components/player/VideoPlayer';

export default function Watch() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const { api, session } = useApi();
  const { data: item } = useItem(itemId);
  const [stream, setStream] = useState<{ url: string; isHls: boolean } | null>(null);
  const sessionRef = useRef<{ playSessionId: string } | null>(null);
  const startTicks = item?.UserData?.PlaybackPositionTicks ?? 0;

  useEffect(() => {
    let active = true;
    (async () => {
      const { mediaSource, playSessionId } = await fetchPlaybackInfo(api, session.userId, itemId, startTicks);
      if (!active) return;
      sessionRef.current = { playSessionId };
      const resolved = resolveStreamUrl(session.serverUrl, session.accessToken, itemId, mediaSource, getDeviceId());
      setStream(resolved);
      await reportStart(api, { itemId, playSessionId, positionTicks: startTicks });
    })().catch(() => { if (active) setStream(null); });
    return () => { active = false; };
  }, [api, session, itemId, startTicks]);

  const onProgress = useCallback((seconds: number, paused: boolean) => {
    const ps = sessionRef.current?.playSessionId;
    if (!ps) return;
    void reportProgress(api, { itemId, playSessionId: ps, positionTicks: Math.round(seconds * 10_000_000), isPaused: paused });
  }, [api, itemId]);

  const onBack = useCallback(() => {
    const ps = sessionRef.current?.playSessionId;
    const video = document.querySelector('video');
    const secs = video?.currentTime ?? 0;
    if (ps) void reportStopped(api, { itemId, playSessionId: ps, positionTicks: Math.round(secs * 10_000_000) });
    navigate(-1);
  }, [api, itemId, navigate]);

  if (!stream) return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Preparing playback…</div>;
  return (
    <VideoPlayer
      src={stream.url}
      isHls={stream.isHls}
      poster={item ? getBackdropUrl(api, item, { width: 1280 }) : null}
      startSeconds={ticksToSeconds(startTicks)}
      onProgress={onProgress}
      onBack={onBack}
    />
  );
}
