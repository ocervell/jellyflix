import Card from './Card';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import styles from './Row.module.css';

export default function Row({
  title, items, onOpen,
}: { title: string; items: BaseItemDto[]; onOpen: (i: BaseItemDto) => void }) {
  if (!items.length) return null;
  return (
    <section className={styles.row}>
      <h2 className={styles.title}>{title}</h2>
      <ul className={styles.strip}>
        {items.map((item) => (
          <li className={styles.cell} key={item.Id}>
            <Card item={item} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}
