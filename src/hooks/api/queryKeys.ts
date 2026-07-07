export const qk = {
  userViews: (userId: string) => ['userViews', userId] as const,
  resume: (userId: string) => ['resume', userId] as const,
  nextUp: (userId: string) => ['nextUp', userId] as const,
  latest: (userId: string, parentId: string) => ['latest', userId, parentId] as const,
  hotNow: (userId: string) => ['hotNow', userId] as const,
  item: (userId: string, itemId: string) => ['item', userId, itemId] as const,
  seasons: (seriesId: string) => ['seasons', seriesId] as const,
  episodes: (seriesId: string, seasonId: string) => ['episodes', seriesId, seasonId] as const,
};
