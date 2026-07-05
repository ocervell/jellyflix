import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import SearchBox from './SearchBox';

beforeEach(() => { navigate.mockReset(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); });

test('typing debounces then navigates to /search?q=', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<MemoryRouter initialEntries={['/']}><SearchBox /></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: /search/i }));
  await user.type(screen.getByRole('textbox', { name: /search/i }), 'matrix');
  expect(navigate).not.toHaveBeenCalled();          // still within debounce window
  act(() => { vi.advanceTimersByTime(300); });
  expect(navigate).toHaveBeenCalledWith('/search?q=matrix', { replace: false });
});
