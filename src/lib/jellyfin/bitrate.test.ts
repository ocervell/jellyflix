import { expect, test, vi, beforeEach } from 'vitest';

let clock = 0;
const now = () => clock;
vi.mock('@jellyfin/sdk/lib/utils/api/system-api', () => ({
  getSystemApi: () => ({ getEndpointInfo: vi.fn().mockResolvedValue({ data: { IsInNetwork: false } }) }),
}));

beforeEach(() => { clock = 0; });

test('normalizeBitrate applies 0.7 safety', async () => {
  const { normalizeBitrate } = await import('./bitrate');
  expect(normalizeBitrate(10_000_000)).toBe(7_000_000);
});

test('measureBandwidth computes from bytes/time and normalizes', async () => {
  const { measureBandwidth } = await import('./bitrate');
  // 500KB in 100ms => 500000*8/0.1 = 40Mbps raw > 500k threshold => escalate...
  const mockGet = vi.fn().mockImplementation(async () => { clock += 100; return { data: { size: 3_000_000 } }; });
  const api = {
    basePath: '/jf',
    accessToken: 'tok',
    axiosInstance: { get: mockGet },
  } as never;
  const r = await measureBandwidth(api, { force: true, now });
  expect(r).toBe(Math.round(240_000_000 * 0.7));
  // Verify that axiosInstance.get was called with api_key in params
  expect(mockGet).toHaveBeenCalledWith(
    expect.stringContaining('/Playback/BitrateTest'),
    expect.objectContaining({
      params: expect.objectContaining({
        api_key: 'tok',
        Size: expect.any(Number),
      }),
    }),
  );
});
