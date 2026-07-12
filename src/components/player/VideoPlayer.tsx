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
  session, poster, title, durationSeconds, onProgress, onBack, onError, onEngineState, trickplay,
}: {
  session: PlaybackSession; poster: string | null; title: string; durationSeconds?: number;
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
    // timeupdate (~4Hz) keeps the parent's live position current for renegotiation;
    // Watch throttles the actual server report. pause/play/seeked report immediately.
    video.addEventListener('timeupdate', report);
    video.addEventListener('pause', report); video.addEventListener('play', report); video.addEventListener('seeked', report);
    return () => { window.clearInterval(id); video.removeEventListener('timeupdate', report); video.removeEventListener('pause', report); video.removeEventListener('play', report); video.removeEventListener('seeked', report); };
  }, [videoRef]);

  useEffect(() => {
    onEngineState?.(engine.state);
  }, [engine.state, onEngineState]);

  // Buffering / reconnect UX: once playback has started, hold the last video frame
  // (captured on stall) instead of flashing the media backdrop, and show a spinner.
  // A user pause keeps readyState at 4; a stall/reload drops it below 3.
  const [started, setStarted] = useState(false);
  const [frameHold, setFrameHold] = useState<string | null>(null);
  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    const onPlaying = () => { setStarted(true); setFrameHold(null); };
    const onWaiting = () => {
      if (!video.videoWidth) return;
      try {
        const c = document.createElement('canvas');
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d')?.drawImage(video, 0, 0);
        setFrameHold(c.toDataURL('image/jpeg', 0.6));
      } catch { /* cross-origin/tainted frame — skip the hold */ }
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    return () => { video.removeEventListener('playing', onPlaying); video.removeEventListener('waiting', onWaiting); };
  }, [videoRef]);
  // readyState < 3 = can't play forward yet (initial resume load OR a mid-playback stall).
  // Drives the spinner + a locked Pause button + the resume-position scrubber.
  const loading = engine.state.readyState < 3;

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
      <video ref={videoRef} className={styles.video} poster={started ? undefined : (poster ?? undefined)} autoPlay />
      {loading && frameHold && <img className={styles.frameHold} src={frameHold} alt="" />}
      <SubtitleOverlay track={selectedSub} currentTime={engine.state.currentTime}
        serverUrl={appSession.serverUrl} token={appSession.accessToken} />
      <ControlBar
        engine={engine} title={title} onBack={onBack} onScrub={onScrub} onHover={setHover} menuOpen={menuOpen} extras={extras}
        loading={loading} resumeSeconds={stream.startSeconds} fallbackDuration={durationSeconds}
        bubbleSlot={<TrickplayBubble trickplay={trickplay ?? null} serverUrl={appSession.serverUrl} token={appSession.accessToken} hover={hover} />}
      />
    </div>
  );
}
