import type { Api } from '@jellyfin/sdk';
import { getImageApi } from '@jellyfin/sdk/lib/utils/api/image-api';
import { ImageType } from '@jellyfin/sdk/lib/generated-client';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

function build(api: Api, itemId: string, type: ImageType, tag: string, width: number): string {
  return getImageApi(api).getItemImageUrlById(itemId, type, {
    tag,
    fillWidth: Math.round(width * DPR),
    quality: 90,
  });
}

export function getCardImageUrl(api: Api, item: BaseItemDto, opts: { width?: number } = {}): string | null {
  const w = opts.width ?? 320;
  if (item.Id && item.ImageTags?.Thumb) return build(api, item.Id, ImageType.Thumb, item.ImageTags.Thumb, w);
  if (item.Id && item.ImageTags?.Primary) return build(api, item.Id, ImageType.Primary, item.ImageTags.Primary, w);
  if (item.ParentThumbItemId && item.ParentThumbImageTag) return build(api, item.ParentThumbItemId, ImageType.Thumb, item.ParentThumbImageTag, w);
  if (item.SeriesId && item.SeriesThumbImageTag) return build(api, item.SeriesId, ImageType.Thumb, item.SeriesThumbImageTag, w);
  if (item.SeriesId && item.SeriesPrimaryImageTag) return build(api, item.SeriesId, ImageType.Primary, item.SeriesPrimaryImageTag, w);
  return null;
}

export function getBackdropUrl(api: Api, item: BaseItemDto, opts: { width?: number } = {}): string | null {
  const w = opts.width ?? 1280;
  if (item.Id && item.BackdropImageTags?.length) return build(api, item.Id, ImageType.Backdrop, item.BackdropImageTags[0], w);
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length) return build(api, item.ParentBackdropItemId, ImageType.Backdrop, item.ParentBackdropImageTags[0], w);
  return null;
}

export function getLogoUrl(api: Api, item: BaseItemDto): string | null {
  if (item.Id && item.ImageTags?.Logo) return build(api, item.Id, ImageType.Logo, item.ImageTags.Logo, 400);
  if (item.ParentLogoItemId && item.ParentLogoImageTag) return build(api, item.ParentLogoItemId, ImageType.Logo, item.ParentLogoImageTag, 400);
  return null;
}

export function getPosterUrl(api: Api, item: BaseItemDto, opts: { width?: number } = {}): string | null {
  const w = opts.width ?? 240;
  if (item.Id && item.ImageTags?.Primary) return build(api, item.Id, ImageType.Primary, item.ImageTags.Primary, w);
  return null;
}
