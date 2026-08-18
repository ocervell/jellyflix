import { Play, ChevronDown } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getCardImageUrl } from '../../lib/jellyfin/images';
import { playedPercent, cardTitle, cardMeta, episodeCode } from '../../lib/format';
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
  const { title, subtitle } = cardTitle(item);
  const fullLabel = subtitle ? `${title} – ${subtitle}` : title;
  // In-progress cards (Continue Watching) show just the title above the progress
  // bar; not-yet-started cards also get the year · rating · seasons/runtime row.
  const inProgress = playedPercent(item) > 0;
  const meta = cardMeta(item);
  return (
    <div className={styles.card}>
      <button className={styles.art} onClick={() => onOpen(item)} aria-label={fullLabel}>
        <Img src={src} alt={fullLabel} />
        {!src && <span className={styles.fallbackTitle}>{title}</span>}
        <div className={styles.info}>
          <div className={styles.infoTitle}>{title}</div>
          {episodeCode(item) && <div className={styles.infoSub}>{episodeCode(item)}</div>}
          {!inProgress && meta.length > 0 && <div className={styles.infoMeta}>{meta.join(' · ')}</div>}
        </div>
        <ProgressBar percent={playedPercent(item)} />
      </button>
      <div className={styles.panel}>
        <div className={styles.actions}>
          <button className={styles.play} onClick={() => onPlay(item)} aria-label={`Play ${fullLabel}`} title="Play">
            <Play size={18} fill="currentColor" strokeWidth={0} />
          </button>
          <button className={styles.more} onClick={() => onOpen(item)} aria-label={`More info ${fullLabel}`} title="More info">
            <ChevronDown size={18} />
          </button>
          <ItemActions item={item} size="sm" />
        </div>
      </div>
    </div>
  );
}
