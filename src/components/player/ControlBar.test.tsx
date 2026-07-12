import { render, screen, fireEvent } from '@testing-library/react';
import { beforeAll, expect, test, vi } from 'vitest';
import { initFocus } from '../../lib/tv/focus';
import ControlBar from './ControlBar';

beforeAll(() => initFocus());

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

test('loading shows a spinner and forces the Pause icon even while paused', () => {
  const engine = makeEngine({ state: { paused: true, currentTime: 30, duration: 100, bufferedEnd: 30, volume: 1, muted: false, waiting: false, stallCount: 0, readyState: 1 } });
  render(<ControlBar engine={engine} title="X" onBack={() => {}} onScrub={() => {}} onHover={() => {}} menuOpen={false} extras={null} loading />);
  expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Pause' }).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
});

test('scrubber shows the resume position before the video has seeked (currentTime 0)', () => {
  const engine = makeEngine({ state: { paused: true, currentTime: 0, duration: 0, bufferedEnd: 0, volume: 1, muted: false, waiting: false, stallCount: 0, readyState: 0 } });
  render(<ControlBar engine={engine} title="X" onBack={() => {}} onScrub={() => {}} onHover={() => {}} menuOpen={false} extras={null} loading resumeSeconds={600} fallbackDuration={3600} />);
  const slider = screen.getByRole('slider', { name: 'Seek' });
  expect(slider).toHaveAttribute('aria-valuenow', '600');
  expect(slider).toHaveAttribute('aria-valuemax', '3600');
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
