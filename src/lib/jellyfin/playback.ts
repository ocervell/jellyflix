import type { Api } from '@jellyfin/sdk';
import { getMediaInfoApi } from '@jellyfin/sdk/lib/utils/api/media-info-api';
import { getTvShowsApi } from '@jellyfin/sdk/lib/utils/api/tv-shows-api';
import type { BaseItemDto, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { buildDeviceProfile } from './deviceProfile';

export type NegotiateParams = {
  startTicks?: number;
  maxBitrate?: number;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
};

/**
 * Resolves the item that should actually be played. Movies/episodes play themselves;
 * a Series has no MediaSources, so we resolve to a playable episode: prefer the
 * series' next-up episode, falling back to the first episode of its first season.
 */
export async function resolvePlayableItem(
  api: Api, userId: string, item: BaseItemDto,
): Promise<{ id: string; startTicks: number }> {
  if (item.Type !== 'Series') {
    return { id: item.Id ?? '', startTicks: item.UserData?.PlaybackPositionTicks ?? 0 };
  }
  const seriesId = item.Id;
  if (!seriesId) throw new Error('Series has no id');

  const { data: nextUpData } = await getTvShowsApi(api).getNextUp({ userId, seriesId, limit: 1 });
  const nextUp = nextUpData.Items?.[0];
  if (nextUp?.Id) {
    return { id: nextUp.Id, startTicks: nextUp.UserData?.PlaybackPositionTicks ?? 0 };
  }

  const { data: seasonsData } = await getTvShowsApi(api).getSeasons({ seriesId, userId });
  const firstSeason = seasonsData.Items?.[0];
  if (!firstSeason?.Id) throw new Error('No playable episode found for series');

  const { data: episodesData } = await getTvShowsApi(api).getEpisodes({ seriesId, userId, seasonId: firstSeason.Id });
  const firstEpisode = episodesData.Items?.[0];
  if (!firstEpisode?.Id) throw new Error('No playable episode found for series');

  return { id: firstEpisode.Id, startTicks: firstEpisode.UserData?.PlaybackPositionTicks ?? 0 };
}

export async function fetchPlaybackInfo(
  api: Api, userId: string, itemId: string, params: NegotiateParams = {},
): Promise<{ mediaSource: MediaSourceInfo; playSessionId: string }> {
  const { data } = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId,
    playbackInfoDto: {
      UserId: userId,
      DeviceProfile: buildDeviceProfile(params.maxBitrate),
      StartTimeTicks: params.startTicks ?? 0,
      MaxStreamingBitrate: params.maxBitrate ?? 120_000_000,
      AudioStreamIndex: params.audioStreamIndex,
      SubtitleStreamIndex: params.subtitleStreamIndex,
      AutoOpenLiveStream: true,
    },
  });
  const mediaSource = data.MediaSources?.[0];
  if (!mediaSource) throw new Error('No playable media source');
  return { mediaSource, playSessionId: data.PlaySessionId ?? '' };
}

export function resolveStreamUrl(
  serverUrl: string, token: string, itemId: string, ms: MediaSourceInfo, deviceId: string,
): { url: string; isHls: boolean } {
  if (ms.SupportsDirectStream || ms.SupportsDirectPlay) {
    const container = (ms.Container ?? 'mp4').split(',')[0];
    const q = new URLSearchParams({ Static: 'true', mediaSourceId: ms.Id ?? itemId, deviceId, api_key: token });
    return { url: `${serverUrl}/Videos/${itemId}/stream.${container}?${q.toString()}`, isHls: false };
  }
  if (ms.TranscodingUrl) {
    return { url: `${serverUrl}${ms.TranscodingUrl}`, isHls: ms.TranscodingSubProtocol === 'hls' };
  }
  throw new Error('No streamable URL for media source');
}

export async function stopEncoding(api: Api, deviceId: string, playSessionId: string): Promise<void> {
  if (!playSessionId) return;
  try {
    await api.axiosInstance.delete(`${api.basePath}/Videos/ActiveEncodings`, { params: { deviceId, playSessionId } });
  } catch { /* best-effort */ }
}
