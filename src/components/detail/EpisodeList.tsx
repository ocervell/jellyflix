import { useEffect, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useSeasons } from '../../hooks/api/useSeasons';
import { useEpisodes } from '../../hooks/api/useEpisodes';
import { getCardImageUrl } from '../../lib/jellyfin/images';
import { formatRuntime, playedPercent } from '../../lib/format';
import { Img } from '../common/Img';
import { ProgressBar } from '../common/ProgressBar';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './EpisodeList.module.css';

export default function EpisodeList({ seriesId, onPlay }: { seriesId: string; onPlay: (i: BaseItemDto) => void }) {
  const { api } = useApi();
  const { data: seasons = [] } = useSeasons(seriesId);
  const [seasonId, setSeasonId] = useState<string | undefined>();
  useEffect(() => { if (!seasonId && seasons[0]?.Id) setSeasonId(seasons[0].Id); }, [seasons, seasonId]);
  const { data: episodes = [] } = useEpisodes(seriesId, seasonId);

  return (
    <div className={styles.wrap}>
      {seasons.length > 1 && (
        <select className={styles.season} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          {seasons.map((s) => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
        </select>
      )}
      <ul className={styles.list}>
        {episodes.map((ep) => {
          const watched = !!ep.UserData?.Played;
          return (
            <li key={ep.Id}>
              <button className={styles.ep} onClick={() => onPlay(ep)}>
                <span className={styles.idx}>{ep.IndexNumber}</span>
                <span className={`${styles.thumb} ${watched ? styles.thumbWatched : ''}`}>
                  <Img src={getCardImageUrl(api, ep, { width: 200 })} alt={ep.Name ?? ''} />
                  {watched
                    ? <span className={styles.check} aria-label="Watched"><CircleCheck size={22} strokeWidth={2.5} /></span>
                    : <ProgressBar percent={playedPercent(ep)} />}
                </span>
                <span className={styles.info}>
                  <span className={styles.epTitle}>{ep.Name} <span className={styles.rt}>{formatRuntime(ep.RunTimeTicks)}</span></span>
                  <span className={styles.overview}>{ep.Overview}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
