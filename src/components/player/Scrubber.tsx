import { useRef } from 'react';
import { fractionToTime, pointerFraction } from '../../lib/player/scrubber';
import styles from './Scrubber.module.css';

export default function Scrubber({
  currentTime, duration, bufferedEnd, onScrub, onHover,
}: {
  currentTime: number; duration: number; bufferedEnd: number;
  onScrub: (seconds: number) => void;
  onHover: (info: { seconds: number; x: number } | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = (v: number) => (duration > 0 ? (v / duration) * 100 : 0);
  const at = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return { f: pointerFraction(clientX, rect), x: clientX - rect.left };
  };
  return (
    <div
      ref={ref}
      className={styles.bar}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      tabIndex={0}
      onPointerDown={(e) => { const { f } = at(e.clientX); onScrub(fractionToTime(f, duration)); }}
      onPointerMove={(e) => { const { f, x } = at(e.clientX); onHover({ seconds: fractionToTime(f, duration), x }); }}
      onPointerLeave={() => onHover(null)}
    >
      <div className={styles.track} />
      <div className={styles.buffered} style={{ width: `${pct(bufferedEnd)}%` }} />
      <div className={styles.played} style={{ width: `${pct(currentTime)}%` }} />
      <div className={styles.knob} style={{ left: `${pct(currentTime)}%` }} />
    </div>
  );
}
