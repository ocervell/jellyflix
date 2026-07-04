import { render, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

let itemData: BaseItemDto | undefined;

// Mirror useApi's real memoization: the same api/session references across
// renders, so effect deps stay stable (as they do via useMemo in production).
const mockApi = {};
const mockSession = { userId: 'u', serverUrl: '/jf', accessToken: 't' };
vi.mock('../hooks/useApi', () => ({
  useApi: () => ({ api: mockApi, session: mockSession }),
}));
vi.mock('../hooks/api/useItem', () => ({ useItem: () => ({ data: itemData }) }));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ itemId: 'm1' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../lib/jellyfin/device', () => ({ getDeviceId: () => 'dev' }));
vi.mock('../lib/jellyfin/images', () => ({ getBackdropUrl: () => null }));
vi.mock('../components/player/VideoPlayer', () => ({ default: () => <div>player</div> }));

const resolvePlayableItem = vi.fn().mockResolvedValue({ id: 'm1', startTicks: 500 });
const fetchPlaybackInfo = vi.fn().mockResolvedValue({ mediaSource: {}, playSessionId: 'ps1' });
const resolveStreamUrl = vi.fn().mockReturnValue({ url: 'http://x/stream.mp4', isHls: false });
vi.mock('../lib/jellyfin/playback', () => ({
  resolvePlayableItem: (...args: unknown[]) => resolvePlayableItem(...args),
  fetchPlaybackInfo: (...args: unknown[]) => fetchPlaybackInfo(...args),
  resolveStreamUrl: (...args: unknown[]) => resolveStreamUrl(...args),
}));

const reportStart = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/jellyfin/reporting', () => ({
  reportStart: (...args: unknown[]) => reportStart(...args),
  reportProgress: vi.fn().mockResolvedValue(undefined),
  reportStopped: vi.fn().mockResolvedValue(undefined),
}));

import Watch from './Watch';

test('setup runs exactly once as item transitions from undefined to loaded (no double play session)', async () => {
  itemData = undefined;
  const { rerender } = render(<Watch />);

  // Simulate useItem resolving with the Continue-Watching resume position.
  itemData = { Id: 'm1', Type: 'Movie', UserData: { PlaybackPositionTicks: 12345 } } as BaseItemDto;
  rerender(<Watch />);
  rerender(<Watch />);

  await waitFor(() => expect(fetchPlaybackInfo).toHaveBeenCalledTimes(1));
  expect(resolvePlayableItem).toHaveBeenCalledTimes(1);
  expect(reportStart).toHaveBeenCalledTimes(1);
  expect(fetchPlaybackInfo).toHaveBeenCalledWith({}, 'u', 'm1', 500);
});
