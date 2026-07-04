import { expect, test } from 'vitest';
import { nextScrollLeft } from './paging';

test('pages right by one viewport, clamped to end', () => {
  expect(nextScrollLeft({ scrollLeft: 0, clientWidth: 1000, scrollWidth: 3000 }, 1)).toBe(1000);
  expect(nextScrollLeft({ scrollLeft: 2500, clientWidth: 1000, scrollWidth: 3000 }, 1)).toBe(2000);
});
test('pages left, clamped to 0', () => {
  expect(nextScrollLeft({ scrollLeft: 1500, clientWidth: 1000, scrollWidth: 3000 }, -1)).toBe(500);
  expect(nextScrollLeft({ scrollLeft: 200, clientWidth: 1000, scrollWidth: 3000 }, -1)).toBe(0);
});
