import { Play, ChevronDown } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getCardImageUrl } from '../../lib/jellyfin/images';
import { formatRuntime, playedPercent, cardTitle } from '../../lib/format';
import { Img } from '../common/Img';
import { ProgressBar } from '../common/ProgressBar';
import ItemActions from '../common/ItemActions';
import { Focusable } from '../tv/Focusable';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './PreviewCard.module.css';

export default function PreviewCard({
  item, onOpen, onPlay,
}: { item: BaseItemDto; onOpen: (i: BaseItemDto) => void; onPlay: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const src = getCardImageUrl(api, item, { width: 400 });
  const { title, subtitle } = cardTitle(item);
  const fullLabel = subtitle ? `${title} – ${subtitle}` : title;
  return (
    <Focusable
      className={styles.card}
      ariaLabel={fullLabel}
      onEnterPress={() => onOpen(item)}
      onFocus={() => (document.activeElement as HTMLElement | null)?.scrollIntoView({ block: 'nearest', inline: 'center' })}
    >
      <button className={styles.art} onClick={() => onOpen(item)} aria-label={fullLabel}>
        <Img src={src} alt={fullLabel} />
        {!src && <span className={styles.fallbackTitle}>{title}</span>}
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
        <div className={styles.meta}>
          {item.ProductionYear && <span>{item.ProductionYear}</span>}
          {item.RunTimeTicks ? <span>{formatRuntime(item.RunTimeTicks)}</span> : null}
        </div>
        <div className={styles.name}>{title}</div>
        {subtitle && <div className={styles.episode}>{subtitle}</div>}
      </div>
    </Focusable>
  );
}
