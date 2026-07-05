import { Play, ChevronDown } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getCardImageUrl } from '../../lib/jellyfin/images';
import { formatRuntime, playedPercent } from '../../lib/format';
import { Img } from '../common/Img';
import { ProgressBar } from '../common/ProgressBar';
import ItemActions from '../common/ItemActions';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './PreviewCard.module.css';

export default function PreviewCard({
  item, onOpen, onPlay,
}: { item: BaseItemDto; onOpen: (i: BaseItemDto) => void; onPlay: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const src = getCardImageUrl(api, item, { width: 400 });
  const label = item.Name ?? 'Untitled';
  return (
    <div className={styles.card}>
      <button className={styles.art} onClick={() => onOpen(item)} aria-label={label}>
        <Img src={src} alt={label} />
        {!src && <span className={styles.fallbackTitle}>{label}</span>}
        <ProgressBar percent={playedPercent(item)} />
      </button>
      <div className={styles.panel}>
        <div className={styles.actions}>
          <button className={styles.play} onClick={() => onPlay(item)} aria-label={`Play ${label}`} title="Play">
            <Play size={18} fill="currentColor" />
          </button>
          <button className={styles.more} onClick={() => onOpen(item)} aria-label={`More info ${label}`} title="More info">
            <ChevronDown size={18} />
          </button>
          <ItemActions item={item} size="sm" />
        </div>
        <div className={styles.meta}>
          {item.ProductionYear && <span>{item.ProductionYear}</span>}
          {item.RunTimeTicks ? <span>{formatRuntime(item.RunTimeTicks)}</span> : null}
        </div>
        <div className={styles.name}>{label}</div>
      </div>
    </div>
  );
}
