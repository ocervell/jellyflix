import { useAuth } from '../../hooks/useApi';
import { useScrolled } from '../common/useScrolled';
import styles from './TopNav.module.css';

export default function TopNav() {
  const scrolled = useScrolled(80);
  const { logout } = useAuth();
  return (
    <header className={scrolled ? `${styles.nav} ${styles.solid}` : styles.nav}>
      <div className={styles.left}>
        <span className={styles.logo}>JELLYFLIX</span>
        <nav className={styles.links}>
          <a href="#/">Home</a>
          <a href="#/">TV Shows</a>
          <a href="#/">Movies</a>
        </nav>
      </div>
      <button className={styles.logout} onClick={logout}>Sign out</button>
    </header>
  );
}
