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
/** Compact "S{season}:E{episode}" for an episode, or null for anything else / missing numbers. */
export function episodeCode(item: BaseItemDto): string | null {
  if (item.Type !== 'Episode') return null;
  const s = item.ParentIndexNumber;
  const e = item.IndexNumber;
  return s != null && e != null ? `S${s}:E${e}` : null;
}

export function cardTitle(item: BaseItemDto): { title: string; subtitle: string | null } {
  const name = item.Name ?? 'Untitled';
  if (item.Type !== 'Episode') return { title: name, subtitle: null };
  const subtitle = [episodeCode(item), item.Name].filter(Boolean).join(' · ') || null;
  return { title: item.SeriesName ?? name, subtitle };
}

/**
 * Metadata parts shown under a card title (year · rating · seasons|runtime).
 * Series report their season count (ChildCount); everything else its runtime.
 * Missing pieces are dropped so the caller can just join what's there.
 */
export function cardMeta(item: BaseItemDto): string[] {
  const parts: string[] = [];
  if (item.ProductionYear) parts.push(String(item.ProductionYear));
  if (item.OfficialRating) parts.push(item.OfficialRating);
  if (item.Type === 'Series') {
    const n = item.ChildCount ?? 0;
    if (n > 0) parts.push(`${n} Season${n > 1 ? 's' : ''}`);
  } else {
    const rt = formatRuntime(item.RunTimeTicks);
    if (rt) parts.push(rt);
  }
  return parts;
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
