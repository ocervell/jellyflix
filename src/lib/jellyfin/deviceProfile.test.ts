import { beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((t: string) =>
    t.includes('avc1') || t.includes('mp4a') ? 'probably' : '');
});

test('buildDeviceProfile excludes HEVC from direct play when unsupported, keeps h264', async () => {
  const { buildDeviceProfile } = await import('./deviceProfile');
  const p = buildDeviceProfile(3_000_000);
  const dp = p.DirectPlayProfiles!.find((x) => x.Type === 'Video')!;
  expect(dp.VideoCodec).toContain('h264');
  expect(dp.VideoCodec).not.toContain('hevc');
  expect(p.MaxStreamingBitrate).toBe(3_000_000);
  const subs = (p.SubtitleProfiles ?? []).map((s) => `${s.Format}:${s.Method}`);
  expect(subs).toContain('vtt:External');
  expect(subs).toContain('pgssub:Encode');
});

test('excludes undecodable AC3/EAC3 audio and always transcodes to AAC (fixes silent Dolby audio)', async () => {
  // mock: only aac (mp4a) is a supported audio codec; ac3/eac3 (ac-3/ec-3) are not.
  const { buildDeviceProfile } = await import('./deviceProfile');
  const p = buildDeviceProfile();
  const dp = p.DirectPlayProfiles!.find((x) => x.Type === 'Video')!;
  // 'ac3' substring also matches 'eac3', so this asserts BOTH are gone from direct play.
  expect(dp.AudioCodec).toContain('aac');
  expect(dp.AudioCodec).not.toContain('ac3');
  const tp = p.TranscodingProfiles!.find((x) => x.Type === 'Video')!;
  expect(tp.AudioCodec).toContain('aac');
  expect(tp.AudioCodec).not.toContain('ac3'); // never copy Dolby into the transcode
});
