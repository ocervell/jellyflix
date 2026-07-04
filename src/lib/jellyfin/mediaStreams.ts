import type { MediaSourceInfo, MediaStream } from '@jellyfin/sdk/lib/generated-client';

export type AudioTrack = { index: number; label: string; language?: string; isDefault: boolean };
export type SubtitleTrack = {
  index: number; label: string; language?: string; isDefault: boolean; isForced: boolean;
  deliveryMethod?: string; deliveryUrl?: string; codec?: string;
};

function label(s: MediaStream): string {
  if (s.DisplayTitle) return s.DisplayTitle;
  const lang = s.Language ?? 'Und';
  return s.IsForced ? `${lang} (Forced)` : lang;
}

export function getAudioTracks(ms: MediaSourceInfo): AudioTrack[] {
  return (ms.MediaStreams ?? []).filter((s) => s.Type === 'Audio').map((s) => ({
    index: s.Index ?? -1, label: label(s), language: s.Language ?? undefined, isDefault: !!s.IsDefault,
  }));
}

export function getSubtitleTracks(ms: MediaSourceInfo): SubtitleTrack[] {
  return (ms.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle').map((s) => ({
    index: s.Index ?? -1, label: label(s), language: s.Language ?? undefined,
    isDefault: !!s.IsDefault, isForced: !!s.IsForced,
    deliveryMethod: s.DeliveryMethod ?? undefined, deliveryUrl: s.DeliveryUrl ?? undefined,
    codec: s.Codec ?? undefined,
  }));
}

export function defaultAudioIndex(ms: MediaSourceInfo): number | undefined {
  if (ms.DefaultAudioStreamIndex != null) return ms.DefaultAudioStreamIndex;
  return getAudioTracks(ms)[0]?.index;
}

export function defaultSubtitleIndex(ms: MediaSourceInfo): number | undefined {
  if (ms.DefaultSubtitleStreamIndex != null) return ms.DefaultSubtitleStreamIndex;
  const forced = getSubtitleTracks(ms).find((t) => t.isForced);
  return forced?.index;
}

export function subtitleTrackUrl(serverUrl: string, token: string, t: SubtitleTrack): string | null {
  if (t.deliveryMethod !== 'External' || !t.deliveryUrl) return null;
  const sep = t.deliveryUrl.includes('?') ? '&' : '?';
  return `${serverUrl}${t.deliveryUrl}${sep}api_key=${token}`;
}
