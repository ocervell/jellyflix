import { useEffect } from 'react';
import type { VideoEngine } from '../../hooks/player/useVideoEngine';
import { useAutoHide } from '../../hooks/player/useAutoHide';
import Scrubber from './Scrubber';
import { formatTime } from '../../lib/format';
import styles from './ControlBar.module.css';

export default function ControlBar({
  engine, title, onBack, onScrub, onHover, menuOpen, extras, bubbleSlot,
}: {
  engine: VideoEngine; title: string; onBack: () => void;
  onScrub: (s: number) => void; onHover: (info: { seconds: number; x: number } | null) => void;
  menuOpen: boolean; extras: React.ReactNode; bubbleSlot?: React.ReactNode;
}) {
  const { state } = engine;
  const { visible, ping } = useAutoHide(!state.paused && !menuOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      ping();
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); engine.togglePlay(); break;
        case 'ArrowRight': engine.seekBy(10); break;
        case 'ArrowLeft': engine.seekBy(-10); break;
        case 'ArrowUp': engine.setVolume(Math.min(1, state.volume + 0.1)); break;
        case 'ArrowDown': engine.setVolume(Math.max(0, state.volume - 0.1)); break;
        case 'f': engine.requestFullscreen(); break;
        case 'm': engine.toggleMute(); break;
        case 'Escape': onBack(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, state.volume, onBack, ping]);

  const remaining = Math.max(0, state.duration - state.currentTime);
  return (
    <div className={visible ? styles.wrap : `${styles.wrap} ${styles.hidden}`} onPointerMove={ping}>
      <div className={styles.top}>
        <button className={styles.back} onClick={onBack} aria-label="Back">‹ Back</button>
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.center}>
        <button className={styles.bigPlay} onClick={engine.togglePlay} aria-label={state.paused ? 'Play' : 'Pause'}>
          {state.paused ? '▶' : '❚❚'}
        </button>
      </div>
      <div className={styles.bottom}>
        {bubbleSlot}
        <Scrubber currentTime={state.currentTime} duration={state.duration} bufferedEnd={state.bufferedEnd} onScrub={onScrub} onHover={onHover} />
        <div className={styles.buttons}>
          <button onClick={engine.togglePlay} aria-label={state.paused ? 'Play' : 'Pause'}>{state.paused ? '▶' : '❚❚'}</button>
          <button onClick={() => engine.seekBy(-10)} aria-label="Rewind 10 seconds">⟲10</button>
          <button onClick={() => engine.seekBy(10)} aria-label="Forward 10 seconds">10⟳</button>
          <button onClick={engine.toggleMute} aria-label={state.muted ? 'Unmute' : 'Mute'}>{state.muted || state.volume === 0 ? '🔇' : '🔊'}</button>
          <input className={styles.volume} type="range" min={0} max={1} step={0.05} value={state.muted ? 0 : state.volume}
            onChange={(e) => engine.setVolume(Number(e.target.value))} aria-label="Volume" />
          <span className={styles.time}>{formatTime(state.currentTime)} / -{formatTime(remaining)}</span>
          <span className={styles.spacer} />
          {extras}
          <button onClick={engine.requestFullscreen} aria-label="Fullscreen">⛶</button>
        </div>
      </div>
    </div>
  );
}
