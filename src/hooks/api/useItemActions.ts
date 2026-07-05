import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api';
import { getPlaystateApi } from '@jellyfin/sdk/lib/utils/api/playstate-api';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { applyItemUserDataToCache } from '../../lib/query/cacheUpdate';

export function useToggleFavorite(): (item: BaseItemDto) => void {
  const { api, session } = useApi();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (item: BaseItemDto) => {
      const lib = getUserLibraryApi(api);
      const req = { userId: session.userId, itemId: item.Id ?? '' };
      const res = item.UserData?.IsFavorite ? await lib.unmarkFavoriteItem(req) : await lib.markFavoriteItem(req);
      return res.data;
    },
    onMutate: async (item: BaseItemDto) => {
      await qc.cancelQueries();
      const rollback = applyItemUserDataToCache(qc, item.Id ?? '', { isFavorite: !item.UserData?.IsFavorite });
      return { rollback };
    },
    onError: (_e, _item, ctx) => ctx?.rollback(),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['favorites', session.userId] }); },
  });
  return (item) => m.mutate(item);
}

export function useToggleWatched(): (item: BaseItemDto) => void {
  const { api, session } = useApi();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (item: BaseItemDto) => {
      const ps = getPlaystateApi(api);
      const req = { userId: session.userId, itemId: item.Id ?? '' };
      const res = item.UserData?.Played ? await ps.markUnplayedItem(req) : await ps.markPlayedItem(req);
      return res.data;
    },
    onMutate: async (item: BaseItemDto) => {
      await qc.cancelQueries();
      const rollback = applyItemUserDataToCache(qc, item.Id ?? '', { played: !item.UserData?.Played });
      return { rollback };
    },
    onError: (_e, _item, ctx) => ctx?.rollback(),
    onSettled: (_d, _e, item) => {
      void qc.invalidateQueries({ queryKey: ['resume', session.userId] });
      void qc.invalidateQueries({ queryKey: ['nextUp', session.userId] });
      void qc.invalidateQueries({ queryKey: ['item', session.userId, item.Id ?? ''] });
    },
  });
  return (item) => m.mutate(item);
}
