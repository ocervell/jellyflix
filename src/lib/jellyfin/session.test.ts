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

test('returns null when stored JSON is corrupt', () => {
  localStorage.setItem('jellyflix.session', '{not valid json');
  expect(loadSession()).toBeNull();
});
