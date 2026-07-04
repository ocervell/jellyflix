import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

export function ticksToSeconds(ticks?: number | null): number {
  return ticks ? ticks / 10_000_000 : 0;
}

export function formatRuntime(ticks?: number | null): string {
  const total = Math.round(ticksToSeconds(ticks) / 60);
  if (!total) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function playedPercent(item: BaseItemDto): number {
  return item.UserData?.PlayedPercentage ?? 0;
}
