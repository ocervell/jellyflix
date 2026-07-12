import { useAuth } from '../../hooks/useApi';
import { useScrolled } from '../common/useScrolled';
import { useUserViews } from '../../hooks/api/useUserViews';
import { useLocation, useNavigate } from 'react-router-dom';
import { FocusSection } from '../tv/FocusSection';
import { Focusable } from '../tv/Focusable';
import SearchBox from './SearchBox';
import styles from './TopNav.module.css';

export default function TopNav() {
  const scrolled = useScrolled(80);
  const { logout } = useAuth();
  const { data: views = [] } = useUserViews();
  const location = useLocation();
  const navigate = useNavigate();
  const movies = views.find((v) => v.CollectionType === 'movies');
  const tv = views.find((v) => v.CollectionType === 'tvshows');
  const isActive = (id?: string) => id && location.pathname === `/library/${id}`;

  return (
    <FocusSection as="header" focusKey="topnav" className={scrolled ? `${styles.nav} ${styles.solid}` : styles.nav}>
      <div className={styles.left}>
        <span className={styles.logo}>JELLYFLIX</span>
        <nav className={styles.links}>
          <Focusable ariaLabel="Home" onEnterPress={() => navigate('/')} className={location.pathname === '/' ? styles.active : ''}>Home</Focusable>
          {tv && <Focusable ariaLabel="TV Shows" onEnterPress={() => navigate(`/library/${tv.Id}`)} className={isActive(tv.Id) ? styles.active : ''}>TV Shows</Focusable>}
          {movies && <Focusable ariaLabel="Movies" onEnterPress={() => navigate(`/library/${movies.Id}`)} className={isActive(movies.Id) ? styles.active : ''}>Movies</Focusable>}
        </nav>
      </div>
      <div className={styles.right}>
        <SearchBox />
        <Focusable ariaLabel="Sign out" onEnterPress={logout} className={styles.logout}>Sign out</Focusable>
      </div>
    </FocusSection>
  );
}
