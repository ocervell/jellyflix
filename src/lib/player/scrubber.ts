export function pointerFraction(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

export function fractionToTime(fraction: number, duration: number): number {
  return Math.max(0, Math.min(1, fraction)) * duration;
}
