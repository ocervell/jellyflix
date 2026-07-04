import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { ticksToSeconds, formatRuntime, playedPercent, formatTime } from './format';

test('ticksToSeconds', () => {
  expect(ticksToSeconds(10_000_000)).toBe(1);
  expect(ticksToSeconds(null)).toBe(0);
});
test('formatRuntime', () => {
  expect(formatRuntime(70 * 60 * 10_000_000)).toBe('1h 10m');
  expect(formatRuntime(47 * 60 * 10_000_000)).toBe('47m');
  expect(formatRuntime(0)).toBe('');
});
test('playedPercent', () => {
  expect(playedPercent({ UserData: { PlayedPercentage: 52.7 } } as BaseItemDto)).toBe(52.7);
  expect(playedPercent({} as BaseItemDto)).toBe(0);
});
test('formatTime', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(9)).toBe('0:09');
  expect(formatTime(75)).toBe('1:15');
  expect(formatTime(3661)).toBe('1:01:01');
  expect(formatTime(-5)).toBe('0:00');
  expect(formatTime(NaN)).toBe('0:00');
});
