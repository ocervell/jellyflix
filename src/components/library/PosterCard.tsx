import { useApi } from '../../hooks/useApi';
import { getPosterUrl } from '../../lib/jellyfin/images';
import { playedPercent } from '../../lib/format';
import { Img } from '../common/Img';
import { ProgressBar } from '../common/ProgressBar';
import ItemActions from '../common/ItemActions';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './PosterCard.module.css';

export default function PosterCard({ item, onOpen }: { item: BaseItemDto; onOpen: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const label = item.Name ?? 'Untitled';
  return (
    <div className={styles.card}>
      <button className={styles.hit} onClick={() => onOpen(item)} aria-label={label}>
        <div className={styles.poster}>
          <Img src={getPosterUrl(api, item, { width: 240 })} alt={label} />
          <ProgressBar percent={playedPercent(item)} />
        </div>
        <div className={styles.title}>{label}</div>
        {item.ProductionYear ? <div className={styles.year}>{item.ProductionYear}</div> : null}
      </button>
      <div className={styles.overlay}><ItemActions item={item} size="sm" /></div>
    </div>
  );
}
