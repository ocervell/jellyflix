import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import styles from './VideoPlayer.module.css';

export default function VideoPlayer({
  src, isHls, poster, startSeconds, onProgress, onBack,
}: {
  src: string; isHls: boolean; poster: string | null; startSeconds: number;
  onProgress: (seconds: number, paused: boolean) => void; onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | undefined;
    if (isHls && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }
    const onLoaded = () => { if (startSeconds > 0) video.currentTime = startSeconds; };
    video.addEventListener('loadedmetadata', onLoaded);
    return () => { video.removeEventListener('loadedmetadata', onLoaded); hls?.destroy(); };
  }, [src, isHls, startSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tick = () => onProgress(video.currentTime, video.paused);
    const id = window.setInterval(tick, 10_000);
    const onPause = () => onProgress(video.currentTime, true);
    const onPlay = () => onProgress(video.currentTime, false);
    const onSeeked = () => onProgress(video.currentTime, video.paused);
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    video.addEventListener('seeked', onSeeked);
    return () => {
      window.clearInterval(id);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [onProgress]);

  return (
    <div className={styles.wrap}>
      <button className={styles.back} onClick={onBack} aria-label="Back">‹ Back</button>
      <video ref={videoRef} className={styles.video} poster={poster ?? undefined} controls autoPlay />
    </div>
  );
}
