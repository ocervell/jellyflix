import { expect, test, vi, beforeEach } from 'vitest';

let clock = 0;
const now = () => clock;
function makeApi(bytesPerStage: number, msPerStage: number) {
  return {
    basePath: '/jf',
    axiosInstance: { get: vi.fn().mockImplementation(async () => { clock += msPerStage; return { data: { size: bytesPerStage } }; }) },
  } as never;
}
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
  const api = makeApi(3_000_000, 100); // each stage returns 3MB in 100ms => 240Mbps raw
  const r = await measureBandwidth(api, { force: true, now });
  expect(r).toBe(Math.round(240_000_000 * 0.7));
});
