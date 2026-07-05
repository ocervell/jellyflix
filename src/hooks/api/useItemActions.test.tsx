import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u', serverUrl: '/jf', accessToken: 't', userName: 'x' } }) }));
const mark = vi.fn().mockResolvedValue({ data: { IsFavorite: true } });
const unmark = vi.fn().mockResolvedValue({ data: { IsFavorite: false } });
vi.mock('@jellyfin/sdk/lib/utils/api/user-library-api', () => ({ getUserLibraryApi: () => ({ markFavoriteItem: mark, unmarkFavoriteItem: unmark }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/playstate-api', () => ({ getPlaystateApi: () => ({ markPlayedItem: vi.fn().mockResolvedValue({ data: {} }), markUnplayedItem: vi.fn().mockResolvedValue({ data: {} }) }) }));

import { useToggleFavorite } from './useItemActions';

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('favoriting a non-favorite calls markFavoriteItem and optimistically patches the cache', async () => {
  const qc = new QueryClient();
  qc.setQueryData(['resume', 'u'], [{ Id: 'X', UserData: { IsFavorite: false } } as BaseItemDto]);
  const { result } = renderHook(() => useToggleFavorite(), { wrapper: makeWrapper(qc) });
  await act(async () => { result.current({ Id: 'X', UserData: { IsFavorite: false } } as BaseItemDto); });
  // optimistic patch is synchronous in onMutate
  expect((qc.getQueryData(['resume', 'u']) as BaseItemDto[])[0].UserData?.IsFavorite).toBe(true);
  await waitFor(() => expect(mark).toHaveBeenCalledWith({ userId: 'u', itemId: 'X' }));
  expect(unmark).not.toHaveBeenCalled();
});
