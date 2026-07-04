import { renderHook, act } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useAbrController } from './useAbrController';

test('fires a downshift after repeated stalls', () => {
  vi.useFakeTimers();
  const onShift = vi.fn();
  let engineState = { paused: false, currentTime: 10, duration: 100, bufferedEnd: 11, volume: 1, muted: false, waiting: true, stallCount: 0 };
  const { rerender } = renderHook(({ s }) => useAbrController({ engineState: s, getPosition: () => 10, bandwidth: 8_000_000, currentBitrate: 20_000_000, isTranscoding: true, onShift }), { initialProps: { s: engineState } });
  // simulate two stalls + starved buffer across sample windows
  for (let i = 0; i < 3; i++) {
    engineState = { ...engineState, stallCount: engineState.stallCount + 1, bufferedEnd: 11 };
    rerender({ s: engineState });
    act(() => vi.advanceTimersByTime(5000));
  }
  expect(onShift).toHaveBeenCalled();
  const target = onShift.mock.calls[onShift.mock.calls.length - 1]![0] as number;
  expect(target).toBeLessThan(20_000_000);
  vi.useRealTimers();
});
