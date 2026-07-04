import { beforeEach, expect, test } from 'vitest';
import { getDeviceId, getClientInfo } from './device';

beforeEach(() => localStorage.clear());

test('getDeviceId persists a stable id', () => {
  const a = getDeviceId();
  expect(a).toMatch(/[0-9a-f-]{36}/);
  expect(getDeviceId()).toBe(a);
});

test('getClientInfo is Jellyflix', () => {
  expect(getClientInfo()).toEqual({ name: 'Jellyflix', version: '0.1.0' });
});
