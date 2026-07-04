export const BITRATE_LADDER = [
  120_000_000, 60_000_000, 40_000_000, 20_000_000, 15_000_000, 10_000_000,
  8_000_000, 6_000_000, 4_000_000, 3_000_000, 1_500_000, 720_000, 420_000,
];

export type AbrState = {
  currentBitrate: number; bandwidth: number; stallsInWindow: number;
  bufferAhead: number; stableSecs: number; isTranscoding: boolean;
};

export function ladderStepDown(current: number, bandwidth: number): number | null {
  const cap = Math.round(bandwidth * 0.7);
  const lower = BITRATE_LADDER.filter((b) => b < current && b <= cap);
  return lower.length ? Math.max(...lower) : null;
}
export function ladderStepUp(current: number, bandwidth: number): number | null {
  const higher = BITRATE_LADDER.filter((b) => b > current && b <= bandwidth);
  return higher.length ? Math.min(...higher) : null;
}

export function decideAbrAction(s: AbrState): { action: 'up' | 'down' | 'none'; targetBitrate: number } {
  if (!s.isTranscoding) return { action: 'none', targetBitrate: s.currentBitrate };
  if (s.stallsInWindow >= 2 || s.bufferAhead < 4) {
    const down = ladderStepDown(s.currentBitrate, s.bandwidth);
    if (down != null) return { action: 'down', targetBitrate: down };
  }
  if (s.stableSecs >= 40 && s.bufferAhead > 12) {
    const up = ladderStepUp(s.currentBitrate, s.bandwidth);
    if (up != null) return { action: 'up', targetBitrate: up };
  }
  return { action: 'none', targetBitrate: s.currentBitrate };
}
