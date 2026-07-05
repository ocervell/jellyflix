import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { parseSearchParams, toSearchParams } from '../../lib/search/query';
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

  return (
    <div className={`${styles.box} ${open ? styles.open : ''}`}>
      <button className={styles.icon} aria-label="Search" onClick={() => setOpen((o) => !o)}>
        <Search size={20} />
      </button>
      {open && (
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          aria-label="Search movies and shows"
          placeholder="Titles, genres…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
        />
      )}
      {open && text && (
        <button className={styles.clear} aria-label="Clear search" onClick={close}><X size={18} /></button>
      )}
    </div>
  );
}
