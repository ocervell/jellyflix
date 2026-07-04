import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import ControlBar from './ControlBar';

function makeEngine(over = {}) {
  return { videoRef: { current: null }, state: { paused: true, currentTime: 10, duration: 100, bufferedEnd: 20, volume: 1, muted: false, waiting: false, stallCount: 0 },
    play: vi.fn(), pause: vi.fn(), togglePlay: vi.fn(), seek: vi.fn(), seekBy: vi.fn(), setVolume: vi.fn(), toggleMute: vi.fn(), requestFullscreen: vi.fn(), ...over } as never;
}

test('play/pause and skip buttons call the engine', () => {
  const engine = makeEngine();
  render(<ControlBar engine={engine} title="X" onBack={() => {}} onScrub={() => {}} onHover={() => {}} menuOpen={false} extras={null} />);
  fireEvent.click(screen.getAllByRole('button', { name: /play|pause/i })[0]);
  expect((engine as never as { togglePlay: () => void }).togglePlay).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /forward/i }));
  expect((engine as never as { seekBy: (n: number) => void }).seekBy).toHaveBeenCalledWith(10);
});
