import { expect, test } from 'vitest';
import { decideAbrAction } from './abr';

const base = { currentBitrate: 20_000_000, bandwidth: 8_000_000, stallsInWindow: 0, bufferAhead: 20, stableSecs: 0, isTranscoding: true };

test('downshifts on repeated stalls to a rung within bandwidth', () => {
  const r = decideAbrAction({ ...base, stallsInWindow: 2 });
  expect(r.action).toBe('down');
  expect(r.targetBitrate).toBeLessThanOrEqual(Math.round(8_000_000 * 0.7));
});
test('downshifts on starved buffer', () => {
  expect(decideAbrAction({ ...base, bufferAhead: 2 }).action).toBe('down');
});
test('upshifts when stable with healthy buffer and headroom', () => {
  const r = decideAbrAction({ currentBitrate: 4_000_000, bandwidth: 20_000_000, stallsInWindow: 0, bufferAhead: 15, stableSecs: 60, isTranscoding: true });
  expect(r.action).toBe('up');
  expect(r.targetBitrate).toBeGreaterThan(4_000_000);
});
test('never acts on direct-play', () => {
  expect(decideAbrAction({ ...base, isTranscoding: false, stallsInWindow: 5 }).action).toBe('none');
});
test('no action when steady', () => {
  expect(decideAbrAction(base).action).toBe('none');
});
