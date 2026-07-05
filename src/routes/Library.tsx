import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import TopNav from '../components/nav/TopNav';
import FilterBar from '../components/library/FilterBar';
import PosterGrid from '../components/library/PosterGrid';
import DetailModal from '../components/detail/DetailModal';
import { useUserViews } from '../hooks/api/useUserViews';
import { useLibraryItems } from '../hooks/api/useLibraryItems';
import { useLibraryFilters } from '../hooks/api/useLibraryFilters';
import { parseParams, toParams, type LibraryQuery } from '../lib/library/query';
import styles from './Library.module.css';

function itemTypesFor(collectionType?: string | null): string[] {
  return collectionType === 'tvshows' ? ['Series'] : ['Movie'];
}

export default function Library() {
  const { viewId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parseParams(searchParams), [searchParams]);
  const { data: views = [] } = useUserViews();
  const view = views.find((v) => v.Id === viewId);
  const includeItemTypes = itemTypesFor(view?.CollectionType);
  const viewCtx = { id: viewId, includeItemTypes };

  const { items, total, fetchNextPage, hasNextPage, isLoading } = useLibraryItems(query, viewCtx);
  const { genres, decades } = useLibraryFilters(viewCtx);
  const [detail, setDetail] = useState<BaseItemDto | null>(null);

  const onChange = useCallback((q: LibraryQuery) => { setSearchParams(toParams(q)); window.scrollTo({ top: 0 }); }, [setSearchParams]);
  const onOpen = useCallback((i: BaseItemDto) => setDetail(i), []);
  const onPlay = useCallback((i: BaseItemDto) => navigate(`/watch/${i.Id}`), [navigate]);

  return (
    <div className={styles.page}>
      <TopNav />
      <div className={styles.body}>
        <h1 className={styles.heading}>{view?.Name ?? 'Library'}</h1>
        <FilterBar query={query} genres={genres} decades={decades} total={total} onChange={onChange} />
        <PosterGrid items={items} loading={isLoading} onOpen={onOpen} onLoadMore={fetchNextPage} hasMore={hasNextPage} />
      </div>
      {detail?.Id && <DetailModal itemId={detail.Id} onClose={() => setDetail(null)} onPlay={onPlay} />}
    </div>
  );
}
