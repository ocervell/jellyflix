import { useToggleFavorite, useToggleWatched } from '../../hooks/api/useItemActions';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './ItemActions.module.css';

export default function ItemActions({ item, size = 'md' }: { item: BaseItemDto; size?: 'sm' | 'md' }) {
  const toggleFavorite = useToggleFavorite();
  const toggleWatched = useToggleWatched();
  const fav = !!item.UserData?.IsFavorite;
  const played = !!item.UserData?.Played;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className={`${styles.actions} ${size === 'sm' ? styles.sm : ''}`}>
      <button
        className={styles.btn}
        aria-label={fav ? 'Remove from My List' : 'Add to My List'}
        onClick={(e) => { stop(e); toggleFavorite(item); }}
      >{fav ? '✓' : '＋'}</button>
      <button
        className={`${styles.btn} ${played ? styles.on : ''}`}
        aria-label={played ? 'Mark unwatched' : 'Mark watched'}
        onClick={(e) => { stop(e); toggleWatched(item); }}
      >{played ? '↺' : '⌾'}</button>
    </div>
  );
}
