import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { ticksToSeconds, formatRuntime, playedPercent, formatTime, cardTitle, cardMeta, episodeCode, isResumable } from './format';

test('ticksToSeconds', () => {
  expect(ticksToSeconds(10_000_000)).toBe(1);
  expect(ticksToSeconds(null)).toBe(0);
});
test('formatRuntime', () => {
  expect(formatRuntime(70 * 60 * 10_000_000)).toBe('1h 10m');
  expect(formatRuntime(47 * 60 * 10_000_000)).toBe('47m');
  expect(formatRuntime(0)).toBe('');
});
test('playedPercent', () => {
  expect(playedPercent({ UserData: { PlayedPercentage: 52.7 } } as BaseItemDto)).toBe(52.7);
  expect(playedPercent({} as BaseItemDto)).toBe(0);
});
test('cardTitle: movie shows its own name, no subtitle', () => {
  expect(cardTitle({ Type: 'Movie', Name: 'USS Callister' } as BaseItemDto))
    .toEqual({ title: 'USS Callister', subtitle: null });
});
test('cardTitle: episode shows series name + S:E · title', () => {
  expect(cardTitle({
    Type: 'Episode', Name: 'Je suis mon ami', SeriesName: 'American Dad!',
    ParentIndexNumber: 21, IndexNumber: 3,
  } as BaseItemDto)).toEqual({ title: 'American Dad!', subtitle: 'S21:E3 · Je suis mon ami' });
});
test('cardTitle: episode without numbers omits the S:E code', () => {
  expect(cardTitle({ Type: 'Episode', Name: 'Pilot', SeriesName: 'Show' } as BaseItemDto))
    .toEqual({ title: 'Show', subtitle: 'Pilot' });
});
test('cardTitle: episode missing SeriesName falls back to its own name', () => {
  expect(cardTitle({ Type: 'Episode', Name: 'Lone Ep' } as BaseItemDto))
    .toEqual({ title: 'Lone Ep', subtitle: 'Lone Ep' });
});
test('isResumable: true only when partially watched with a saved position', () => {
  expect(isResumable({ UserData: { PlaybackPositionTicks: 5_000_000_000 } } as BaseItemDto)).toBe(true);
  expect(isResumable({ UserData: { PlaybackPositionTicks: 0 } } as BaseItemDto)).toBe(false);
  expect(isResumable({ UserData: { PlaybackPositionTicks: 5_000_000_000, Played: true } } as BaseItemDto)).toBe(false);
  expect(isResumable({} as BaseItemDto)).toBe(false);
});
test('episodeCode: SxEx for episodes, null otherwise', () => {
  expect(episodeCode({ Type: 'Episode', ParentIndexNumber: 1, IndexNumber: 4 } as BaseItemDto)).toBe('S1:E4');
  expect(episodeCode({ Type: 'Episode', Name: 'Pilot' } as BaseItemDto)).toBeNull();
  expect(episodeCode({ Type: 'Movie', ParentIndexNumber: 1, IndexNumber: 4 } as BaseItemDto)).toBeNull();
});
test('cardMeta: movie shows year, rating, runtime', () => {
  expect(cardMeta({ Type: 'Movie', ProductionYear: 2018, OfficialRating: 'U/A 13+', RunTimeTicks: 8400 * 10_000_000 } as BaseItemDto))
    .toEqual(['2018', 'U/A 13+', '2h 20m']);
});
test('cardMeta: series shows season count instead of runtime', () => {
  expect(cardMeta({ Type: 'Series', ProductionYear: 2020, OfficialRating: 'U/A 16+', ChildCount: 7 } as BaseItemDto))
    .toEqual(['2020', 'U/A 16+', '7 Seasons']);
  expect(cardMeta({ Type: 'Series', ChildCount: 1 } as BaseItemDto)).toEqual(['1 Season']);
});
test('cardMeta: drops missing pieces', () => {
  expect(cardMeta({ Type: 'Movie', ProductionYear: 1999 } as BaseItemDto)).toEqual(['1999']);
  expect(cardMeta({ Type: 'Series' } as BaseItemDto)).toEqual([]);
});
test('formatTime', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(9)).toBe('0:09');
  expect(formatTime(75)).toBe('1:15');
  expect(formatTime(3661)).toBe('1:01:01');
  expect(formatTime(-5)).toBe('0:00');
  expect(formatTime(NaN)).toBe('0:00');
});
