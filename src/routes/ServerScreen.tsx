import { useEffect, useRef, useState } from 'react';
import { Focusable } from '../components/tv/Focusable';
import { normalizeServerUrl, probeServer, saveServer } from '../lib/tv/server';
import styles from './Login.module.css';

// TV-build first-run screen: capture and validate the Jellyfin server URL.
// Reuses the Login card styling for consistency.
export default function ServerScreen({ initial = '', onConnected }: {
  initial?: string;
  onConnected: (url: string) => void;
}) {
  const [url, setUrl] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function connect() {
    if (busy) return;
    const normalized = normalizeServerUrl(url);
    if (!normalized) { setError('Enter a full URL, e.g. http://192.168.1.10:8096'); return; }
    setBusy(true); setError('');
    try {
      if (!(await probeServer(normalized))) {
        setError("Couldn't reach a Jellyfin server at that address.");
        return;
      }
      saveServer(normalized);
      onConnected(normalized);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); void connect(); }
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={(e) => { e.preventDefault(); void connect(); }}>
        <h1 className={styles.brand}>JELLYFLIX</h1>
        {error && <p className={styles.error}>{error}</p>}
        <label>Jellyfin server
          <input
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="http://192.168.1.10:8096"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <Focusable ariaLabel="Connect" className={`${styles.submit} ${busy ? styles.busy : ''}`} onEnterPress={() => void connect()}>
          {busy ? <><span className={styles.spinner} aria-hidden="true" />Connecting…</> : 'Connect'}
        </Focusable>
      </form>
    </div>
  );
}
