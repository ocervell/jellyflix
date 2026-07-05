import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi, beforeEach } from 'vitest';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
const getItems = vi.fn();
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));

import { useSearchItems } from './useSearchItems';
import type { SearchQuery } from '../../lib/search/query';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const base: SearchQuery = { q: '', sort: 'name', order: 'asc', status: 'all' };

beforeEach(() => getItems.mockReset());

test('does not fetch when q is empty/whitespace', async () => {
  const { result } = renderHook(() => useSearchItems({ ...base, q: '   ' }), { wrapper });
  await Promise.resolve();
  expect(getItems).not.toHaveBeenCalled();
  expect(result.current.items).toEqual([]);
});

test('fetches with searchTerm when q is present', async () => {
  getItems.mockResolvedValue({ data: { Items: [{ Id: 'a', Name: 'A' }], TotalRecordCount: 1, StartIndex: 0 } });
  const { result } = renderHook(() => useSearchItems({ ...base, q: 'matrix' }), { wrapper });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  expect(getItems.mock.calls[0][0]).toMatchObject({ searchTerm: 'matrix', includeItemTypes: ['Movie', 'Series'], startIndex: 0 });
  expect(result.current.total).toBe(1);
});
