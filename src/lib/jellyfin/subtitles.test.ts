import { expect, test } from 'vitest';
import { subtitleJsonUrl, parseTrackEvents, activeCueText, cueLines } from './subtitles';
import type { SubtitleTrack } from './mediaStreams';

const track = (over: Partial<SubtitleTrack> = {}): SubtitleTrack => ({
  index: 3, label: 'Fre', language: 'fre', isDefault: false, isForced: false,
  deliveryMethod: 'External', deliveryUrl: '/Videos/x/y/Subtitles/3/0/Stream.vtt', codec: 'subrip', ...over,
});

test('subtitleJsonUrl swaps Stream.<ext> for Stream.js and appends the token', () => {
  expect(subtitleJsonUrl('/jf', 'tok', track()))
    .toBe('/jf/Videos/x/y/Subtitles/3/0/Stream.js?api_key=tok');
});

test('subtitleJsonUrl returns null for non-External or missing url', () => {
  expect(subtitleJsonUrl('/jf', 'tok', track({ deliveryMethod: 'Encode' }))).toBeNull();
  expect(subtitleJsonUrl('/jf', 'tok', track({ deliveryUrl: undefined }))).toBeNull();
});

test('parseTrackEvents converts ticks to seconds', () => {
  const cues = parseTrackEvents({ TrackEvents: [{ StartPositionTicks: 55470000, EndPositionTicks: 68820000, Text: "J'ai l'argent !" }] });
  expect(cues).toEqual([{ start: 5.547, end: 6.882, text: "J'ai l'argent !" }]);
});

test('activeCueText finds the cue covering the given time, else null', () => {
  const cues = [{ start: 5, end: 7, text: 'one' }, { start: 10, end: 12, text: 'two' }];
  expect(activeCueText(cues, 6)).toBe('one');
  expect(activeCueText(cues, 11)).toBe('two');
  expect(activeCueText(cues, 8)).toBeNull();
  expect(activeCueText(cues, 0)).toBeNull();
});

test('cueLines strips markup and splits into non-empty lines', () => {
  expect(cueLines('<i>Elle</i> arrive\nen retard')).toEqual(['Elle arrive', 'en retard']);
  expect(cueLines('<b>Bold</b>')).toEqual(['Bold']);
});
