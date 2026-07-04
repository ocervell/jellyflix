import { render, act } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
vi.mock('hls.js', () => ({ default: class { static isSupported() { return false; } destroy() {} } }));
import { useVideoEngine } from './useVideoEngine';

function Probe({ src }: { src: string }) {
  const eng = useVideoEngine({ src, isHls: false, startSeconds: 0, onError: () => {} });
  return <video ref={eng.videoRef} data-testid="v" data-paused={eng.state.paused} />;
}

test('attaches progressive src to the video element', () => {
  const { getByTestId } = render(<Probe src="http://x/stream.mp4" />);
  const v = getByTestId('v') as HTMLVideoElement;
  expect(v.getAttribute('src')).toBe('http://x/stream.mp4');
});

test('togglePlay + seekBy operate on the element', () => {
  let eng: ReturnType<typeof useVideoEngine> | null = null;
  function P() { eng = useVideoEngine({ src: 'http://x/a.mp4', isHls: false, startSeconds: 0, onError: () => {} }); return <video ref={eng.videoRef} />; }
  render(<P />);
  const v = document.querySelector('video')!;
  Object.defineProperty(v, 'duration', { value: 100, configurable: true });
  act(() => eng!.seek(30));
  expect(v.currentTime).toBe(30);
  act(() => eng!.seekBy(10));
  expect(v.currentTime).toBe(40);
});
