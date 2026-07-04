import { useEffect, useRef } from 'react';
import type { EngineState } from './useVideoEngine';
import { decideAbrAction } from '../../lib/player/abr';

export function useAbrController(args: {
  engineState: EngineState; getPosition: () => number;
  bandwidth: number; currentBitrate: number; isTranscoding: boolean;
  onShift: (targetBitrate: number) => void;
}): void {
  const ref = useRef(args); ref.current = args;
  const stallAt = useRef<number[]>([]);
  const lastStallCount = useRef(0);
  const lastShift = useRef(0);
  const lastPlayingStall = useRef(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      const a = ref.current;
      const now = Date.now();
      if (a.engineState.stallCount > lastStallCount.current) {
        stallAt.current.push(now); lastStallCount.current = a.engineState.stallCount; lastPlayingStall.current = now;
      }
      stallAt.current = stallAt.current.filter((t) => now - t < 30_000);
      const bufferAhead = Math.max(0, a.engineState.bufferedEnd - a.engineState.currentTime);
      const stableSecs = a.engineState.paused ? 0 : (now - lastPlayingStall.current) / 1000;
      const decision = decideAbrAction({
        currentBitrate: a.currentBitrate, bandwidth: a.bandwidth,
        stallsInWindow: stallAt.current.length, bufferAhead, stableSecs, isTranscoding: a.isTranscoding,
      });
      if (decision.action !== 'none' && decision.targetBitrate !== a.currentBitrate && now - lastShift.current > 15_000) {
        lastShift.current = now;
        a.onShift(decision.targetBitrate);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, []);
}
