import { Play, Info } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getBackdropUrl, getLogoUrl } from '../../lib/jellyfin/images';
import { cardTitle } from '../../lib/format';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './Billboard.module.css';

export default function Billboard({
  item, onPlay, onMoreInfo,
}: { item: BaseItemDto; onPlay: (i: BaseItemDto) => void; onMoreInfo: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const backdrop = getBackdropUrl(api, item, { width: 1920 });
  const logo = getLogoUrl(api, item);
  const { title, subtitle } = cardTitle(item);
  return (
    <div className={styles.billboard}>
      {backdrop && <img className={styles.bg} src={backdrop} alt="" />}
      <div className={styles.scrim} />
      <div className={styles.content}>
        {logo
          ? <img className={styles.logo} src={logo} alt={title} />
          : <h1 className={styles.title}>{title}</h1>}
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {item.Overview && <p className={styles.synopsis}>{item.Overview}</p>}
        <div className={styles.buttons}>
          <button className={styles.play} onClick={() => onPlay(item)}><Play size={20} fill="currentColor" /> Play</button>
          <button className={styles.info} onClick={() => onMoreInfo(item)}><Info size={20} /> More Info</button>
        </div>
      </div>
    </div>
  );
}
