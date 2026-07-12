import { useEffect, useState } from 'react';
import { Play, Tv } from 'lucide-react';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useApi } from '../../hooks/useApi';
import { useItem } from '../../hooks/api/useItem';
import { getBackdropUrl, getLogoUrl } from '../../lib/jellyfin/images';
import { formatRuntime, cardTitle, isResumable, playedPercent } from '../../lib/format';
import EpisodeList from './EpisodeList';
import ItemActions from '../common/ItemActions';
import { FocusSection } from '../tv/FocusSection';
import { Focusable } from '../tv/Focusable';
import { useTvBack } from '../../lib/tv/back';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './DetailModal.module.css';

export default function DetailModal({
  itemId, onClose, onPlay,
}: { itemId: string; onClose: () => void; onPlay: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  // The modal can navigate from an episode to its series in place, so track which
  // item is shown independently of the prop. Reset when opened on a different item.
  const [id, setId] = useState(itemId);
  useEffect(() => { setId(itemId); }, [itemId]);
  const { data: item, isLoading } = useItem(id);

  useTvBack(() => { onClose(); return true; }, true);
  useEffect(() => { if (item) setFocus('detail-play'); }, [item]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <FocusSection isBoundary focusKey="detail-modal" className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <Focusable className={styles.close} ariaLabel="Close" onEnterPress={onClose}>✕</Focusable>
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
                  ? <img className={styles.logo} src={getLogoUrl(api, item)!} alt={cardTitle(item).title} />
                  : <h1 className={styles.title}>{cardTitle(item).title}</h1>}
                {cardTitle(item).subtitle && <div className={styles.episode}>{cardTitle(item).subtitle}</div>}
                {/* series/season·episode for episodes; empty for movies/series */}
                <div className={styles.heroButtons}>
                  <Focusable focusKey="detail-play" className={styles.play}
                    ariaLabel={isResumable(item) ? 'Continue' : 'Play'} onEnterPress={() => onPlay(item)}>
                    <Play size={20} fill="currentColor" strokeWidth={0} /> {isResumable(item) ? 'Continue' : 'Play'}
                    {isResumable(item) && (
                      <span className={styles.playProgress}><span style={{ width: `${playedPercent(item)}%` }} /></span>
                    )}
                  </Focusable>
                  {item.Type === 'Episode' && item.SeriesId && (
                    <Focusable className={styles.series}
                      ariaLabel={item.SeriesName ? `Go to ${item.SeriesName}` : 'Go to series'}
                      onEnterPress={() => setId(item.SeriesId!)}>
                      <Tv size={18} /> {item.SeriesName ? `Go to ${item.SeriesName}` : 'Go to series'}
                    </Focusable>
                  )}
                  <FocusSection focusKey="detail-actions"><ItemActions item={item} size="md" /></FocusSection>
                </div>
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
              {item.Type === 'Series' && item.Id && <EpisodeList seriesId={item.Id} onPlay={onPlay} onSelect={setId} />}
            </div>
          </>
        )}
      </FocusSection>
    </div>
  );
}
