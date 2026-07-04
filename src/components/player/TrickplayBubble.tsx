import type { Trickplay } from '../../lib/jellyfin/trickplay';
import { tileForTime } from '../../lib/jellyfin/trickplay';
import { formatTime } from '../../lib/format';
import styles from './TrickplayBubble.module.css';

export default function TrickplayBubble({
  trickplay, serverUrl, token, hover,
}: {
  trickplay: Trickplay | null; serverUrl: string; token: string;
  hover: { seconds: number; x: number } | null;
}) {
  if (!hover) return null;
  const tile = trickplay ? tileForTime(trickplay, serverUrl, token, hover.seconds) : null;
  return (
    <div className={styles.bubble} style={{ left: hover.x }}>
      {tile && (
        <div
          data-testid="trickplay-thumb"
          className={styles.thumb}
          style={{
            width: tile.width, height: tile.height,
            backgroundImage: `url(${tile.imageUrl})`,
            backgroundPosition: `${tile.bgX}px ${tile.bgY}px`,
          }}
        />
      )}
      <span className={styles.time}>{formatTime(hover.seconds)}</span>
    </div>
  );
}
