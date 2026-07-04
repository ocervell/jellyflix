import { expect, test } from 'vitest';
import { fractionToTime, pointerFraction } from './scrubber';

test('pointerFraction clamps to [0,1]', () => {
  expect(pointerFraction(50, { left: 0, width: 100 })).toBe(0.5);
  expect(pointerFraction(-10, { left: 0, width: 100 })).toBe(0);
  expect(pointerFraction(200, { left: 0, width: 100 })).toBe(1);
});

test('fractionToTime scales & clamps', () => {
  expect(fractionToTime(0.5, 120)).toBe(60);
  expect(fractionToTime(2, 120)).toBe(120);
  expect(fractionToTime(-1, 120)).toBe(0);
});
