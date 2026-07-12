import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { parseSearchParams, toSearchParams } from '../../lib/search/query';
import { Focusable } from '../tv/Focusable';
import { useTvBack } from '../../lib/tv/back';
import styles from './SearchBox.module.css';

const DEBOUNCE_MS = 300;

export default function SearchBox() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const onSearch = location.pathname === '/search';
  const [open, setOpen] = useState(onSearch);
  const [text, setText] = useState(onSearch ? (searchParams.get('q') ?? '') : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const term = text.trim();
      if (!term) return;
      const base = onSearch
        ? parseSearchParams(searchParams)
        : { q: '', sort: 'name' as const, order: 'asc' as const, status: 'all' as const };
      const sp = toSearchParams({ ...base, q: term });
      navigate(`/search?${sp.toString()}`, { replace: onSearch });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
    // Refine on each keystroke; onSearch/searchParams read at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, open]);

  const close = () => {
    clearTimeout(timer.current);
    setOpen(false);
    setText('');
    if (onSearch) navigate('/search', { replace: true });
  };

  // Own Escape while open: the global Back-stack also listens for Escape, so
  // consume it here (return true) to close the search without also firing history.back().
  useTvBack(() => { close(); return true; }, open);

  return (
    <div className={`${styles.box} ${open ? styles.open : ''}`}>
      <Focusable className={styles.icon} ariaLabel="Search" onEnterPress={() => setOpen((o) => !o)}>
        <Search size={20} />
      </Focusable>
      {open && (
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          aria-label="Search movies and shows"
          placeholder="Titles, genres…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {open && text && (
        <Focusable className={styles.clear} ariaLabel="Clear search" onEnterPress={close}><X size={18} /></Focusable>
      )}
    </div>
  );
}
