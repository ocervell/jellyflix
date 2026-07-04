import { useRef } from 'react';
import PreviewCard from './PreviewCard';
import { nextScrollLeft } from '../../lib/paging';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './Row.module.css';

export default function Row({
  title, items, onOpen, onPlay,
}: { title: string; items: BaseItemDto[]; onOpen: (i: BaseItemDto) => void; onPlay: (i: BaseItemDto) => void }) {
  const stripRef = useRef<HTMLUListElement>(null);
  if (!items.length) return null;
  const page = (dir: 1 | -1) => {
    const el = stripRef.current;
    if (el) el.scrollTo({ left: nextScrollLeft(el, dir), behavior: 'smooth' });
  };
  return (
    <section className={styles.row}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.viewport}>
        <button className={`${styles.arrow} ${styles.left}`} aria-label="Scroll left" onClick={() => page(-1)}>‹</button>
        <ul className={styles.strip} ref={stripRef}>
          {items.map((item) => (
            <li className={styles.cell} key={item.Id}>
              <PreviewCard item={item} onOpen={onOpen} onPlay={onPlay} />
            </li>
          ))}
        </ul>
        <button className={`${styles.arrow} ${styles.right}`} aria-label="Scroll right" onClick={() => page(1)}>›</button>
      </div>
    </section>
  );
}
