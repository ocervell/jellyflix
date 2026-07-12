import { useEffect, useState } from 'react';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import type { AudioTrack, SubtitleTrack } from '../../lib/jellyfin/mediaStreams';
import { FocusSection } from '../tv/FocusSection';
import { Focusable } from '../tv/Focusable';
import { useTvBack } from '../../lib/tv/back';
import styles from './TrackMenu.module.css';

const PANEL_FOCUS_KEY = 'track-menu-panel';

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
  useTvBack(() => { if (open) { close(); return true; } return false; }, open);
  useEffect(() => { if (open) setFocus(PANEL_FOCUS_KEY); }, [open]);
  return (
    <div className={styles.wrap}>
      <Focusable ariaLabel="Audio and subtitles" onEnterPress={toggle}>💬</Focusable>
      {open && (
        <FocusSection isBoundary focusKey={PANEL_FOCUS_KEY} className={styles.panel}>
          <div className={styles.col}>
            <h4>Audio</h4>
            {audioTracks.map((t) => (
              <Focusable key={t.index} className={t.index === audioIndex ? styles.active : ''} onEnterPress={() => pickAudio(t.index)}>
                {t.index === audioIndex ? '✓ ' : ''}{t.label}
              </Focusable>
            ))}
          </div>
          <div className={styles.col}>
            <h4>Subtitles</h4>
            <Focusable className={subtitleIndex == null ? styles.active : ''} onEnterPress={() => pickSubtitle(null)}>
              {subtitleIndex == null ? '✓ ' : ''}Off
            </Focusable>
            {subtitleTracks.map((t) => (
              <Focusable key={t.index} className={t.index === subtitleIndex ? styles.active : ''} onEnterPress={() => pickSubtitle(t.index)}>
                {t.index === subtitleIndex ? '✓ ' : ''}{t.label}
              </Focusable>
            ))}
          </div>
        </FocusSection>
      )}
    </div>
  );
}
