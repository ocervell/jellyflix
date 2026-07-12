import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useApi';
import { Focusable } from '../components/tv/Focusable';
import styles from './Login.module.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function doLogin() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Incorrect username or password.');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void doLogin();
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={onSubmit}>
        <h1 className={styles.brand}>JELLYFLIX</h1>
        {error && <p className={styles.error}>{error}</p>}
        <label>Username
          <input ref={inputRef} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <Focusable ariaLabel="Sign In" className={`${styles.submit} ${busy ? styles.busy : ''}`} onEnterPress={() => void doLogin()}>
          {busy ? <><span className={styles.spinner} aria-hidden="true" />Signing in…</> : 'Sign In'}
        </Focusable>
      </form>
    </div>
  );
}
