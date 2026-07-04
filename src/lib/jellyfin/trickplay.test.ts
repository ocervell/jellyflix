import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { selectTrickplay, tileForTime } from './trickplay';

const info = { Interval: 10000, TileWidth: 10, TileHeight: 10, Width: 320, Height: 180, ThumbnailCount: 250 };
const item = { Id: 'itm', Trickplay: { ms1: { '320': info } } } as unknown as BaseItemDto;

test('selectTrickplay picks a width within the screen budget', () => {
  const tp = selectTrickplay(item, 'ms1', 1920, 1);
  expect(tp?.width).toBe(320); // 1920*0.2=384 >= 320
});
test('tileForTime computes sheet index and background offset', () => {
  const tp = selectTrickplay(item, 'ms1', 1920, 1)!;
  // t=125s => currentTile=125000/10000=12 (floor). tileSize=100 => index 0, offset 12 => x=2,y=1
  const tile = tileForTime(tp, '/jf', 'tok', 125);
  expect(tile.imageUrl).toBe('/jf/Videos/itm/Trickplay/320/0.jpg?mediaSourceId=ms1&api_key=tok');
  expect(tile.bgX).toBe(-(2 * 320));
  expect(tile.bgY).toBe(-(1 * 180));
  expect(tile.width).toBe(320);
});
test('multi-sheet boundary: tile 105 -> sheet 1', () => {
  const tp = selectTrickplay(item, 'ms1', 1920, 1)!;
  const tile = tileForTime(tp, '/jf', 'tok', 1055); // currentTile=105 => index 1, offset 5 => x5 y0
  expect(tile.imageUrl).toContain('/Trickplay/320/1.jpg');
  expect(tile.bgX).toBe(-(5 * 320));
  expect(tile.bgY).toBe(0);
});
