import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { applyItemUserDataToCache } from './cacheUpdate';

const item = (id: string, fav = false): BaseItemDto => ({ Id: id, Name: id, UserData: { IsFavorite: fav } } as BaseItemDto);

test('patches item X across array / {Items} / infinite / single shapes and rolls back', () => {
  const qc = new QueryClient();
  qc.setQueryData(['arr'], [item('a'), item('X')]);
  qc.setQueryData(['res'], { Items: [item('X'), item('b')], TotalRecordCount: 2 });
  qc.setQueryData(['inf'], { pages: [{ Items: [item('c')] }, { Items: [item('X')] }], pageParams: [0, 60] });
  qc.setQueryData(['one'], item('X'));
  qc.setQueryData(['other'], [item('a')]); // no X -> untouched, not in rollback

  const rollback = applyItemUserDataToCache(qc, 'X', { isFavorite: true });

  const favOf = (v: BaseItemDto | undefined) => v?.UserData?.IsFavorite;
  expect(favOf((qc.getQueryData(['arr']) as BaseItemDto[])[1])).toBe(true);
  expect(favOf((qc.getQueryData(['res']) as { Items: BaseItemDto[] }).Items[0])).toBe(true);
  expect(favOf((qc.getQueryData(['inf']) as { pages: { Items: BaseItemDto[] }[] }).pages[1].Items[0])).toBe(true);
  expect(favOf(qc.getQueryData(['one']) as BaseItemDto)).toBe(true);
  // untouched query keeps its identity
  const otherBefore = qc.getQueryData(['other']);

  rollback();
  expect(favOf((qc.getQueryData(['arr']) as BaseItemDto[])[1])).toBe(false);
  expect(favOf(qc.getQueryData(['one']) as BaseItemDto)).toBe(false);
  expect(qc.getQueryData(['other'])).toBe(otherBefore);
});

test('patches a member item nested inside a grouped card (groupMembers) and rolls back', () => {
  const qc = new QueryClient();
  const groupedCard = {
    Id: 'S',
    Type: 'Series',
    groupMembers: [item('e1'), item('e2')],
  } as unknown as BaseItemDto;
  qc.setQueryData(['recentlyAdded', 'u'], [groupedCard]);

  const rollback = applyItemUserDataToCache(qc, 'e1', { isFavorite: true });

  type Grouped = BaseItemDto & { groupMembers: BaseItemDto[] };
  const grouped = (qc.getQueryData(['recentlyAdded', 'u']) as Grouped[])[0];
  expect(grouped.groupMembers[0].UserData?.IsFavorite).toBe(true);
  expect(grouped.groupMembers[1].UserData?.IsFavorite).toBe(false);

  rollback();
  const groupedAfter = (qc.getQueryData(['recentlyAdded', 'u']) as Grouped[])[0];
  expect(groupedAfter.groupMembers[0].UserData?.IsFavorite).toBe(false);
});
