import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  clearServer, getSavedServer, getServerUrl, isTvBuild,
  normalizeServerUrl, probeServer, saveServer,
} from './server';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test('web build resolves to the /jf proxy', () => {
  expect(isTvBuild()).toBe(false);
  expect(getServerUrl()).toBe('/jf');
});

test('forceTv flag switches to the saved server (null until picked)', () => {
  localStorage.setItem('jellyflix.forceTv', '1');
  expect(isTvBuild()).toBe(true);
  expect(getServerUrl()).toBeNull();
  saveServer('http://nas:8096');
  expect(getSavedServer()).toBe('http://nas:8096');
  expect(getServerUrl()).toBe('http://nas:8096');
  clearServer();
  expect(getServerUrl()).toBeNull();
});

test('normalize trims, strips trailing slashes, requires http(s)', () => {
  expect(normalizeServerUrl('  http://nas:8096/  ')).toBe('http://nas:8096');
  expect(normalizeServerUrl('https://x.example///')).toBe('https://x.example');
  expect(normalizeServerUrl('nas:8096')).toBeNull();
  expect(normalizeServerUrl('')).toBeNull();
});

test('probeServer accepts a Jellyfin public-info response, rejects others', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ Version: '10.9.0', Id: 'abc' }) })
    .mockResolvedValueOnce({ ok: false })
    .mockRejectedValueOnce(new Error('network'));
  vi.stubGlobal('fetch', fetchMock);
  expect(await probeServer('http://nas:8096')).toBe(true);
  expect(await probeServer('http://nope')).toBe(false);
  expect(await probeServer('http://down')).toBe(false);
  expect(fetchMock).toHaveBeenCalledWith('http://nas:8096/System/Info/Public', expect.anything());
});
