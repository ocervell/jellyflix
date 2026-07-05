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

// Audio codecs the browser can actually decode. Dolby (ac3/eac3), DTS, TrueHD are
// NOT decodable in Chrome/Firefox — listing them makes the server COPY that audio
// into the stream, producing silent video. So gate them by canPlayType and always
// transcode to AAC otherwise. (Audio twin of the HEVC video gating above.)
const AUDIO_CODEC_TEST: Record<string, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/webm; codecs="opus"',
  flac: 'audio/ogg; codecs="flac"',
  vorbis: 'audio/webm; codecs="vorbis"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
};

export function canPlayAudioCodec(codec: string): boolean {
  if (codec === 'aac') return true; // universally supported baseline + transcode target
  const t = AUDIO_CODEC_TEST[codec];
  if (!t) return false;
  const a = document.createElement('audio');
  return a.canPlayType(t) !== '';
}

export function buildDeviceProfile(maxBitrate?: number): DeviceProfile {
  const videoCodecs = ['h264', 'hevc', 'vp9', 'av1'].filter(canPlayCodec).join(',');
  const audioCodecs = ['aac', 'mp3', 'opus', 'flac', 'vorbis', 'ac3', 'eac3'].filter(canPlayAudioCodec).join(',');
  return {
    MaxStreamingBitrate: maxBitrate ?? 120_000_000,
    MaxStaticBitrate: 100_000_000,
    DirectPlayProfiles: [
      { Container: 'mp4,m4v,mkv,webm', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: audioCodecs },
    ],
    TranscodingProfiles: [
      // Only browser-decodable targets; never AC3/EAC3 (which would be copied, not transcoded).
      { Container: 'ts', Type: 'Video', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac,mp3', Context: 'Streaming' },
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
