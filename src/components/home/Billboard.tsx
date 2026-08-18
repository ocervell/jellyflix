import { Play, Info } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useItem } from '../../hooks/api/useItem';
import { getBackdropUrl, getLogoUrl } from '../../lib/jellyfin/images';
import { cardTitle, isResumable, playedPercent } from '../../lib/format';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './Billboard.module.css';

export default function Billboard({
  item: listItem, onPlay, onMoreInfo,
}: { item: BaseItemDto; onPlay: (i: BaseItemDto) => void; onMoreInfo: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  // Resume/Next-Up list items lack the series-backdrop/logo fallback tags an
  // episode needs; the full item (same call DetailModal uses) carries them.
  const full = useItem(listItem.Id ?? undefined).data;
  const item = full ?? listItem;
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
          <button className={styles.play} onClick={() => onPlay(item)}>
            <Play size={20} fill="currentColor" strokeWidth={0} /> {isResumable(item) ? 'Continue' : 'Play'}
            {isResumable(item) && (
              <span className={styles.playProgress}><span style={{ width: `${playedPercent(item)}%` }} /></span>
            )}
          </button>
          <button className={styles.info} onClick={() => onMoreInfo(item)}><Info size={20} /> More Info</button>
        </div>
      </div>
    </div>
  );
}
