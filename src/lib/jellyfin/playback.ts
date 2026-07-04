import type { Api } from '@jellyfin/sdk';
import { getMediaInfoApi } from '@jellyfin/sdk/lib/utils/api/media-info-api';
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { buildDeviceProfile } from './deviceProfile';

export async function fetchPlaybackInfo(
  api: Api, userId: string, itemId: string, startTicks = 0,
): Promise<{ mediaSource: MediaSourceInfo; playSessionId: string }> {
  const { data } = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId,
    playbackInfoDto: {
      UserId: userId,
      DeviceProfile: buildDeviceProfile(),
      StartTimeTicks: startTicks,
      MaxStreamingBitrate: 120_000_000,
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
  if (ms.TranscodingUrl && ms.TranscodingSubProtocol === 'hls') {
    return { url: `${serverUrl}${ms.TranscodingUrl}`, isHls: true };
  }
  if (ms.SupportsDirectStream || ms.SupportsDirectPlay) {
    const container = (ms.Container ?? 'mp4').split(',')[0];
    const q = new URLSearchParams({
      Static: 'true',
      mediaSourceId: ms.Id ?? itemId,
      deviceId,
      api_key: token,
    });
    return { url: `${serverUrl}/Videos/${itemId}/stream.${container}?${q.toString()}`, isHls: false };
  }
  if (ms.TranscodingUrl) {
    return { url: `${serverUrl}${ms.TranscodingUrl}`, isHls: ms.TranscodingSubProtocol === 'hls' };
  }
  throw new Error('No streamable URL for media source');
}
