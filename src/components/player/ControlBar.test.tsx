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

test('while loading (duration 0, paused) shows Pause not Play, so autoplay start is obvious', () => {
  const engine = makeEngine({ state: { paused: true, currentTime: 0, duration: 0, bufferedEnd: 0, volume: 1, muted: false, waiting: false, stallCount: 0 } });
  render(<ControlBar engine={engine} title="X" onBack={() => {}} onScrub={() => {}} onHover={() => {}} menuOpen={false} extras={null} />);
  expect(screen.getAllByRole('button', { name: 'Pause' }).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
});

test('paused on a ready video (duration > 0) shows Play', () => {
  const engine = makeEngine({ state: { paused: true, currentTime: 10, duration: 100, bufferedEnd: 20, volume: 1, muted: false, waiting: false, stallCount: 0 } });
  render(<ControlBar engine={engine} title="X" onBack={() => {}} onScrub={() => {}} onHover={() => {}} menuOpen={false} extras={null} />);
  expect(screen.getAllByRole('button', { name: 'Play' }).length).toBeGreaterThan(0);
});

test('volume slider stays in the DOM (hover-reveal) and mute/fullscreen are reachable', () => {
  const engine = makeEngine();
  render(<ControlBar engine={engine} title="X" onBack={() => {}} onScrub={() => {}} onHover={() => {}} menuOpen={false} extras={null} />);
  expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /mute/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /fullscreen/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /rewind/i }));
  expect((engine as never as { seekBy: (n: number) => void }).seekBy).toHaveBeenCalledWith(-10);
});
