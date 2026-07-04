import { useState } from 'react';
import styles from './Img.module.css';

export function Img({ src, alt }: { src: string | null; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  if (!src) return <div className={styles.placeholder} aria-label={alt} role="img" />;
  return (
    <img
      className={loaded ? `${styles.img} ${styles.loaded}` : styles.img}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
    />
  );
}
