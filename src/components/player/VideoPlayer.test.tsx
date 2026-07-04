import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
vi.mock('hls.js', () => ({ default: class { static isSupported() { return false; } static Events = { ERROR: 'hlsError' }; static ErrorTypes = { NETWORK_ERROR: 'net', MEDIA_ERROR: 'media' }; on() {} loadSource() {} attachMedia() {} startLoad() {} recoverMediaError() {} destroy() {} } }));
import VideoPlayer from './VideoPlayer';

test('renders a video element with src for progressive source', () => {
  const { container } = render(
    <VideoPlayer src="http://x/stream.mp4" isHls={false} poster={null} startSeconds={0} onProgress={() => {}} onBack={() => {}} onError={() => {}} />,
  );
  const video = container.querySelector('video');
  expect(video).not.toBeNull();
  expect(video?.getAttribute('src')).toBe('http://x/stream.mp4');
});
