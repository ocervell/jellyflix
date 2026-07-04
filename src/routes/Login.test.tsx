import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import * as useApiModule from '../hooks/useApi';

test('submits typed credentials to login()', async () => {
  const login = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(useApiModule, 'useAuth').mockReturnValue({ session: null, login, logout: vi.fn() });
  render(<MemoryRouter><Login /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText(/username/i), 'jellyfin');
  await userEvent.type(screen.getByLabelText(/password/i), 'pw');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(login).toHaveBeenCalledWith('jellyfin', 'pw');
});
