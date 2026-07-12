import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import TopNav from '../components/nav/TopNav';
import Billboard from '../components/home/Billboard';
import Row from '../components/row/Row';
import RowSkeleton from '../components/common/RowSkeleton';
import DetailModal from '../components/detail/DetailModal';
import { FocusSection } from '../components/tv/FocusSection';
import { useUserViews } from '../hooks/api/useUserViews';
import { useResumeItems } from '../hooks/api/useResumeItems';
import { useNextUp } from '../hooks/api/useNextUp';
import { useLatestMedia } from '../hooks/api/useLatestMedia';
import { useFavorites } from '../hooks/api/useFavorites';
import { useWatchlist } from '../hooks/api/useWatchlist';
import { useHotNow } from '../hooks/api/useHotNow';
import { useRecentlyAdded } from '../hooks/api/useRecentlyAdded';
import styles from './Home.module.css';

function LatestRow({ view, onOpen, onPlay }: { view: BaseItemDto; onOpen: (i: BaseItemDto) => void; onPlay: (i: BaseItemDto) => void }) {
  const { data = [] } = useLatestMedia(view.Id ?? '');
  return <Row title={`Latest ${view.Name}`} items={data} onOpen={onOpen} onPlay={onPlay} />;
}

export default function Home() {
  const navigate = useNavigate();
  const { data: views = [] } = useUserViews();
  const resumeQ = useResumeItems();
  const nextUpQ = useNextUp();
  const favoritesQ = useFavorites();
  const watchlist = useWatchlist();
  const hotQ = useHotNow();
  const recentQ = useRecentlyAdded();
  const [detail, setDetail] = useState<BaseItemDto | null>(null); // Task 13 renders DetailModal from this

  const mediaViews = useMemo(
    () => views.filter((v) => v.CollectionType === 'movies' || v.CollectionType === 'tvshows'),
    [views],
  );
  const hero = resumeQ.data?.[0] ?? nextUpQ.data?.[0] ?? undefined;

  const onOpen = (i: BaseItemDto) => setDetail(i);
  const onPlay = (i: BaseItemDto) => navigate(`/watch/${i.Id}`);

  const focusedOnce = useRef(false);
  const rowsLoaded = !resumeQ.isLoading && !nextUpQ.isLoading && !hotQ.isLoading && !recentQ.isLoading;
  useEffect(() => {
    if (rowsLoaded && !focusedOnce.current) {
      focusedOnce.current = true;
      setFocus('home');
    }
  }, [rowsLoaded]);

  return (
    <div className={styles.page}>
      <TopNav />
      {hero && <Billboard item={hero} onPlay={onPlay} onMoreInfo={onOpen} />}
      <FocusSection as="div" className={styles.rows} focusKey="home">
        {resumeQ.isLoading ? <RowSkeleton title="Continue Watching" /> : <Row title="Continue Watching" items={resumeQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
        {nextUpQ.isLoading ? <RowSkeleton title="Next Up" /> : <Row title="Next Up" items={nextUpQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
        {hotQ.isLoading ? <RowSkeleton title="Hot right now" /> : <Row title="Hot right now" items={hotQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
        {recentQ.isLoading ? <RowSkeleton title="Recently added" /> : <Row title="Recently added" items={recentQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />}
        <Row title="Saved for later" items={watchlist.items} onOpen={onOpen} onPlay={onPlay} />
        {mediaViews.map((v) => <LatestRow key={v.Id} view={v} onOpen={onOpen} onPlay={onPlay} />)}
        <Row title="Favorites" items={favoritesQ.data ?? []} onOpen={onOpen} onPlay={onPlay} />
      </FocusSection>
      {detail?.Id && (
        <DetailModal itemId={detail.Id} onClose={() => setDetail(null)} onPlay={onPlay} />
      )}
    </div>
  );
}
