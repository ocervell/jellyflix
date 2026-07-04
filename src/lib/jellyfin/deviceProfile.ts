import type { DeviceProfile } from '@jellyfin/sdk/lib/generated-client';

const CODEC_TEST: Record<string, string> = {
  h264: 'video/mp4; codecs="avc1.640028"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  vp9: 'video/webm; codecs="vp9"',
  av1: 'video/mp4; codecs="av01.0.05M.08"',
};

export function canPlayCodec(codec: string): boolean {
  if (codec === 'h264') return true; // universally supported baseline
  const t = CODEC_TEST[codec];
  if (!t) return false;
  const v = document.createElement('video');
  return v.canPlayType(t) !== '';
}

export function buildDeviceProfile(maxBitrate?: number): DeviceProfile {
  const videoCodecs = ['h264', 'hevc', 'vp9', 'av1'].filter(canPlayCodec).join(',');
  return {
    MaxStreamingBitrate: maxBitrate ?? 120_000_000,
    MaxStaticBitrate: 100_000_000,
    DirectPlayProfiles: [
      { Container: 'mp4,m4v,mkv,webm', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: 'aac,mp3,ac3,eac3,opus,flac,vorbis' },
    ],
    TranscodingProfiles: [
      { Container: 'ts', Type: 'Video', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac,ac3,eac3,mp3', Context: 'Streaming' },
    ],
    CodecProfiles: [],
    SubtitleProfiles: [
      { Format: 'vtt', Method: 'External' },
      { Format: 'ass', Method: 'Encode' },
      { Format: 'ssa', Method: 'Encode' },
      { Format: 'pgssub', Method: 'Encode' },
    ],
  } as DeviceProfile;
}
