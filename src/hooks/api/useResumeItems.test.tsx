import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';

vi.mock('../useApi', () => ({
  useApi: () => ({ api: {}, session: { userId: 'u', serverUrl: '/jf', accessToken: 't', userName: 'x' } }),
}));
vi.mock('@jellyfin/sdk/lib/utils/api/items-api', () => ({
  getItemsApi: () => ({
    getResumeItems: vi.fn().mockResolvedValue({ data: { Items: [{ Id: 'a', Name: 'Resume Me' }] } }),
  }),
}));

import { useResumeItems } from './useResumeItems';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test('returns resume items', async () => {
  const { result } = renderHook(() => useResumeItems(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.[0].Name).toBe('Resume Me');
});
