import Dropdown from './Dropdown';
import { DEFAULT_QUERY, type LibraryQuery, type SortField, type WatchedStatus } from '../../lib/library/query';
import styles from './FilterBar.module.css';

const SORT_LABELS: Record<SortField, string> = { name: 'Name', dateAdded: 'Date added', year: 'Release year', rating: 'Rating', random: 'Random' };
const STATUS: WatchedStatus[] = ['all', 'unplayed', 'played', 'favorites'];
const STATUS_LABELS: Record<WatchedStatus, string> = { all: 'All', unplayed: 'Unplayed', played: 'Played', favorites: 'Favorites' };

export default function FilterBar({
  query, genres, decades, total, onChange,
}: {
  query: LibraryQuery; genres: string[]; decades: number[]; total: number; onChange: (q: LibraryQuery) => void;
}) {
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const isDefault = JSON.stringify(query) === JSON.stringify(DEFAULT_QUERY);
  return (
    <div className={styles.bar}>
      <label className={styles.sort}>Sort by
        <select aria-label="Sort by" value={query.sort} onChange={(e) => onChange({ ...query, sort: e.target.value as SortField })}>
          {(Object.keys(SORT_LABELS) as SortField[]).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
        </select>
      </label>
      <button className={styles.order} aria-label="Toggle sort order"
        onClick={() => onChange({ ...query, order: query.order === 'asc' ? 'desc' : 'asc' })}>
        {query.order === 'asc' ? '↑' : '↓'}
      </button>

      <Dropdown label={`Genre${query.genres.length ? ` (${query.genres.length})` : ''}`}>
        {genres.map((g) => (
          <label key={g}><input type="checkbox" aria-label={g} checked={query.genres.includes(g)}
            onChange={() => onChange({ ...query, genres: toggle(query.genres, g) })} />{g}</label>
        ))}
      </Dropdown>

      <Dropdown label={`Decade${query.decades.length ? ` (${query.decades.length})` : ''}`}>
        {decades.map((d) => (
          <label key={d}><input type="checkbox" aria-label={`${d}s`} checked={query.decades.includes(d)}
            onChange={() => onChange({ ...query, decades: toggle(query.decades, d) })} />{d}s</label>
        ))}
      </Dropdown>

      <div className={styles.status} role="group" aria-label="Watched status">
        {STATUS.map((s) => (
          <button key={s} aria-label={STATUS_LABELS[s]} className={query.status === s ? styles.active : ''}
            onClick={() => onChange({ ...query, status: s })}>{STATUS_LABELS[s]}</button>
        ))}
      </div>

      {!isDefault && <button className={styles.clear} onClick={() => onChange(DEFAULT_QUERY)}>Clear</button>}
      <span className={styles.count}>{total} titles</span>
    </div>
  );
}
