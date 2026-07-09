import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

export type EngineState = {
  paused: boolean; currentTime: number; duration: number; bufferedEnd: number;
  volume: number; muted: boolean; waiting: boolean; stallCount: number;
  // HTMLMediaElement.readyState: 4 = HAVE_ENOUGH_DATA (playing or user-paused),
  // < 3 = not enough buffered to play forward (stalling / reloading). This is how we
  // tell "buffering" apart from "the user paused" (which keeps readyState at 4).
  readyState: number;
};

export type VideoEngine = {
  videoRef: React.RefObject<HTMLVideoElement>;
  state: EngineState;
  play(): void; pause(): void; togglePlay(): void;
  seek(s: number): void; seekBy(delta: number): void;
  setVolume(v: number): void; toggleMute(): void; requestFullscreen(): void;
};

const INITIAL: EngineState = {
  paused: true, currentTime: 0, duration: 0, bufferedEnd: 0,
  volume: 1, muted: false, waiting: false, stallCount: 0, readyState: 0,
};

export function useVideoEngine(opts: { src: string; isHls: boolean; startSeconds: number; onError: (msg: string) => void }): VideoEngine {
  const { src, isHls, startSeconds, onError } = opts;
  const videoRef = useRef<HTMLVideoElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [state, setState] = useState<EngineState>(INITIAL);

  // Source attach + hls lifecycle
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | undefined;
    if (isHls && Hls.isSupported()) {
      // startPosition seeks the transcode to the resume point. Jellyfin's HLS manifest is
      // absolute (full duration), so without this a resumed episode plays from the start.
      hls = new Hls({ startPosition: startSeconds > 0 ? startSeconds : -1 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls!.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls!.recoverMediaError();
        else { hls!.destroy(); onErrorRef.current('Playback failed'); }
      });
    } else {
      video.src = src;
    }
    const onLoaded = () => { if (!isHls && startSeconds > 0) video.currentTime = startSeconds; };
    video.addEventListener('loadedmetadata', onLoaded);
    return () => { video.removeEventListener('loadedmetadata', onLoaded); hls?.destroy(); };
  }, [src, isHls, startSeconds]);

  // State sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setState((s) => ({
      ...s,
      paused: video.paused,
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      bufferedEnd: video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0,
      volume: video.volume, muted: video.muted, readyState: video.readyState,
    }));
    const onWaiting = () => setState((s) => ({ ...s, waiting: true, stallCount: s.stallCount + 1 }));
    const onPlaying = () => setState((s) => ({ ...s, waiting: false }));
    const evts = ['timeupdate', 'durationchange', 'progress', 'play', 'pause', 'volumechange',
      'waiting', 'playing', 'canplay', 'canplaythrough', 'loadeddata', 'emptied', 'seeking', 'seeked'] as const;
    evts.forEach((e) => video.addEventListener(e, sync));
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onWaiting);
    video.addEventListener('playing', onPlaying);
    sync();
    return () => {
      evts.forEach((e) => video.removeEventListener(e, sync));
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onWaiting);
      video.removeEventListener('playing', onPlaying);
    };
  }, [src]);

  const play = useCallback(() => { void videoRef.current?.play().catch(() => {}); }, []);
  const pause = useCallback(() => videoRef.current?.pause(), []);
  const togglePlay = useCallback(() => { const v = videoRef.current; if (!v) return; if (v.paused) void v.play().catch(() => {}); else v.pause(); }, []);
  const seek = useCallback((s: number) => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, s); }, []);
  const seekBy = useCallback((d: number) => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + d)); }, []);
  const setVolume = useCallback((val: number) => { const v = videoRef.current; if (v) { v.volume = Math.max(0, Math.min(1, val)); v.muted = val === 0; } }, []);
  const toggleMute = useCallback(() => { const v = videoRef.current; if (v) v.muted = !v.muted; }, []);
  const requestFullscreen = useCallback(() => { const v = videoRef.current; if (!v) return; const el = v.parentElement ?? v; if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void el.requestFullscreen?.().catch(() => {}); }, []);

  return { videoRef: videoRef as React.RefObject<HTMLVideoElement>, state, play, pause, togglePlay, seek, seekBy, setVolume, toggleMute, requestFullscreen };
}
