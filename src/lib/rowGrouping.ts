import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

/** A card that may stand in for several collapsed episodes of one series. */
export type GroupedItem = BaseItemDto & { groupMembers?: BaseItemDto[] };

/**
 * Collapse episodes sharing a SeriesId into a single synthesized Series card.
 * Movies and series pass through untouched. First-seen order is preserved:
 * a series appears at the position of its first member in the input.
 */
export function groupEpisodesBySeries(items: BaseItemDto[]): GroupedItem[] {
  const out: GroupedItem[] = [];
  const bySeriesId = new Map<string, GroupedItem>();
  for (const item of items) {
    if (item.Type !== 'Episode' || !item.SeriesId) {
      out.push(item);
      continue;
    }
    const existing = bySeriesId.get(item.SeriesId);
    if (existing) {
      existing.groupMembers!.push(item);
      continue;
    }
    const card: GroupedItem = {
      Id: item.SeriesId,
      Name: item.SeriesName,
      Type: BaseItemKind.Series,
      ImageTags: {
        ...(item.SeriesPrimaryImageTag ? { Primary: item.SeriesPrimaryImageTag } : {}),
        ...(item.SeriesThumbImageTag ? { Thumb: item.SeriesThumbImageTag } : {}),
      },
      SeriesId: item.SeriesId,
      SeriesPrimaryImageTag: item.SeriesPrimaryImageTag,
      SeriesThumbImageTag: item.SeriesThumbImageTag,
      groupMembers: [item],
    };
    bySeriesId.set(item.SeriesId, card);
    out.push(card);
  }
  return out;
}

/** Read the collapsed episodes off a card, if it is a group. */
export function getGroupMembers(item: BaseItemDto): BaseItemDto[] | undefined {
  return (item as GroupedItem).groupMembers;
}
