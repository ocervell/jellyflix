import { useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useItem } from '../../hooks/api/useItem';
import { getBackdropUrl, getLogoUrl } from '../../lib/jellyfin/images';
import { formatRuntime } from '../../lib/format';
import EpisodeList from './EpisodeList';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './DetailModal.module.css';

export default function DetailModal({
  itemId, onClose, onPlay,
}: { itemId: string; onClose: () => void; onPlay: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const { data: item, isLoading } = useItem(itemId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        {isLoading || !item ? (
          <div className={styles.loading}>Loading…</div>
        ) : (
          <>
            <div className={styles.hero}>
              {getBackdropUrl(api, item, { width: 1280 }) && (
                <img className={styles.heroBg} src={getBackdropUrl(api, item, { width: 1280 })!} alt="" />
              )}
              <div className={styles.heroScrim} />
              <div className={styles.heroContent}>
                {getLogoUrl(api, item)
                  ? <img className={styles.logo} src={getLogoUrl(api, item)!} alt={item.Name ?? ''} />
                  : <h1 className={styles.title}>{item.Name}</h1>}
                <button className={styles.play} onClick={() => onPlay(item)}>▶ Play</button>
              </div>
            </div>
            <div className={styles.body}>
              <div className={styles.metaRow}>
                {item.ProductionYear && <span>{item.ProductionYear}</span>}
                {item.RunTimeTicks ? <span>{formatRuntime(item.RunTimeTicks)}</span> : null}
                {item.OfficialRating && <span className={styles.badge}>{item.OfficialRating}</span>}
              </div>
              {item.Overview && <p className={styles.overview}>{item.Overview}</p>}
              {item.Genres?.length ? <p className={styles.genres}>Genres: {item.Genres.join(', ')}</p> : null}
              {item.Type === 'Series' && item.Id && <EpisodeList seriesId={item.Id} onPlay={onPlay} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
