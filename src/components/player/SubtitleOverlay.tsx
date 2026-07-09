import { useEffect, useState } from 'react';
import { subtitleJsonUrl, parseTrackEvents, activeCueText, cueLines, type SubtitleCue } from '../../lib/jellyfin/subtitles';
import type { SubtitleTrack } from '../../lib/jellyfin/mediaStreams';
import styles from './SubtitleOverlay.module.css';

/**
 * Renders the active subtitle cue as a custom overlay synced to currentTime.
 * We fetch Jellyfin's JSON cue data instead of using a native <track>, because
 * hls.js wipes native track cues on transcoded streams (subtitles never show).
 * Only External (client-side) subs use this; Encode subs are burned into the video.
 */
export default function SubtitleOverlay({
  track, currentTime, serverUrl, token,
}: { track: SubtitleTrack | null; currentTime: number; serverUrl: string; token: string }) {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const url = track ? subtitleJsonUrl(serverUrl, token, track) : null;

  useEffect(() => {
    if (!url) { setCues([]); return; }
    let active = true;
    const ac = new AbortController();
    fetch(url, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (active) setCues(parseTrackEvents(j)); })
      .catch(() => { if (active) setCues([]); });
    return () => { active = false; ac.abort(); };
  }, [url]);

  if (!url || !cues.length) return null;
  const text = activeCueText(cues, currentTime);
  if (!text) return null;
  return (
    <div className={styles.overlay}>
      {cueLines(text).map((line, i) => <div key={i} className={styles.line}>{line}</div>)}
    </div>
  );
}
