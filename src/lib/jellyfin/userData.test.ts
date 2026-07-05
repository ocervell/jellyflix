import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { patchItemUserData } from './userData';

test('sets IsFavorite without touching played fields', () => {
  const item = { Id: 'x', UserData: { IsFavorite: false, Played: true, PlayedPercentage: 100 } } as BaseItemDto;
  const out = patchItemUserData(item, { isFavorite: true });
  expect(out.UserData?.IsFavorite).toBe(true);
  expect(out.UserData?.Played).toBe(true);
  expect(item.UserData?.IsFavorite).toBe(false); // input not mutated
  expect(out).not.toBe(item);
});

test('played=true sets Played+100% and clears position', () => {
  const item = { Id: 'x', UserData: { Played: false, PlayedPercentage: 40, PlaybackPositionTicks: 999 } } as BaseItemDto;
  const out = patchItemUserData(item, { played: true });
  expect(out.UserData).toMatchObject({ Played: true, PlayedPercentage: 100, PlaybackPositionTicks: 0 });
});

test('played=false sets 0%; handles missing UserData', () => {
  expect(patchItemUserData({ Id: 'x' } as BaseItemDto, { played: false }).UserData)
    .toMatchObject({ Played: false, PlayedPercentage: 0, PlaybackPositionTicks: 0 });
});
