import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import TopNav from '../components/nav/TopNav';
import FilterBar from '../components/library/FilterBar';
import PosterGrid from '../components/library/PosterGrid';
import DetailModal from '../components/detail/DetailModal';
import { useSearchItems } from '../hooks/api/useSearchItems';
import { parseSearchParams, toSearchParams, asLibraryQuery, type SearchQuery } from '../lib/search/query';
import type { LibraryQuery } from '../lib/library/query';
import styles from './Search.module.css';

export default function Search() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parseSearchParams(searchParams), [searchParams]);
  const { items, total, fetchNextPage, hasNextPage, isLoading } = useSearchItems(query);
  const [detail, setDetail] = useState<BaseItemDto | null>(null);
  const trimmed = query.q.trim();

  const onChange = useCallback((lq: LibraryQuery) => {
    const next: SearchQuery = { q: query.q, sort: lq.sort, order: lq.order, status: lq.status };
    setSearchParams(toSearchParams(next));
    window.scrollTo({ top: 0 });
  }, [query.q, setSearchParams]);
  const onOpen = useCallback((i: BaseItemDto) => setDetail(i), []);
  const onPlay = useCallback((i: BaseItemDto) => navigate(`/watch/${i.Id}`), [navigate]);

  const focusedOnce = useRef(false);
  useEffect(() => {
    if (trimmed && !isLoading && !focusedOnce.current) {
      focusedOnce.current = true;
      setFocus('poster-grid');
    }
  }, [trimmed, isLoading]);

  return (
    <div className={styles.page}>
      <TopNav />
      <div className={styles.body}>
        {!trimmed ? (
          <p className={styles.prompt}>Search for movies and shows</p>
        ) : (
          <>
            <h1 className={styles.heading}>Results for “{trimmed}”</h1>
            <FilterBar query={asLibraryQuery(query)} genres={[]} decades={[]} facets={false} total={total} onChange={onChange} />
            <PosterGrid
              items={items} loading={isLoading} onOpen={onOpen}
              onLoadMore={fetchNextPage} hasMore={hasNextPage}
              emptyMessage={`No results for “${trimmed}”`}
            />
          </>
        )}
      </div>
      {detail?.Id && <DetailModal itemId={detail.Id} onClose={() => setDetail(null)} onPlay={onPlay} />}
    </div>
  );
}
