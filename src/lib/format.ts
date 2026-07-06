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

/** True when the item has a saved playback position to resume from (partially watched, not finished). */
export function isResumable(item: BaseItemDto): boolean {
  return !item.UserData?.Played && (item.UserData?.PlaybackPositionTicks ?? 0) > 0;
}

/**
 * Card display title/subtitle. For episodes the primary title is the series
 * name (so you can tell which show it is) and the subtitle carries the
 * "S{season}:E{episode} · Episode Title". Everything else shows its own name
 * as the title with no subtitle.
 */
export function cardTitle(item: BaseItemDto): { title: string; subtitle: string | null } {
  const name = item.Name ?? 'Untitled';
  if (item.Type !== 'Episode') return { title: name, subtitle: null };
  const s = item.ParentIndexNumber;
  const e = item.IndexNumber;
  const code = s != null && e != null ? `S${s}:E${e}` : null;
  const subtitle = [code, item.Name].filter(Boolean).join(' · ') || null;
  return { title: item.SeriesName ?? name, subtitle };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
