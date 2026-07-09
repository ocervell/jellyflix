import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import TrackMenu from './TrackMenu';

test('selecting a track calls the handler and auto-closes the menu', () => {
  const onAudio = vi.fn(), onSubtitle = vi.fn(), onOpenChange = vi.fn();
  render(<TrackMenu
    audioTracks={[{ index: 1, label: 'English', isDefault: true }, { index: 2, label: 'Français', isDefault: false }]}
    subtitleTracks={[{ index: 3, label: 'English', isDefault: false, isForced: false }]}
    audioIndex={1} subtitleIndex={3} onAudio={onAudio} onSubtitle={onSubtitle} onOpenChange={onOpenChange} />);
  const open = () => fireEvent.click(screen.getByRole('button', { name: /audio.*subtitle/i }));

  open();
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(onAudio).toHaveBeenCalledWith(2);
  // menu auto-closed on selection: options are gone and open state went false
  expect(screen.queryByRole('button', { name: /^Off$/ })).toBeNull();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);

  open();
  fireEvent.click(screen.getByRole('button', { name: /^Off$/ }));
  expect(onSubtitle).toHaveBeenCalledWith(null);
});
