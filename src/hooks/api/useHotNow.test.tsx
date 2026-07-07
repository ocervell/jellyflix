import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { BaseItemKind, ItemSortBy, SortOrder } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
const getItems = vi.fn().mockResolvedValue({ data: { Items: [{ Id: 'a', Name: 'Hot Film' }] } });
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));

import { useHotNow } from './useHotNow';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('requests newest high-rated movies + series', async () => {
  const { result } = renderHook(() => useHotNow(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const arg = getItems.mock.calls[0][0];
  expect(arg.minCommunityRating).toBe(7);
  expect(arg.sortBy).toEqual([ItemSortBy.PremiereDate]);
  expect(arg.sortOrder).toEqual([SortOrder.Descending]);
  expect(arg.includeItemTypes).toEqual([BaseItemKind.Movie, BaseItemKind.Series]);
  expect(arg.recursive).toBe(true);
  expect(arg.parentId).toBeUndefined();
  expect(typeof arg.maxPremiereDate).toBe('string');
  expect(result.current.data?.[0].Name).toBe('Hot Film');
});
