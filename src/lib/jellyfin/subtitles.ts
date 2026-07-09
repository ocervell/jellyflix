import type { SubtitleTrack } from './mediaStreams';

export type SubtitleCue = { start: number; end: number; text: string };

/**
 * URL for Jellyfin's JSON cue endpoint. The External deliveryUrl points at
 * `Stream.<ext>`; swapping the extension for `.js` returns `{ TrackEvents: [...] }`,
 * which we render in a custom overlay. We do NOT use a native <track>: hls.js clears
 * a native track's cues on transcoded (HLS) streams, so subtitles never render there.
 */
export function subtitleJsonUrl(serverUrl: string, token: string, t: SubtitleTrack): string | null {
  if (t.deliveryMethod !== 'External' || !t.deliveryUrl) return null;
  const jsUrl = t.deliveryUrl.replace(/Stream\.[a-z0-9]+/i, 'Stream.js');
  const sep = jsUrl.includes('?') ? '&' : '?';
  return `${serverUrl}${jsUrl}${sep}api_key=${token}`;
}

type TrackEvent = { StartPositionTicks?: number; EndPositionTicks?: number; Text?: string };

export function parseTrackEvents(json: { TrackEvents?: TrackEvent[] }): SubtitleCue[] {
  return (json.TrackEvents ?? []).map((e) => ({
    start: (e.StartPositionTicks ?? 0) / 10_000_000,
    end: (e.EndPositionTicks ?? 0) / 10_000_000,
    text: e.Text ?? '',
  }));
}

/** The cue covering `seconds`, or null. Cues are time-ordered; a linear scan is fine. */
export function activeCueText(cues: SubtitleCue[], seconds: number): string | null {
  const c = cues.find((c) => seconds >= c.start && seconds <= c.end);
  return c ? c.text : null;
}

/** Strip subtitle markup (<i>, <b>, …) and split into plain display lines. */
export function cueLines(text: string): string[] {
  return text.replace(/<[^>]+>/g, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}
