import { useApi } from '../../hooks/useApi';
import { getCardImageUrl } from '../../lib/jellyfin/images';
import { playedPercent } from '../../lib/format';
import { Img } from '../common/Img';
import { ProgressBar } from '../common/ProgressBar';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './Card.module.css';

export default function Card({ item, onOpen }: { item: BaseItemDto; onOpen: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const src = getCardImageUrl(api, item, { width: 340 });
  const label = item.Name ?? 'Untitled';
  return (
    <button className={styles.card} onClick={() => onOpen(item)} aria-label={label}>
      <div className={styles.frame}>
        <Img src={src} alt={label} />
        {!src && <span className={styles.fallbackTitle}>{label}</span>}
        <ProgressBar percent={playedPercent(item)} />
      </div>
    </button>
  );
}
