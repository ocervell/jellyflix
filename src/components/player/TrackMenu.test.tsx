import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import TrackMenu from './TrackMenu';

test('selecting an audio track and Off subtitles calls handlers', () => {
  const onAudio = vi.fn(), onSubtitle = vi.fn();
  render(<TrackMenu
    audioTracks={[{ index: 1, label: 'English', isDefault: true }, { index: 2, label: 'Français', isDefault: false }]}
    subtitleTracks={[{ index: 3, label: 'English', isDefault: false, isForced: false }]}
    audioIndex={1} subtitleIndex={3} onAudio={onAudio} onSubtitle={onSubtitle} onOpenChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /audio.*subtitle/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(onAudio).toHaveBeenCalledWith(2);
  fireEvent.click(screen.getByRole('button', { name: /^Off$/ }));
  expect(onSubtitle).toHaveBeenCalledWith(null);
});
