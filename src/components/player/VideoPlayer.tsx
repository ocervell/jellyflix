import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVideoEngine } from '../../hooks/player/useVideoEngine';
import ControlBar from './ControlBar';
import TrackMenu from './TrackMenu';
import { subtitleTrackUrl } from '../../lib/jellyfin/mediaStreams';
import { useApi } from '../../hooks/useApi';
import type { PlaybackSession } from '../../hooks/player/usePlaybackSession';
import styles from './VideoPlayer.module.css';

export default function VideoPlayer({
  session, poster, title, onProgress, onBack, onError,
}: {
  session: PlaybackSession; poster: string | null; title: string;
  onProgress: (seconds: number, paused: boolean) => void; onBack: () => void;
  onError?: (msg: string) => void;
}) {
  const { session: appSession } = useApi();
  const stream = session.stream!;
  const [menuOpen, setMenuOpen] = useState(false);
  const engine = useVideoEngine({ src: stream.url, isHls: stream.isHls, startSeconds: stream.startSeconds, onError: (msg) => onError?.(msg) });
  const { videoRef } = engine;

  const onProgressRef = useRef(onProgress); onProgressRef.current = onProgress;
  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    const tick = () => onProgressRef.current(video.currentTime, video.paused);
    const id = window.setInterval(tick, 10_000);
    const report = () => onProgressRef.current(video.currentTime, video.paused);
    video.addEventListener('pause', report); video.addEventListener('play', report); video.addEventListener('seeked', report);
    return () => { window.clearInterval(id); video.removeEventListener('pause', report); video.removeEventListener('play', report); video.removeEventListener('seeked', report); };
  }, [videoRef]);

  // External subtitle <track>s with a resolvable URL; show the selected one.
  // Filtered so the rendered <track> list stays 1:1 with video.textTracks.
  const externalSubs = useMemo(
    () => session.subtitleTracks.filter(
      (t) => t.deliveryMethod === 'External' && subtitleTrackUrl(appSession.serverUrl, appSession.accessToken, t) !== null,
    ),
    [session.subtitleTracks, appSession.serverUrl, appSession.accessToken],
  );
  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    Array.from(video.textTracks).forEach((tt, i) => {
      tt.mode = externalSubs[i]?.index === session.subtitleIndex ? 'showing' : 'disabled';
    });
  }, [session.subtitleIndex, externalSubs, videoRef, stream.url]);

  const onScrub = useCallback((s: number) => engine.seek(s), [engine]);
  const extras = (
    <TrackMenu audioTracks={session.audioTracks} subtitleTracks={session.subtitleTracks}
      audioIndex={session.audioIndex} subtitleIndex={session.subtitleIndex}
      onAudio={(i) => void session.setAudioTrack(i)} onSubtitle={(i) => void session.setSubtitleTrack(i)}
      onOpenChange={setMenuOpen} />
  );

  return (
    <div className={styles.wrap}>
      <video ref={videoRef} className={styles.video} poster={poster ?? undefined} autoPlay>
        {externalSubs.map((t) => {
          const url = subtitleTrackUrl(appSession.serverUrl, appSession.accessToken, t)!;
          return <track key={t.index} kind="subtitles" srcLang={t.language ?? 'und'} label={t.label} src={url} />;
        })}
      </video>
      <ControlBar engine={engine} title={title} onBack={onBack} onScrub={onScrub} onHover={() => {}} menuOpen={menuOpen} extras={extras} />
    </div>
  );
}
