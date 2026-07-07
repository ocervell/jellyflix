import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { BaseItemKind, ItemSortBy, SortOrder } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
const getItems = vi.fn().mockResolvedValue({ data: { Items: [
  { Id: 'm', Type: 'Movie', Name: 'Film' },
  { Id: 'e1', Type: 'Episode', SeriesId: 'S', SeriesName: 'Show' },
  { Id: 'e2', Type: 'Episode', SeriesId: 'S', SeriesName: 'Show' },
] } });
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));

import { useRecentlyAdded } from './useRecentlyAdded';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('sorts by DateCreated desc, includes episodes, and groups them', async () => {
  const { result } = renderHook(() => useRecentlyAdded(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const arg = getItems.mock.calls[0][0];
  expect(arg.sortBy).toEqual([ItemSortBy.DateCreated]);
  expect(arg.sortOrder).toEqual([SortOrder.Descending]);
  expect(arg.includeItemTypes).toEqual([BaseItemKind.Movie, BaseItemKind.Series, BaseItemKind.Episode]);
  expect(arg.recursive).toBe(true);
  // movie + one grouped series card (the two episodes collapse)
  expect(result.current.data).toHaveLength(2);
  expect(result.current.data?.find((i) => i.Id === 'S')?.Type).toBe('Series');
});
