import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
const getItems = vi.fn().mockResolvedValue({ data: { Items: [
  { Id: 'mv', Type: 'Movie', Name: 'Film', UserData: { IsFavorite: true } },
  { Id: 'e1', Type: 'Episode', SeriesId: 'S', SeriesName: 'Show', UserData: { IsFavorite: true } },
  { Id: 'e2', Type: 'Episode', SeriesId: 'S', SeriesName: 'Show', UserData: { IsFavorite: true } },
] } });
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));

import { useFavorites } from './useFavorites';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('requests episodes too and groups favorited episodes into one series card', async () => {
  const { result } = renderHook(() => useFavorites(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(getItems.mock.calls[0][0].includeItemTypes).toContain(BaseItemKind.Episode);
  // movie + one grouped series card
  expect(result.current.data).toHaveLength(2);
  const seriesCard = result.current.data?.find((i) => i.Id === 'S');
  expect(seriesCard?.Type).toBe('Series');
});
