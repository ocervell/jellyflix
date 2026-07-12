import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import ServerScreen from './ServerScreen';
import * as useApiModule from '../hooks/useApi';
import { initFocus } from '../lib/tv/focus';
import { getSavedServer } from '../lib/tv/server';

beforeAll(() => initFocus());
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test('TV build with no saved server shows the server screen instead of login', () => {
  localStorage.setItem('jellyflix.forceTv', '1');
  vi.spyOn(useApiModule, 'useAuth').mockReturnValue({ session: null, login: vi.fn(), logout: vi.fn() });
  render(<MemoryRouter><Login /></MemoryRouter>);
  expect(screen.getByLabelText(/jellyfin server/i)).toBeTruthy();
  expect(screen.queryByLabelText(/password/i)).toBeNull();
});

test('web build goes straight to the credentials form', () => {
  vi.spyOn(useApiModule, 'useAuth').mockReturnValue({ session: null, login: vi.fn(), logout: vi.fn() });
  render(<MemoryRouter><Login /></MemoryRouter>);
  expect(screen.getByLabelText(/password/i)).toBeTruthy();
  expect(screen.queryByLabelText(/jellyfin server/i)).toBeNull();
});

test('connecting to a valid server saves it and calls onConnected', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Version: '10.9.0' }) }));
  const onConnected = vi.fn();
  render(<ServerScreen onConnected={onConnected} />);
  await userEvent.type(screen.getByLabelText(/jellyfin server/i), 'http://nas:8096/');
  await userEvent.click(screen.getByRole('button', { name: /connect/i }));
  expect(onConnected).toHaveBeenCalledWith('http://nas:8096');
  expect(getSavedServer()).toBe('http://nas:8096');
});

test('an unreachable server surfaces an error and saves nothing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  const onConnected = vi.fn();
  render(<ServerScreen onConnected={onConnected} />);
  await userEvent.type(screen.getByLabelText(/jellyfin server/i), 'http://nope:8096');
  await userEvent.click(screen.getByRole('button', { name: /connect/i }));
  expect(await screen.findByText(/couldn't reach/i)).toBeTruthy();
  expect(onConnected).not.toHaveBeenCalled();
  expect(getSavedServer()).toBeNull();
});
