import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import type { TrickplayInfo } from '@jellyfin/sdk/lib/generated-client/models/trickplay-info';

export type Trickplay = { info: TrickplayInfo; width: number; itemId: string; mediaSourceId: string };
export type Tile = { imageUrl: string; bgX: number; bgY: number; width: number; height: number };

export function selectTrickplay(item: BaseItemDto, mediaSourceId: string, screenWidth: number, dpr: number): Trickplay | null {
  const byWidth = item.Trickplay?.[mediaSourceId];
  if (!byWidth) return null;
  const widths = Object.keys(byWidth).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (!widths.length) return null;
  const budget = screenWidth * dpr * 0.2;
  const within = widths.filter((w) => w <= budget);
  const width = within.length ? within[within.length - 1] : widths[0];
  const info = byWidth[String(width)];
  if (!info) return null;
  return { info, width, itemId: item.Id ?? '', mediaSourceId };
}

export function tileForTime(tp: Trickplay, serverUrl: string, token: string, seconds: number): Tile {
  const { info } = tp;
  const interval = info.Interval ?? 10000;
  const tw = info.TileWidth ?? 10, th = info.TileHeight ?? 10;
  const w = info.Width ?? 0, h = info.Height ?? 0;
  const currentTile = Math.floor((seconds * 1000) / interval);
  const tileSize = tw * th;
  const index = Math.floor(currentTile / tileSize);
  const offset = currentTile % tileSize;
  const x = offset % tw, y = Math.floor(offset / tw);
  return {
    imageUrl: `${serverUrl}/Videos/${tp.itemId}/Trickplay/${info.Width}/${index}.jpg?mediaSourceId=${tp.mediaSourceId}&api_key=${token}`,
    bgX: -(x * w) || 0, bgY: -(y * h) || 0, width: w, height: h,
  };
}
