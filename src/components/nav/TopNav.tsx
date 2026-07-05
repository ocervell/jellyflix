import { useAuth } from '../../hooks/useApi';
import { useScrolled } from '../common/useScrolled';
import { useUserViews } from '../../hooks/api/useUserViews';
import { useLocation } from 'react-router-dom';
import styles from './TopNav.module.css';

export default function TopNav() {
  const scrolled = useScrolled(80);
  const { logout } = useAuth();
  const { data: views = [] } = useUserViews();
  const location = useLocation();
  const movies = views.find((v) => v.CollectionType === 'movies');
  const tv = views.find((v) => v.CollectionType === 'tvshows');
  const isActive = (id?: string) => id && location.pathname === `/library/${id}`;

  return (
    <header className={scrolled ? `${styles.nav} ${styles.solid}` : styles.nav}>
      <div className={styles.left}>
        <span className={styles.logo}>JELLYFLIX</span>
        <nav className={styles.links}>
          <a href="#/" className={location.pathname === '/' ? styles.active : ''}>Home</a>
          {tv && <a href={`#/library/${tv.Id}`} className={isActive(tv.Id) ? styles.active : ''}>TV Shows</a>}
          {movies && <a href={`#/library/${movies.Id}`} className={isActive(movies.Id) ? styles.active : ''}>Movies</a>}
        </nav>
      </div>
      <button className={styles.logout} onClick={logout}>Sign out</button>
    </header>
  );
}
