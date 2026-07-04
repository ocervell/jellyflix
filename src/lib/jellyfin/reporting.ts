import type { Api } from '@jellyfin/sdk';
import { getPlaystateApi } from '@jellyfin/sdk/lib/utils/api/playstate-api';

type Base = { itemId: string; playSessionId: string; positionTicks: number };

export async function reportStart(api: Api, p: Base): Promise<void> {
  await getPlaystateApi(api).reportPlaybackStart({
    playbackStartInfo: { ItemId: p.itemId, PlaySessionId: p.playSessionId, PositionTicks: p.positionTicks, CanSeek: true },
  });
}

export async function reportProgress(api: Api, p: Base & { isPaused: boolean }): Promise<void> {
  await getPlaystateApi(api).reportPlaybackProgress({
    playbackProgressInfo: { ItemId: p.itemId, PlaySessionId: p.playSessionId, PositionTicks: p.positionTicks, IsPaused: p.isPaused },
  });
}

export async function reportStopped(api: Api, p: Base): Promise<void> {
  await getPlaystateApi(api).reportPlaybackStopped({
    playbackStopInfo: { ItemId: p.itemId, PlaySessionId: p.playSessionId, PositionTicks: p.positionTicks },
  });
}
