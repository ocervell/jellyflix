import { Plus, Check, Heart, Circle, CircleCheck } from 'lucide-react';
import { useToggleWatchlist } from '../../hooks/api/useToggleWatchlist';
import { useWatchlist } from '../../hooks/api/useWatchlist';
import { useToggleFavorite, useToggleWatched } from '../../hooks/api/useItemActions';
import { getGroupMembers } from '../../lib/rowGrouping';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './ItemActions.module.css';

export default function ItemActions({ item, size = 'md' }: { item: BaseItemDto; size?: 'sm' | 'md' }) {
  const toggleWatchlist = useToggleWatchlist();
  const toggleFavorite = useToggleFavorite();
  const toggleWatched = useToggleWatched();
  const { membership } = useWatchlist();

  const members = getGroupMembers(item);
  const isSaved = (i: BaseItemDto) => membership.has(i.Id ?? '');

  // Grouped cards derive their state from their member episodes and fan each
  // toggle over the members whose state doesn't already match the target, so a
  // single click drives the whole group.
  const saved = members ? members.some(isSaved) : isSaved(item);
  const fav = members ? members.some((m) => !!m.UserData?.IsFavorite) : !!item.UserData?.IsFavorite;
  const played = members
    ? members.length > 0 && members.every((m) => !!m.UserData?.Played)
    : !!item.UserData?.Played;

  const onSave = () => {
    if (!members) { toggleWatchlist(item); return; }
    const target = !saved;
    members.filter((m) => isSaved(m) !== target).forEach((m) => toggleWatchlist(m));
  };
  const onFav = () => {
    if (!members) { toggleFavorite(item); return; }
    const target = !fav;
    members.filter((m) => Boolean(m.UserData?.IsFavorite) !== target).forEach((m) => toggleFavorite(m));
  };
  const onWatched = () => {
    if (!members) { toggleWatched(item); return; }
    const target = !played;
    members.filter((m) => Boolean(m.UserData?.Played) !== target).forEach((m) => toggleWatched(m));
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const iconSize = size === 'sm' ? 16 : 19;
  const savedLabel = saved ? 'Remove from Saved for later' : 'Save for later';
  const favLabel = fav ? 'Remove from Favorites' : 'Add to Favorites';
  const watchLabel = played ? 'Mark unwatched' : 'Mark watched';
  return (
    <div className={`${styles.actions} ${size === 'sm' ? styles.sm : ''}`}>
      <button className={styles.btn} aria-label={savedLabel} title={savedLabel}
        onClick={(e) => { stop(e); onSave(); }}>
        {saved ? <Check size={iconSize} /> : <Plus size={iconSize} />}
      </button>
      <button className={`${styles.btn} ${fav ? styles.fav : ''}`} aria-label={favLabel} title={favLabel}
        onClick={(e) => { stop(e); onFav(); }}>
        <Heart size={iconSize} fill={fav ? 'currentColor' : 'none'} />
      </button>
      <button className={`${styles.btn} ${played ? styles.on : ''}`} aria-label={watchLabel} title={watchLabel}
        onClick={(e) => { stop(e); onWatched(); }}>
        {played ? <CircleCheck size={iconSize} /> : <Circle size={iconSize} />}
      </button>
    </div>
  );
}
