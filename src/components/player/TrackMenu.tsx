import { useState } from 'react';
import type { AudioTrack, SubtitleTrack } from '../../lib/jellyfin/mediaStreams';
import styles from './TrackMenu.module.css';

export default function TrackMenu({
  audioTracks, subtitleTracks, audioIndex, subtitleIndex, onAudio, onSubtitle, onOpenChange,
}: {
  audioTracks: AudioTrack[]; subtitleTracks: SubtitleTrack[];
  audioIndex?: number; subtitleIndex?: number;
  onAudio: (index: number) => void; onSubtitle: (index: number | null) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = () => { const n = !open; setOpen(n); onOpenChange(n); };
  // Close the menu when a track is picked so it's obvious the choice registered.
  const close = () => { setOpen(false); onOpenChange(false); };
  const pickAudio = (index: number) => { onAudio(index); close(); };
  const pickSubtitle = (index: number | null) => { onSubtitle(index); close(); };
  return (
    <div className={styles.wrap}>
      <button onClick={toggle} aria-label="Audio and subtitles" aria-expanded={open}>💬</button>
      {open && (
        <div className={styles.panel} role="menu">
          <div className={styles.col}>
            <h4>Audio</h4>
            {audioTracks.map((t) => (
              <button key={t.index} className={t.index === audioIndex ? styles.active : ''} onClick={() => pickAudio(t.index)}>
                {t.index === audioIndex ? '✓ ' : ''}{t.label}
              </button>
            ))}
          </div>
          <div className={styles.col}>
            <h4>Subtitles</h4>
            <button className={subtitleIndex == null ? styles.active : ''} onClick={() => pickSubtitle(null)}>
              {subtitleIndex == null ? '✓ ' : ''}Off
            </button>
            {subtitleTracks.map((t) => (
              <button key={t.index} className={t.index === subtitleIndex ? styles.active : ''} onClick={() => pickSubtitle(t.index)}>
                {t.index === subtitleIndex ? '✓ ' : ''}{t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
