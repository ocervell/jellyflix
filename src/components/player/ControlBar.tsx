import { useEffect } from 'react';
import { ChevronLeft, Play, Pause, RotateCcw, RotateCw, Volume2, Volume1, VolumeX, Maximize } from 'lucide-react';
import type { VideoEngine } from '../../hooks/player/useVideoEngine';
import { useAutoHide } from '../../hooks/player/useAutoHide';
import Scrubber from './Scrubber';
import { formatTime } from '../../lib/format';
import styles from './ControlBar.module.css';

function VolumeIcon({ muted, volume }: { muted: boolean; volume: number }) {
  if (muted || volume === 0) return <VolumeX size={20} />;
  if (volume <= 0.5) return <Volume1 size={20} />;
  return <Volume2 size={20} />;
}

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
        <button className={styles.back} onClick={onBack} aria-label="Back"><ChevronLeft size={22} /> Back</button>
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.center}>
        <button className={styles.bigPlay} onClick={engine.togglePlay} aria-label={state.paused ? 'Play' : 'Pause'}>
          {state.paused ? <Play size={40} fill="currentColor" strokeWidth={0} /> : <Pause size={40} fill="currentColor" strokeWidth={0} />}
        </button>
      </div>
      <div className={styles.bottom}>
        <div className={styles.scrubRow}>
          {bubbleSlot}
          <Scrubber currentTime={state.currentTime} duration={state.duration} bufferedEnd={state.bufferedEnd} onScrub={onScrub} onHover={onHover} />
        </div>
        <div className={styles.buttons}>
          <button onClick={engine.togglePlay} aria-label={state.paused ? 'Play' : 'Pause'}>
            {state.paused ? <Play size={20} fill="currentColor" strokeWidth={0} /> : <Pause size={20} fill="currentColor" strokeWidth={0} />}
          </button>
          <button className={styles.icon10} onClick={() => engine.seekBy(-10)} aria-label="Rewind 10 seconds">
            <RotateCcw size={22} /><span className={styles.num} aria-hidden="true">10</span>
          </button>
          <button className={styles.icon10} onClick={() => engine.seekBy(10)} aria-label="Forward 10 seconds">
            <RotateCw size={22} /><span className={styles.num} aria-hidden="true">10</span>
          </button>
          <div className={styles.volumeGroup}>
            <button onClick={engine.toggleMute} aria-label={state.muted ? 'Unmute' : 'Mute'}>
              <VolumeIcon muted={state.muted} volume={state.volume} />
            </button>
            <input className={styles.volume} type="range" min={0} max={1} step={0.05} value={state.muted ? 0 : state.volume}
              onChange={(e) => engine.setVolume(Number(e.target.value))} aria-label="Volume" />
          </div>
          <span className={styles.time}>{formatTime(state.currentTime)} / -{formatTime(remaining)}</span>
          <span className={styles.spacer} />
          {extras}
          <button onClick={engine.requestFullscreen} aria-label="Fullscreen"><Maximize size={26} /></button>
        </div>
      </div>
    </div>
  );
}
