import type { Api } from '@jellyfin/sdk';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';

const STAGES: { size: number; threshold: number }[] = [
  { size: 500_000, threshold: 500_000 },
  { size: 1_000_000, threshold: 20_000_000 },
  { size: 3_000_000, threshold: 50_000_000 },
];
const LAN_FLOOR = 140_000_000;
const FALLBACK = 8_000_000;
const CACHE_MS = 3_600_000;

let cached: { value: number; at: number } | null = null;

export function normalizeBitrate(bps: number): number {
  return Math.min(Math.round(bps * 0.7), 2_147_483_647);
}

async function measureStage(api: Api, size: number, now: () => number): Promise<number> {
  const start = now();
  const { data } = await api.axiosInstance.get(`${api.basePath}/Playback/BitrateTest`, { params: { Size: size }, responseType: 'blob' });
  const bytes = (data as Blob).size ?? size;
  const seconds = Math.max((now() - start) / 1000, 0.001);
  return (bytes * 8) / seconds;
}

export async function measureBandwidth(api: Api, opts: { force?: boolean; now?: () => number } = {}): Promise<number> {
  const now = opts.now ?? (() => performance.now());
  if (!opts.force && cached && now() - cached.at < CACHE_MS) return cached.value;
  try {
    let raw = 0;
    for (const stage of STAGES) {
      raw = await measureStage(api, stage.size, now);
      if (raw <= stage.threshold) break;
    }
    let result = normalizeBitrate(raw);
    try {
      const { data } = await getSystemApi(api).getEndpointInfo();
      if (data.IsInNetwork) result = Math.max(result, LAN_FLOOR);
    } catch { /* ignore endpoint failure */ }
    cached = { value: result, at: now() };
    return result;
  } catch {
    return FALLBACK;
  }
}
