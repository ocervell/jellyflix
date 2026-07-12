import { useEffect } from 'react';
import { ChevronLeft, Play, Pause, RotateCcw, RotateCw, Volume2, Volume1, VolumeX, Maximize } from 'lucide-react';
import type { VideoEngine } from '../../hooks/player/useVideoEngine';
import { useAutoHide } from '../../hooks/player/useAutoHide';
import Scrubber from './Scrubber';
import { formatTime } from '../../lib/format';
import { FocusSection } from '../tv/FocusSection';
import { Focusable } from '../tv/Focusable';
import styles from './ControlBar.module.css';

function VolumeIcon({ muted, volume }: { muted: boolean; volume: number }) {
  if (muted || volume === 0) return <VolumeX size={20} />;
  if (volume <= 0.5) return <Volume1 size={20} />;
  return <Volume2 size={20} />;
}

export default function ControlBar({
  engine, title, onBack, onScrub, onHover, menuOpen, extras, bubbleSlot, loading, resumeSeconds, fallbackDuration,
}: {
  engine: VideoEngine; title: string; onBack: () => void;
  onScrub: (s: number) => void; onHover: (info: { seconds: number; x: number } | null) => void;
  menuOpen: boolean; extras: React.ReactNode; bubbleSlot?: React.ReactNode;
  loading?: boolean; resumeSeconds?: number; fallbackDuration?: number;
}) {
  const { state } = engine;
  // Keep the controls (and the loading spinner) visible while loading/stalled — auto-hide
  // only during smooth playback, not while the user is waiting for the stream.
  const { visible, ping } = useAutoHide(!state.paused && !menuOpen && !loading);
  // Before the video has seeked to the resume point (currentTime still 0), show the resume
  // position and the item's known runtime so the scrubber starts AT the resume spot, not 0.
  const displayTime = state.currentTime > 0 ? state.currentTime : (resumeSeconds ?? 0);
  const displayDuration = state.duration > 0 ? state.duration : (fallbackDuration ?? 0);

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

  const remaining = Math.max(0, displayDuration - displayTime);
  // Lock the button to Pause while loading/buffering (the player autoplays, so a Play icon
  // makes users press it and flicker play/pause). Pause signals "it's already going".
  const playing = !!loading || !state.paused || state.duration === 0 || state.waiting;
  return (
    <div className={visible ? styles.wrap : `${styles.wrap} ${styles.hidden}`} onPointerMove={ping}>
      <div className={styles.top}>
        <button className={styles.back} onClick={onBack} aria-label="Back"><ChevronLeft size={22} /> Back</button>
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.center}>
        {loading && <div className={styles.spinner} aria-label="Loading" role="status" />}
        <button className={styles.bigPlay} onClick={engine.togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={40} fill="currentColor" strokeWidth={0} /> : <Play size={40} fill="currentColor" strokeWidth={0} />}
        </button>
      </div>
      <div className={styles.bottom}>
        <div className={styles.scrubRow}>
          {bubbleSlot}
          <Focusable ariaLabel="Seek bar" onFocus={ping}
            onArrowPress={(dir) => {
              if (dir === 'left') { engine.seekBy(-10); return false; }
              if (dir === 'right') { engine.seekBy(10); return false; }
              return true;
            }}>
            <Scrubber currentTime={displayTime} duration={displayDuration} bufferedEnd={state.bufferedEnd} onScrub={onScrub} onHover={onHover} />
          </Focusable>
        </div>
        <FocusSection className={styles.buttons}>
          <Focusable ariaLabel={playing ? 'Pause' : 'Play'} onFocus={ping} onEnterPress={engine.togglePlay}>
            {playing ? <Pause size={20} fill="currentColor" strokeWidth={0} /> : <Play size={20} fill="currentColor" strokeWidth={0} />}
          </Focusable>
          <Focusable className={styles.icon10} ariaLabel="Rewind 10 seconds" onFocus={ping} onEnterPress={() => engine.seekBy(-10)}>
            <RotateCcw size={22} /><span className={styles.num} aria-hidden="true">10</span>
          </Focusable>
          <Focusable className={styles.icon10} ariaLabel="Forward 10 seconds" onFocus={ping} onEnterPress={() => engine.seekBy(10)}>
            <RotateCw size={22} /><span className={styles.num} aria-hidden="true">10</span>
          </Focusable>
          <div className={styles.volumeGroup}>
            <Focusable ariaLabel={state.muted ? 'Unmute' : 'Mute'} onFocus={ping} onEnterPress={engine.toggleMute}>
              <VolumeIcon muted={state.muted} volume={state.volume} />
            </Focusable>
            <input className={styles.volume} type="range" min={0} max={1} step={0.05} value={state.muted ? 0 : state.volume}
              onChange={(e) => engine.setVolume(Number(e.target.value))} aria-label="Volume" />
          </div>
          <span className={styles.time}>{formatTime(displayTime)} / -{formatTime(remaining)}</span>
          <span className={styles.spacer} />
          {extras}
          <Focusable ariaLabel="Fullscreen" onFocus={ping} onEnterPress={engine.requestFullscreen}>
            <Maximize size={26} />
          </Focusable>
        </FocusSection>
      </div>
    </div>
  );
}
