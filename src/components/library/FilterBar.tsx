import { useRef } from 'react';
import Dropdown from './Dropdown';
import { FocusSection } from '../tv/FocusSection';
import { Focusable } from '../tv/Focusable';
import { DEFAULT_QUERY, type LibraryQuery, type SortField, type WatchedStatus } from '../../lib/library/query';
import styles from './FilterBar.module.css';

const SORT_LABELS: Record<SortField, string> = { name: 'Name', dateAdded: 'Date added', year: 'Release year', rating: 'Rating', random: 'Random' };
const STATUS: WatchedStatus[] = ['all', 'unplayed', 'played', 'favorites'];
const STATUS_LABELS: Record<WatchedStatus, string> = { all: 'All', unplayed: 'Unplayed', played: 'Played', favorites: 'Favorites' };

export default function FilterBar({
  query, genres, decades, total, onChange, facets = true,
}: {
  query: LibraryQuery; genres: string[]; decades: number[]; total: number;
  onChange: (q: LibraryQuery) => void; facets?: boolean;
}) {
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const isDefault = JSON.stringify(query) === JSON.stringify(DEFAULT_QUERY);
  const sortSelectRef = useRef<HTMLSelectElement>(null);
  return (
    <FocusSection className={styles.bar}>
      <label className={styles.sort}>Sort by
        <Focusable ariaLabel="Sort by" onEnterPress={() => sortSelectRef.current?.focus()}>
          <select ref={sortSelectRef} aria-label="Sort by" value={query.sort} onChange={(e) => onChange({ ...query, sort: e.target.value as SortField })}>
            {(Object.keys(SORT_LABELS) as SortField[]).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
        </Focusable>
      </label>
      <Focusable className={styles.order} ariaLabel="Toggle sort order"
        onEnterPress={() => onChange({ ...query, order: query.order === 'asc' ? 'desc' : 'asc' })}>
        {query.order === 'asc' ? '↑' : '↓'}
      </Focusable>

      {facets && (
        <>
          <Dropdown label={`Genre${query.genres.length ? ` (${query.genres.length})` : ''}`}>
            {genres.map((g) => (
              <Focusable key={g} onEnterPress={() => onChange({ ...query, genres: toggle(query.genres, g) })}>
                {/* stopPropagation: a click on label text forwards a native click to the
                    checkbox, which would otherwise also bubble up and re-trigger the
                    Focusable's onEnterPress (double toggle). */}
                <label onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={g} checked={query.genres.includes(g)}
                    onChange={() => onChange({ ...query, genres: toggle(query.genres, g) })} />{g}
                </label>
              </Focusable>
            ))}
          </Dropdown>

          <Dropdown label={`Decade${query.decades.length ? ` (${query.decades.length})` : ''}`}>
            {decades.map((d) => (
              <Focusable key={d} onEnterPress={() => onChange({ ...query, decades: toggle(query.decades, d) })}>
                <label onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`${d}s`} checked={query.decades.includes(d)}
                    onChange={() => onChange({ ...query, decades: toggle(query.decades, d) })} />{d}s
                </label>
              </Focusable>
            ))}
          </Dropdown>
        </>
      )}

      <div className={styles.status} role="group" aria-label="Watched status">
        {STATUS.map((s) => (
          <Focusable key={s} ariaLabel={STATUS_LABELS[s]} className={query.status === s ? styles.active : ''}
            onEnterPress={() => onChange({ ...query, status: s })}>{STATUS_LABELS[s]}</Focusable>
        ))}
      </div>

      {!isDefault && <Focusable className={styles.clear} onEnterPress={() => onChange(DEFAULT_QUERY)}>Clear</Focusable>}
      <span className={styles.count}>{total} titles</span>
    </FocusSection>
  );
}
