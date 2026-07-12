import { useEffect, useRef, useState } from 'react';
import { FocusSection } from '../tv/FocusSection';
import { Focusable } from '../tv/Focusable';
import { useTvBack } from '../../lib/tv/back';
import styles from './Dropdown.module.css';

export default function Dropdown({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  // Escape/Back is owned by the global TvBack stack, not a local window listener.
  useTvBack(() => { if (open) { setOpen(false); return true; } return false; }, open);
  return (
    <div className={styles.wrap} ref={ref}>
      <Focusable className={styles.trigger} ariaLabel={label} onEnterPress={() => setOpen((o) => !o)}>
        {label} ▾
      </Focusable>
      {open && (
        <FocusSection isBoundary className={styles.menu}>
          <div role="menu">{children}</div>
        </FocusSection>
      )}
    </div>
  );
}
