import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

export type UserDataPatch = { isFavorite?: boolean; played?: boolean };

export function patchItemUserData(item: BaseItemDto, patch: UserDataPatch): BaseItemDto {
  const ud = { ...(item.UserData ?? {}) };
  if (patch.isFavorite !== undefined) ud.IsFavorite = patch.isFavorite;
  if (patch.played !== undefined) {
    ud.Played = patch.played;
    ud.PlayedPercentage = patch.played ? 100 : 0;
    ud.PlaybackPositionTicks = 0;
  }
  return { ...item, UserData: ud };
}
