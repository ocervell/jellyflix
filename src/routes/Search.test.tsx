import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';

vi.mock('../components/nav/TopNav', () => ({ default: () => <div>nav</div> }));
vi.mock('../components/detail/DetailModal', () => ({ default: () => <div>modal</div> }));
vi.mock('../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../components/common/ItemActions', () => ({ default: () => <div>item actions</div> }));
const useSearchItems = vi.fn();
vi.mock('../hooks/api/useSearchItems', () => ({ useSearchItems: (q: unknown) => useSearchItems(q) }));

import Search from './Search';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Search /></MemoryRouter>);
}

test('empty query shows the prompt and does not render the grid', () => {
  useSearchItems.mockReturnValue({ items: [], total: 0, fetchNextPage: () => {}, hasNextPage: false, isLoading: false, isError: false });
  renderAt('/search');
  expect(screen.getByText(/search for movies and shows/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/sort by/i)).not.toBeInTheDocument();
});

test('non-empty query renders results heading + sort control', () => {
  useSearchItems.mockReturnValue({ items: [{ Id: 'a', Name: 'A' }], total: 1, fetchNextPage: () => {}, hasNextPage: false, isLoading: false, isError: false });
  renderAt('/search?q=matrix');
  expect(screen.getByText(/results for/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
});
