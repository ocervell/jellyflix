import styles from './ProgressBar.module.css';

export function ProgressBar({ percent }: { percent: number }) {
  if (percent <= 0) return null;
  return (
    <div className={styles.track} role="progressbar" aria-valuenow={Math.round(percent)}>
      <div className={styles.fill} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}
