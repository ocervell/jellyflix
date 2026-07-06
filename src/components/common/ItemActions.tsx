import { Plus, Check, Heart, Circle, CircleCheck } from 'lucide-react';
import { useToggleWatchlist } from '../../hooks/api/useToggleWatchlist';
import { useWatchlist } from '../../hooks/api/useWatchlist';
import { useToggleFavorite, useToggleWatched } from '../../hooks/api/useItemActions';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './ItemActions.module.css';

export default function ItemActions({ item, size = 'md' }: { item: BaseItemDto; size?: 'sm' | 'md' }) {
  const toggleWatchlist = useToggleWatchlist();
  const toggleFavorite = useToggleFavorite();
  const toggleWatched = useToggleWatched();
  const { membership } = useWatchlist();
  const saved = membership.has(item.Id ?? '');
  const fav = !!item.UserData?.IsFavorite;
  const played = !!item.UserData?.Played;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const iconSize = size === 'sm' ? 16 : 19;
  const savedLabel = saved ? 'Remove from Saved for later' : 'Save for later';
  const favLabel = fav ? 'Remove from Favorites' : 'Add to Favorites';
  const watchLabel = played ? 'Mark unwatched' : 'Mark watched';
  return (
    <div className={`${styles.actions} ${size === 'sm' ? styles.sm : ''}`}>
      <button className={styles.btn} aria-label={savedLabel} title={savedLabel}
        onClick={(e) => { stop(e); toggleWatchlist(item); }}>
        {saved ? <Check size={iconSize} /> : <Plus size={iconSize} />}
      </button>
      <button className={`${styles.btn} ${fav ? styles.fav : ''}`} aria-label={favLabel} title={favLabel}
        onClick={(e) => { stop(e); toggleFavorite(item); }}>
        <Heart size={iconSize} fill={fav ? 'currentColor' : 'none'} />
      </button>
      <button className={`${styles.btn} ${played ? styles.on : ''}`} aria-label={watchLabel} title={watchLabel}
        onClick={(e) => { stop(e); toggleWatched(item); }}>
        {played ? <CircleCheck size={iconSize} /> : <Circle size={iconSize} />}
      </button>
    </div>
  );
}
