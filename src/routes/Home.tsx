import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import TopNav from '../components/nav/TopNav';
import Billboard from '../components/home/Billboard';
import Row from '../components/row/Row';
import { useUserViews } from '../hooks/api/useUserViews';
import { useResumeItems } from '../hooks/api/useResumeItems';
import { useNextUp } from '../hooks/api/useNextUp';
import { useLatestMedia } from '../hooks/api/useLatestMedia';
import styles from './Home.module.css';

function LatestRow({ view, onOpen, onPlay }: { view: BaseItemDto; onOpen: (i: BaseItemDto) => void; onPlay: (i: BaseItemDto) => void }) {
  const { data = [] } = useLatestMedia(view.Id ?? '');
  return <Row title={`Latest ${view.Name}`} items={data} onOpen={onOpen} onPlay={onPlay} />;
}

export default function Home() {
  const navigate = useNavigate();
  const { data: views = [] } = useUserViews();
  const { data: resume = [] } = useResumeItems();
  const { data: nextUp = [] } = useNextUp();
  const [_detail, setDetail] = useState<BaseItemDto | null>(null); // Task 13 renders DetailModal from this

  const mediaViews = useMemo(
    () => views.filter((v) => v.CollectionType === 'movies' || v.CollectionType === 'tvshows'),
    [views],
  );
  const hero = resume[0] ?? nextUp[0] ?? undefined;

  const onOpen = (i: BaseItemDto) => setDetail(i);
  const onPlay = (i: BaseItemDto) => navigate(`/watch/${i.Id}`);

  return (
    <div className={styles.page}>
      <TopNav />
      {hero && <Billboard item={hero} onPlay={onPlay} onMoreInfo={onOpen} />}
      <div className={styles.rows}>
        <Row title="Continue Watching" items={resume} onOpen={onOpen} onPlay={onPlay} />
        <Row title="Next Up" items={nextUp} onOpen={onOpen} onPlay={onPlay} />
        {mediaViews.map((v) => <LatestRow key={v.Id} view={v} onOpen={onOpen} onPlay={onPlay} />)}
      </div>
      {/* Task 13: {detail && <DetailModal itemId={detail.Id} onClose={() => setDetail(null)} onPlay={onPlay} />} */}
    </div>
  );
}
