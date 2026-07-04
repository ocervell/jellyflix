import { useCallback, useEffect, useRef } from 'react';
import { useVideoEngine } from '../../hooks/player/useVideoEngine';
import ControlBar from './ControlBar';
import styles from './VideoPlayer.module.css';

export default function VideoPlayer({
  src, isHls, poster, startSeconds, title = '', onProgress, onBack, onError,
}: {
  src: string; isHls: boolean; poster: string | null; startSeconds: number; title?: string;
  onProgress: (seconds: number, paused: boolean) => void; onBack: () => void; onError: (msg: string) => void;
}) {
  const engine = useVideoEngine({ src, isHls, startSeconds, onError });
  const { videoRef } = engine;

  // Progress reporting (unchanged cadence: 10s + pause/play/seeked)
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tick = () => onProgressRef.current(video.currentTime, video.paused);
    const id = window.setInterval(tick, 10_000);
    const report = () => onProgressRef.current(video.currentTime, video.paused);
    video.addEventListener('pause', report);
    video.addEventListener('play', report);
    video.addEventListener('seeked', report);
    return () => { window.clearInterval(id); video.removeEventListener('pause', report); video.removeEventListener('play', report); video.removeEventListener('seeked', report); };
  }, [videoRef]);

  const onScrub = useCallback((s: number) => engine.seek(s), [engine]);
  const onHover = useCallback(() => {}, []); // replaced in Phase 4 (trickplay)

  return (
    <div className={styles.wrap}>
      <video ref={videoRef} className={styles.video} poster={poster ?? undefined} autoPlay />
      <ControlBar engine={engine} title={title} onBack={onBack} onScrub={onScrub} onHover={onHover} menuOpen={false} extras={null} />
    </div>
  );
}
