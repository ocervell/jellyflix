import { expect, test } from 'vitest';
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { getAudioTracks, getSubtitleTracks, defaultAudioIndex, defaultSubtitleIndex, subtitleTrackUrl } from './mediaStreams';

const ms = {
  DefaultAudioStreamIndex: 2,
  MediaStreams: [
    { Index: 0, Type: 'Video', Codec: 'h264' },
    { Index: 1, Type: 'Audio', Language: 'eng', DisplayTitle: 'English 5.1', IsDefault: false },
    { Index: 2, Type: 'Audio', Language: 'fre', DisplayTitle: 'Français 5.1', IsDefault: true },
    { Index: 3, Type: 'Subtitle', Language: 'eng', DisplayTitle: 'English', IsForced: false, DeliveryMethod: 'External', DeliveryUrl: '/Videos/x/y/Subtitles/3/0/Stream.vtt', Codec: 'subrip' },
  ],
} as unknown as MediaSourceInfo;

test('audio tracks + default', () => {
  const a = getAudioTracks(ms);
  expect(a.map((t) => t.index)).toEqual([1, 2]);
  expect(a[1].label).toBe('Français 5.1');
  expect(defaultAudioIndex(ms)).toBe(2);
});
test('subtitle tracks carry delivery info', () => {
  const s = getSubtitleTracks(ms);
  expect(s[0]).toMatchObject({ index: 3, deliveryMethod: 'External', deliveryUrl: '/Videos/x/y/Subtitles/3/0/Stream.vtt' });
});
test('subtitleTrackUrl builds an authed same-origin url for External', () => {
  const s = getSubtitleTracks(ms)[0];
  expect(subtitleTrackUrl('/jf', 'tok', s)).toBe('/jf/Videos/x/y/Subtitles/3/0/Stream.vtt?api_key=tok');
});
test('defaultSubtitleIndex undefined when none set', () => {
  expect(defaultSubtitleIndex(ms)).toBeUndefined();
});
