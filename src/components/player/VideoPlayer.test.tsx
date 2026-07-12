import { render } from '@testing-library/react';
import { beforeAll, expect, test, vi, beforeEach } from 'vitest';
vi.mock('hls.js', () => ({ default: class { static isSupported() { return false; } static Events = { ERROR: 'hlsError' }; static ErrorTypes = { NETWORK_ERROR: 'net', MEDIA_ERROR: 'media' }; on() {} loadSource() {} attachMedia() {} startLoad() {} recoverMediaError() {} destroy() {} } }));
import VideoPlayer from './VideoPlayer';
import type { PlaybackSession } from '../../hooks/player/usePlaybackSession';
import { ApiProvider } from '../../hooks/useApi';
import { initFocus } from '../../lib/tv/focus';

beforeAll(() => initFocus());

beforeEach(() => {
  localStorage.setItem('jellyflix.session', JSON.stringify({
    serverUrl: 'http://test',
    accessToken: 'test-token',
    userId: 'test-user',
    userName: 'Test User',
  }));
});

test('renders a video element with src for progressive source', () => {
  const session: PlaybackSession = {
    stream: { url: 'http://x/stream.mp4', isHls: false, startSeconds: 0 },
    error: null,
    playId: 'test-play-id',
    playSessionId: 'test-session-id',
    audioTracks: [],
    subtitleTracks: [],
    mediaSource: null,
    bandwidth: 0,
    currentBitrate: 0,
    isTranscoding: false,
    positionBaseSeconds: 0,
    setAudioTrack: vi.fn(),
    setSubtitleTrack: vi.fn(),
    renegotiate: vi.fn(),
  };
  const { container } = render(
    <ApiProvider>
      <VideoPlayer session={session} poster={null} title="" onProgress={() => {}} onBack={() => {}} />
    </ApiProvider>,
  );
  const video = container.querySelector('video');
  expect(video).not.toBeNull();
  expect(video?.src).toContain('http://x/stream.mp4');
});
