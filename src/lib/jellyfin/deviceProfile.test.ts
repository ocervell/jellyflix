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
