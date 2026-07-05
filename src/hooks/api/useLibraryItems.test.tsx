import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u', serverUrl: '/jf', accessToken: 't', userName: 'x' } }) }));
const getItems = vi.fn();
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({ getItemsApi: () => ({ getItems }) }));

import { useLibraryItems, LIBRARY_PAGE_SIZE } from './useLibraryItems';
import { DEFAULT_QUERY } from '../../lib/library/query';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('appends pages and stops at total', async () => {
  const page = (start: number) => ({ data: { Items: [{ Id: `i${start}`, Name: `n${start}` }], TotalRecordCount: 2, StartIndex: start } });
  getItems.mockImplementation((req: { startIndex: number }) => Promise.resolve(page(req.startIndex)));
  const { result } = renderHook(() => useLibraryItems(DEFAULT_QUERY, { id: 'V', includeItemTypes: ['Movie'] }), { wrapper });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  expect(result.current.total).toBe(2);
  expect(result.current.hasNextPage).toBe(true);
  await act(async () => { result.current.fetchNextPage(); });
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  expect(result.current.hasNextPage).toBe(false);
  // first page requested startIndex 0, second LIBRARY_PAGE_SIZE
  expect(getItems.mock.calls[0][0].startIndex).toBe(0);
  expect(getItems.mock.calls[1][0].startIndex).toBe(LIBRARY_PAGE_SIZE);
});

test('de-dupes items sharing an id across pages (random sort reshuffle)', async () => {
  const pages = [
    { data: { Items: [{ Id: 'a', Name: 'n a' }, { Id: 'b', Name: 'n b' }], TotalRecordCount: 4, StartIndex: 0 } },
    { data: { Items: [{ Id: 'b', Name: 'n b' }, { Id: 'c', Name: 'n c' }], TotalRecordCount: 4, StartIndex: LIBRARY_PAGE_SIZE } },
  ];
  getItems.mockReset();
  let call = 0;
  getItems.mockImplementation(() => Promise.resolve(pages[call++]));
  const { result } = renderHook(() => useLibraryItems(DEFAULT_QUERY, { id: 'V', includeItemTypes: ['Movie'] }), { wrapper });
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  await act(async () => { result.current.fetchNextPage(); });
  await waitFor(() => expect(getItems).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.items.map((i) => i.Id)).toEqual(['a', 'b', 'c']));
});
