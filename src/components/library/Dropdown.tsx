import { useEffect, useRef, useState } from 'react';
import styles from './Dropdown.module.css';

export default function Dropdown({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{label} ▾</button>
      {open && <div className={styles.menu} role="menu">{children}</div>}
    </div>
  );
}
