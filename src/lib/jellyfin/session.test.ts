import { beforeEach, expect, test } from 'vitest';
import { saveSession, loadSession, clearSession, type Session } from './session';

const s: Session = { serverUrl: '/jf', accessToken: 't', userId: 'u', userName: 'jellyfin' };
beforeEach(() => localStorage.clear());

test('round-trips a session', () => {
  expect(loadSession()).toBeNull();
  saveSession(s);
  expect(loadSession()).toEqual(s);
  clearSession();
  expect(loadSession()).toBeNull();
});
