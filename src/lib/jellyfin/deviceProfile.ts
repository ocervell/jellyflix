import type { DeviceProfile } from '@jellyfin/sdk/lib/generated-client';

export function buildDeviceProfile(): DeviceProfile {
  return {
    MaxStreamingBitrate: 120_000_000,
    MaxStaticBitrate: 100_000_000,
    DirectPlayProfiles: [
      { Container: 'mp4,m4v,mkv,webm', Type: 'Video', VideoCodec: 'h264,hevc,vp8,vp9,av1', AudioCodec: 'aac,mp3,ac3,eac3,opus,flac,vorbis' },
    ],
    TranscodingProfiles: [
      { Container: 'ts', Type: 'Video', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac,mp3', Context: 'Streaming' },
    ],
    CodecProfiles: [],
    SubtitleProfiles: [
      { Format: 'vtt', Method: 'External' },
    ],
  } as DeviceProfile;
}
