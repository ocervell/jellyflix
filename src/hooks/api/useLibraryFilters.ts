import { useQuery } from '@tanstack/react-query';
import { getFilterApi } from '@jellyfin/sdk/lib/utils/api/filter-api';
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';

export function useLibraryFilters(view: { id: string; includeItemTypes: string[] }) {
  const { api, session } = useApi();
  const { data } = useQuery({
    queryKey: ['libraryFilters', session.userId, view.id],
    enabled: !!view.id,
    queryFn: async ({ signal }) => {
      const res = await getFilterApi(api).getQueryFiltersLegacy(
        { userId: session.userId, parentId: view.id, includeItemTypes: view.includeItemTypes as BaseItemKind[] },
        { signal },
      );
      return res.data;
    },
  });
  const genres = [...(data?.Genres ?? [])].sort((a, b) => a.localeCompare(b));
  const decades = [...new Set((data?.Years ?? []).map((y) => Math.floor(y / 10) * 10))].sort((a, b) => b - a);
  return { genres, decades };
}
