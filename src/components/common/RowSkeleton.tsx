import styles from './RowSkeleton.module.css';

export default function RowSkeleton({ title }: { title: string }) {
  return (
    <section className={styles.row}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.strip}>
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.tile} />)}
      </div>
    </section>
  );
}
