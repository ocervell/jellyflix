import { Plus, Check, Circle, CircleCheck } from 'lucide-react';
import { useToggleFavorite, useToggleWatched } from '../../hooks/api/useItemActions';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './ItemActions.module.css';

export default function ItemActions({ item, size = 'md' }: { item: BaseItemDto; size?: 'sm' | 'md' }) {
  const toggleFavorite = useToggleFavorite();
  const toggleWatched = useToggleWatched();
  const fav = !!item.UserData?.IsFavorite;
  const played = !!item.UserData?.Played;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const iconSize = size === 'sm' ? 16 : 19;
  const favLabel = fav ? 'Remove from My List' : 'Add to My List';
  const watchLabel = played ? 'Mark unwatched' : 'Mark watched';
  return (
    <div className={`${styles.actions} ${size === 'sm' ? styles.sm : ''}`}>
      <button
        className={styles.btn}
        aria-label={favLabel}
        title={favLabel}
        onClick={(e) => { stop(e); toggleFavorite(item); }}
      >{fav ? <Check size={iconSize} /> : <Plus size={iconSize} />}</button>
      <button
        className={`${styles.btn} ${played ? styles.on : ''}`}
        aria-label={watchLabel}
        title={watchLabel}
        onClick={(e) => { stop(e); toggleWatched(item); }}
      >{played ? <CircleCheck size={iconSize} /> : <Circle size={iconSize} />}</button>
    </div>
  );
}
