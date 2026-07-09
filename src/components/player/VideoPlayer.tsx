import { useCallback, useEffect, useRef, useState } from 'react';
import { useVideoEngine, type EngineState } from '../../hooks/player/useVideoEngine';
import ControlBar from './ControlBar';
import TrackMenu from './TrackMenu';
import TrickplayBubble from './TrickplayBubble';
import SubtitleOverlay from './SubtitleOverlay';
import { useApi } from '../../hooks/useApi';
import type { PlaybackSession } from '../../hooks/player/usePlaybackSession';
import type { Trickplay } from '../../lib/jellyfin/trickplay';
import styles from './VideoPlayer.module.css';

export default function VideoPlayer({
  session, poster, title, onProgress, onBack, onError, onEngineState, trickplay,
}: {
  session: PlaybackSession; poster: string | null; title: string;
  onProgress: (seconds: number, paused: boolean) => void; onBack: () => void;
  onError?: (msg: string) => void; onEngineState?: (s: EngineState) => void;
  trickplay?: Trickplay | null;
}) {
  const { session: appSession } = useApi();
  const stream = session.stream!;
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState<{ seconds: number; x: number } | null>(null);
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

  useEffect(() => {
    onEngineState?.(engine.state);
  }, [engine.state, onEngineState]);

  // The selected external subtitle (if any) is drawn by SubtitleOverlay below from
  // fetched cue data. Encode subs are burned into the video, so they need no overlay.
  const selectedSub = session.subtitleTracks.find(
    (t) => t.index === session.subtitleIndex && t.deliveryMethod === 'External',
  ) ?? null;

  const onScrub = useCallback((s: number) => engine.seek(s), [engine]);
  const extras = (
    <TrackMenu audioTracks={session.audioTracks} subtitleTracks={session.subtitleTracks}
      audioIndex={session.audioIndex} subtitleIndex={session.subtitleIndex}
      onAudio={(i) => void session.setAudioTrack(i)} onSubtitle={(i) => void session.setSubtitleTrack(i)}
      onOpenChange={setMenuOpen} />
  );

  return (
    <div className={styles.wrap}>
      <video ref={videoRef} className={styles.video} poster={poster ?? undefined} autoPlay />
      <SubtitleOverlay track={selectedSub} currentTime={engine.state.currentTime}
        serverUrl={appSession.serverUrl} token={appSession.accessToken} />
      <ControlBar
        engine={engine} title={title} onBack={onBack} onScrub={onScrub} onHover={setHover} menuOpen={menuOpen} extras={extras}
        bubbleSlot={<TrickplayBubble trickplay={trickplay ?? null} serverUrl={appSession.serverUrl} token={appSession.accessToken} hover={hover} />}
      />
    </div>
  );
}
