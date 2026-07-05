import PosterCard from './PosterCard';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './PosterGrid.module.css';

export default function PosterGrid({
  items, loading, onOpen, onLoadMore, hasMore,
}: {
  items: BaseItemDto[]; loading: boolean; onOpen: (i: BaseItemDto) => void; onLoadMore: () => void; hasMore: boolean;
}) {
  const { sentinelRef } = useInfiniteScroll(onLoadMore, hasMore && !loading);
  if (loading && items.length === 0) {
    return <div className={styles.grid}>{Array.from({ length: 18 }).map((_, i) => <div key={i} className={styles.skeleton} />)}</div>;
  }
  if (!loading && items.length === 0) {
    return <p className={styles.empty}>No titles match these filters.</p>;
  }
  return (
    <>
      <ul className={styles.grid}>
        {items.map((item) => (
          <li key={item.Id}><PosterCard item={item} onOpen={onOpen} /></li>
        ))}
      </ul>
      <div ref={sentinelRef} className={styles.sentinel} aria-hidden />
      {hasMore && <p className={styles.loadingMore}>Loading more…</p>}
    </>
  );
}
