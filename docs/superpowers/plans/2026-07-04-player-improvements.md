# Jellyflix Player Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the rudimentary `<video controls>` player into a Netflix-grade one: custom controls, audio/subtitle selection, automatic adaptive quality, and scrubber thumbnail previews.

**Architecture:** A `useVideoEngine` hook owns the `<video>`/hls.js element; a `usePlaybackSession` controller owns position and can *renegotiate* the stream (new `PlaybackInfo` at the current position → stop old encoding → swap source → seek). Audio switches, burned-subtitle switches, and every auto-quality shift all go through renegotiation. Pure libs (`bitrate`, `mediaStreams`, `trickplay`, `abr`, `deviceProfile`) are unit-tested in isolation.

**Tech Stack:** React 18 + TS, `@jellyfin/sdk`, hls.js, Vitest + RTL. No new deps.

## Global Constraints

- TypeScript `strict: true`; **no `any`** in `lib/` or `hooks/` (test fixtures may cast).
- Dev server reached via Vite proxy prefix `/jf`; `session.serverUrl === '/jf'`. All stream/subtitle/API URLs must stay same-origin through `/jf`.
- Ticks are 100-ns: `seconds = ticks / 10_000_000`.
- Do NOT modify `vitest.setup.ts` or `vite.config.ts`. `vitest.setup.ts` already provides a `localStorage` polyfill and jest-dom.
- After any task that edits `vite.config.ts`… (none do) — but after `npm run build`/`tsc -b`, delete regenerated `vite.config.js`/`vite.config.d.ts` (git-ignored) so `git status` is clean.
- Subtitle/stream/trickplay/bitrate URLs carry auth as the `api_key` query param (native `<track>` and `<img>`/CSS fetches don't send headers). SDK calls use `api.axiosInstance` (auth already configured).
- Verified server facts: `GET /Playback/BitrateTest?Size={n}` returns ≥n bytes; `GET /System/Endpoint` → `{IsInNetwork}`; a low `MaxStreamingBitrate` + h264-only profile yields `TranscodingUrl: /videos/{id}/master.m3u8...` (`TranscodingSubProtocol==='hls'`); declaring `SubtitleProfiles:[{Format:'vtt',Method:'External'}]` makes embedded SRT come back as `DeliveryMethod:'External'` with a `DeliveryUrl` (`/Videos/{id}/{msId}/Subtitles/{index}/…Stream.vtt`).
- Netflix tokens exist in `src/styles/tokens.css`. Motion gated behind `prefers-reduced-motion` where animated.
- Commit after each task with the shown message.

---

## Phase 1 — Player engine + custom controls

### Task 1: `formatTime` helper

**Files:**
- Modify: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Produces: `formatTime(seconds: number): string` → `m:ss` under an hour, `h:mm:ss` at/over an hour; negatives/NaN → `0:00`.

- [ ] **Step 1: Add failing tests** — append to `src/lib/format.test.ts`:
```ts
import { formatTime } from './format';

test('formatTime', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(9)).toBe('0:09');
  expect(formatTime(75)).toBe('1:15');
  expect(formatTime(3661)).toBe('1:01:01');
  expect(formatTime(-5)).toBe('0:00');
  expect(formatTime(NaN)).toBe('0:00');
});
```

- [ ] **Step 2: Run, verify fail** — `npm test src/lib/format.test.ts` → FAIL (formatTime not exported).

- [ ] **Step 3: Implement** — append to `src/lib/format.ts`:
```ts
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: formatTime helper for player timecodes"`

### Task 2: `useVideoEngine` hook

**Files:**
- Create: `src/hooks/player/useVideoEngine.ts`
- Test: `src/hooks/player/useVideoEngine.test.tsx`

**Interfaces:**
- Consumes: hls.js.
- Produces:
  - `type EngineState = { paused: boolean; currentTime: number; duration: number; bufferedEnd: number; volume: number; muted: boolean; waiting: boolean; stallCount: number }`
  - `type VideoEngine = { videoRef: React.RefObject<HTMLVideoElement>; state: EngineState; play(): void; pause(): void; togglePlay(): void; seek(s: number): void; seekBy(delta: number): void; setVolume(v: number): void; toggleMute(): void; requestFullscreen(): void }`
  - `function useVideoEngine(opts: { src: string; isHls: boolean; startSeconds: number; onError: (msg: string) => void }): VideoEngine`
  - Attaches hls.js when `isHls && Hls.isSupported()` (with `Hls.Events.ERROR` recovery: network→`startLoad`, media→`recoverMediaError`, else destroy + `onError('Playback failed')`), else `video.src = src`; seeks to `startSeconds` on `loadedmetadata` (progressive only — HLS is server-seeked). Increments `stallCount` and sets `waiting` on `waiting`/`stalled`; clears on `playing`.

- [ ] **Step 1: Write failing test**
```tsx
import { render, act } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
vi.mock('hls.js', () => ({ default: class { static isSupported() { return false; } destroy() {} } }));
import { useVideoEngine } from './useVideoEngine';

function Probe({ src }: { src: string }) {
  const eng = useVideoEngine({ src, isHls: false, startSeconds: 0, onError: () => {} });
  return <video ref={eng.videoRef} data-testid="v" data-paused={eng.state.paused} />;
}

test('attaches progressive src to the video element', () => {
  const { getByTestId } = render(<Probe src="http://x/stream.mp4" />);
  const v = getByTestId('v') as HTMLVideoElement;
  expect(v.getAttribute('src')).toBe('http://x/stream.mp4');
});

test('togglePlay + seekBy operate on the element', () => {
  let eng: ReturnType<typeof useVideoEngine> | null = null;
  function P() { eng = useVideoEngine({ src: 'http://x/a.mp4', isHls: false, startSeconds: 0, onError: () => {} }); return <video ref={eng.videoRef} />; }
  render(<P />);
  const v = document.querySelector('video')!;
  Object.defineProperty(v, 'duration', { value: 100, configurable: true });
  act(() => eng!.seek(30));
  expect(v.currentTime).toBe(30);
  act(() => eng!.seekBy(10));
  expect(v.currentTime).toBe(40);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `useVideoEngine.ts`**
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

export type EngineState = {
  paused: boolean; currentTime: number; duration: number; bufferedEnd: number;
  volume: number; muted: boolean; waiting: boolean; stallCount: number;
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
  volume: 1, muted: false, waiting: false, stallCount: 0,
};

export function useVideoEngine(opts: { src: string; isHls: boolean; startSeconds: number; onError: (msg: string) => void }): VideoEngine {
  const { src, isHls, startSeconds, onError } = opts;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<EngineState>(INITIAL);

  // Source attach + hls lifecycle
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | undefined;
    if (isHls && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls!.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls!.recoverMediaError();
        else { hls!.destroy(); onError('Playback failed'); }
      });
    } else {
      video.src = src;
    }
    const onLoaded = () => { if (!isHls && startSeconds > 0) video.currentTime = startSeconds; };
    video.addEventListener('loadedmetadata', onLoaded);
    return () => { video.removeEventListener('loadedmetadata', onLoaded); hls?.destroy(); };
  }, [src, isHls, startSeconds, onError]);

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
      volume: video.volume, muted: video.muted,
    }));
    const onWaiting = () => setState((s) => ({ ...s, waiting: true, stallCount: s.stallCount + 1 }));
    const onPlaying = () => setState((s) => ({ ...s, waiting: false }));
    const evts = ['timeupdate', 'durationchange', 'progress', 'play', 'pause', 'volumechange'] as const;
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

  return { videoRef, state, play, pause, togglePlay, seek, seekBy, setVolume, toggleMute, requestFullscreen };
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: useVideoEngine hook (progressive+hls, state, controls, stall signals)"`

### Task 3: `Scrubber` component + position math

**Files:**
- Create: `src/lib/player/scrubber.ts`, `src/lib/player/scrubber.test.ts`
- Create: `src/components/player/Scrubber.tsx`, `src/components/player/Scrubber.module.css`
- Test: `src/components/player/Scrubber.test.tsx`

**Interfaces:**
- Produces:
  - `fractionToTime(fraction: number, duration: number): number` — clamp `fraction` to [0,1], `* duration`.
  - `pointerFraction(clientX: number, rect: { left: number; width: number }): number` — `(clientX-left)/width`, clamped [0,1].
  - `Scrubber({ currentTime, duration, bufferedEnd, onScrub, onHover })` — a bar showing played + buffered; click/drag calls `onScrub(seconds)`; pointer move calls `onHover({ seconds, x }|null)`.

- [ ] **Step 1: Write failing test** `scrubber.test.ts`
```ts
import { expect, test } from 'vitest';
import { fractionToTime, pointerFraction } from './scrubber';

test('pointerFraction clamps to [0,1]', () => {
  expect(pointerFraction(50, { left: 0, width: 100 })).toBe(0.5);
  expect(pointerFraction(-10, { left: 0, width: 100 })).toBe(0);
  expect(pointerFraction(200, { left: 0, width: 100 })).toBe(1);
});
test('fractionToTime scales & clamps', () => {
  expect(fractionToTime(0.5, 120)).toBe(60);
  expect(fractionToTime(2, 120)).toBe(120);
  expect(fractionToTime(-1, 120)).toBe(0);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `scrubber.ts`**
```ts
export function pointerFraction(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}
export function fractionToTime(fraction: number, duration: number): number {
  return Math.max(0, Math.min(1, fraction)) * duration;
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Write Scrubber component test** `Scrubber.test.tsx`
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Scrubber from './Scrubber';

test('clicking the bar scrubs to the mapped time', () => {
  const onScrub = vi.fn();
  render(<Scrubber currentTime={0} duration={100} bufferedEnd={0} onScrub={onScrub} onHover={() => {}} />);
  const bar = screen.getByRole('slider');
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100, top: 0, height: 4, right: 100, bottom: 4, x: 0, y: 0, toJSON: () => {} });
  fireEvent.pointerDown(bar, { clientX: 25 });
  expect(onScrub).toHaveBeenCalledWith(25);
});
```

- [ ] **Step 6: Implement `Scrubber.tsx`**
```tsx
import { useRef } from 'react';
import { fractionToTime, pointerFraction } from '../../lib/player/scrubber';
import styles from './Scrubber.module.css';

export default function Scrubber({
  currentTime, duration, bufferedEnd, onScrub, onHover,
}: {
  currentTime: number; duration: number; bufferedEnd: number;
  onScrub: (seconds: number) => void;
  onHover: (info: { seconds: number; x: number } | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = (v: number) => (duration > 0 ? (v / duration) * 100 : 0);
  const at = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return { f: pointerFraction(clientX, rect), x: clientX - rect.left };
  };
  return (
    <div
      ref={ref}
      className={styles.bar}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      tabIndex={0}
      onPointerDown={(e) => { const { f } = at(e.clientX); onScrub(fractionToTime(f, duration)); }}
      onPointerMove={(e) => { const { f, x } = at(e.clientX); onHover({ seconds: fractionToTime(f, duration), x }); }}
      onPointerLeave={() => onHover(null)}
    >
      <div className={styles.track} />
      <div className={styles.buffered} style={{ width: `${pct(bufferedEnd)}%` }} />
      <div className={styles.played} style={{ width: `${pct(currentTime)}%` }} />
      <div className={styles.knob} style={{ left: `${pct(currentTime)}%` }} />
    </div>
  );
}
```
`Scrubber.module.css`:
```css
.bar { position: relative; height: 16px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.track, .buffered, .played { position: absolute; height: 4px; border-radius: 2px; }
.track { left: 0; right: 0; background: rgba(255,255,255,.3); }
.buffered { left: 0; background: rgba(255,255,255,.5); }
.played { left: 0; background: var(--nf-red); }
.knob { position: absolute; width: 12px; height: 12px; border-radius: 50%; background: var(--nf-red); transform: translateX(-50%); }
.bar:focus-visible { outline: 2px solid var(--nf-white); outline-offset: 4px; }
```

- [ ] **Step 7: Run all tests, verify pass. Commit** — `git add -A && git commit -m "feat: Scrubber component with pure position math"`

### Task 4: `ControlBar` + auto-hide + keyboard

**Files:**
- Create: `src/components/player/ControlBar.tsx`, `src/components/player/ControlBar.module.css`
- Create: `src/hooks/player/useAutoHide.ts`
- Test: `src/components/player/ControlBar.test.tsx`

**Interfaces:**
- Consumes: `VideoEngine` (Task 2), `Scrubber` (Task 3), `formatTime` (Task 1).
- Produces:
  - `useAutoHide(active: boolean): { visible: boolean; ping: () => void }` — visible true; after ~3000ms since last `ping()` while `active`, becomes false; `ping()` (call on pointermove/keydown) re-shows.
  - `ControlBar({ engine, title, onBack, onScrub, onHover, menuOpen, extras })` — top bar (Back + title), bottom bar (play/pause, −10s/+10s, Scrubber, `formatTime(currentTime)`/`-remaining`, volume, `extras` slot for the track button, fullscreen). Hosts keyboard handling. `extras` is a ReactNode rendered before fullscreen (TrackMenu button goes here in Phase 2).

- [ ] **Step 1: Write failing test**
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import ControlBar from './ControlBar';

function makeEngine(over = {}) {
  return { videoRef: { current: null }, state: { paused: true, currentTime: 10, duration: 100, bufferedEnd: 20, volume: 1, muted: false, waiting: false, stallCount: 0 },
    play: vi.fn(), pause: vi.fn(), togglePlay: vi.fn(), seek: vi.fn(), seekBy: vi.fn(), setVolume: vi.fn(), toggleMute: vi.fn(), requestFullscreen: vi.fn(), ...over } as never;
}

test('play/pause and skip buttons call the engine', () => {
  const engine = makeEngine();
  render(<ControlBar engine={engine} title="X" onBack={() => {}} onScrub={() => {}} onHover={() => {}} menuOpen={false} extras={null} />);
  fireEvent.click(screen.getByRole('button', { name: /play|pause/i }));
  expect((engine as never as { togglePlay: () => void }).togglePlay).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /forward/i }));
  expect((engine as never as { seekBy: (n: number) => void }).seekBy).toHaveBeenCalledWith(10);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `useAutoHide.ts`**
```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAutoHide(active: boolean): { visible: boolean; ping: () => void } {
  const [visible, setVisible] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const ping = useCallback(() => {
    setVisible(true);
    window.clearTimeout(timer.current);
    if (active) timer.current = window.setTimeout(() => setVisible(false), 3000);
  }, [active]);
  useEffect(() => { ping(); return () => window.clearTimeout(timer.current); }, [ping]);
  return { visible, ping };
}
```

- [ ] **Step 4: Implement `ControlBar.tsx`**
```tsx
import { useEffect } from 'react';
import type { VideoEngine } from '../../hooks/player/useVideoEngine';
import { useAutoHide } from '../../hooks/player/useAutoHide';
import Scrubber from './Scrubber';
import { formatTime } from '../../lib/format';
import styles from './ControlBar.module.css';

export default function ControlBar({
  engine, title, onBack, onScrub, onHover, menuOpen, extras,
}: {
  engine: VideoEngine; title: string; onBack: () => void;
  onScrub: (s: number) => void; onHover: (info: { seconds: number; x: number } | null) => void;
  menuOpen: boolean; extras: React.ReactNode;
}) {
  const { state } = engine;
  const { visible, ping } = useAutoHide(!state.paused && !menuOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      ping();
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); engine.togglePlay(); break;
        case 'ArrowRight': engine.seekBy(10); break;
        case 'ArrowLeft': engine.seekBy(-10); break;
        case 'ArrowUp': engine.setVolume(Math.min(1, state.volume + 0.1)); break;
        case 'ArrowDown': engine.setVolume(Math.max(0, state.volume - 0.1)); break;
        case 'f': engine.requestFullscreen(); break;
        case 'm': engine.toggleMute(); break;
        case 'Escape': onBack(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, state.volume, onBack, ping]);

  const remaining = Math.max(0, state.duration - state.currentTime);
  return (
    <div className={visible ? styles.wrap : `${styles.wrap} ${styles.hidden}`} onPointerMove={ping}>
      <div className={styles.top}>
        <button className={styles.back} onClick={onBack} aria-label="Back">‹ Back</button>
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.center}>
        <button className={styles.bigPlay} onClick={engine.togglePlay} aria-label={state.paused ? 'Play' : 'Pause'}>
          {state.paused ? '▶' : '❚❚'}
        </button>
      </div>
      <div className={styles.bottom}>
        <Scrubber currentTime={state.currentTime} duration={state.duration} bufferedEnd={state.bufferedEnd} onScrub={onScrub} onHover={onHover} />
        <div className={styles.buttons}>
          <button onClick={engine.togglePlay} aria-label={state.paused ? 'Play' : 'Pause'}>{state.paused ? '▶' : '❚❚'}</button>
          <button onClick={() => engine.seekBy(-10)} aria-label="Rewind 10 seconds">⟲10</button>
          <button onClick={() => engine.seekBy(10)} aria-label="Forward 10 seconds">10⟳</button>
          <button onClick={engine.toggleMute} aria-label={state.muted ? 'Unmute' : 'Mute'}>{state.muted || state.volume === 0 ? '🔇' : '🔊'}</button>
          <input className={styles.volume} type="range" min={0} max={1} step={0.05} value={state.muted ? 0 : state.volume}
            onChange={(e) => engine.setVolume(Number(e.target.value))} aria-label="Volume" />
          <span className={styles.time}>{formatTime(state.currentTime)} / -{formatTime(remaining)}</span>
          <span className={styles.spacer} />
          {extras}
          <button onClick={engine.requestFullscreen} aria-label="Fullscreen">⛶</button>
        </div>
      </div>
    </div>
  );
}
```
`ControlBar.module.css`:
```css
.wrap { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between;
  background: linear-gradient(0deg, rgba(0,0,0,.7) 0%, transparent 25%, transparent 75%, rgba(0,0,0,.6) 100%);
  opacity: 1; transition: opacity .3s ease; }
.hidden { opacity: 0; cursor: none; }
.top { display: flex; align-items: center; gap: 16px; padding: 20px var(--nf-inset); }
.back { color: #fff; font-size: 18px; }
.title { color: #fff; font-weight: 700; font-size: 18px; }
.center { flex: 1; display: grid; place-items: center; }
.bigPlay { width: 72px; height: 72px; border-radius: 50%; background: rgba(0,0,0,.4); color: #fff; font-size: 28px; }
.bottom { padding: 12px var(--nf-inset) 24px; display: flex; flex-direction: column; gap: 8px; }
.buttons { display: flex; align-items: center; gap: 16px; color: #fff; }
.buttons button { color: #fff; font-size: 16px; }
.spacer { flex: 1; }
.time { font-size: 14px; color: var(--nf-grey); }
.volume { width: 90px; }
@media (prefers-reduced-motion: reduce) { .wrap { transition: none; } }
```

- [ ] **Step 5: Run tests, verify pass. Commit** — `git add -A && git commit -m "feat: custom ControlBar with auto-hide and keyboard shortcuts"`

### Task 5: Rewrite `VideoPlayer` to use the engine + ControlBar

**Files:**
- Rewrite: `src/components/player/VideoPlayer.tsx` (+ `VideoPlayer.module.css`)
- Modify: `src/components/player/VideoPlayer.test.tsx`
- Modify: `src/routes/Watch.tsx` (only if prop shape changes — keep the same props for now)

**Interfaces:**
- Consumes: `useVideoEngine`, `ControlBar`.
- Produces: `VideoPlayer({ src, isHls, poster, startSeconds, title, onProgress, onBack, onError })` — same as today plus `title?: string`; renders a `<video>` (NO `controls`) inside a relative wrapper with `ControlBar` overlaid; reports progress via a timer + pause/seek exactly as before (drive it from the engine's `onProgress` equivalent — keep the existing 10s interval + pause/play/seeked → `onProgress(currentTime, paused)`), and `onScrub`/`onHover` wired to the engine (`onHover` unused until Phase 4 — pass a no-op that Phase 4 replaces).

- [ ] **Step 1: Update the test** `VideoPlayer.test.tsx` — keep the existing "renders a video element with src for progressive source" test; it still holds because the engine sets `video.src`. Ensure the hls mock still returns `{ default: class { static isSupported() { return false } destroy(){} } }` and add `Events`/`ErrorTypes` static stubs so imports resolve:
```tsx
vi.mock('hls.js', () => ({ default: class { static isSupported() { return false; } static Events = { ERROR: 'hlsError' }; static ErrorTypes = { NETWORK_ERROR: 'net', MEDIA_ERROR: 'media' }; on() {} loadSource() {} attachMedia() {} startLoad() {} recoverMediaError() {} destroy() {} } }));
```

- [ ] **Step 2: Run — old VideoPlayer test should still pass after rewrite; run after Step 3.**

- [ ] **Step 3: Rewrite `VideoPlayer.tsx`**
```tsx
import { useCallback, useEffect, useRef } from 'react';
import { useVideoEngine } from '../../hooks/player/useVideoEngine';
import ControlBar from './ControlBar';
import styles from './VideoPlayer.module.css';

export default function VideoPlayer({
  src, isHls, poster, startSeconds, title = '', onProgress, onBack, onError,
}: {
  src: string; isHls: boolean; poster: string | null; startSeconds: number; title?: string;
  onProgress: (seconds: number, paused: boolean) => void; onBack: () => void; onError: (msg: string) => void;
}) {
  const engine = useVideoEngine({ src, isHls, startSeconds, onError });
  const { videoRef } = engine;

  // Progress reporting (unchanged cadence: 10s + pause/play/seeked)
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tick = () => onProgressRef.current(video.currentTime, video.paused);
    const id = window.setInterval(tick, 10_000);
    const report = () => onProgressRef.current(video.currentTime, video.paused);
    video.addEventListener('pause', report);
    video.addEventListener('play', report);
    video.addEventListener('seeked', report);
    return () => { window.clearInterval(id); video.removeEventListener('pause', report); video.removeEventListener('play', report); video.removeEventListener('seeked', report); };
  }, [videoRef]);

  const onScrub = useCallback((s: number) => engine.seek(s), [engine]);
  const onHover = useCallback(() => {}, []); // replaced in Phase 4 (trickplay)

  return (
    <div className={styles.wrap}>
      <video ref={videoRef} className={styles.video} poster={poster ?? undefined} autoPlay />
      <ControlBar engine={engine} title={title} onBack={onBack} onScrub={onScrub} onHover={onHover} menuOpen={false} extras={null} />
    </div>
  );
}
```
`VideoPlayer.module.css`:
```css
.wrap { position: fixed; inset: 0; background: #000; z-index: 300; }
.video { width: 100%; height: 100%; }
```

- [ ] **Step 4: Pass `title` from Watch** — in `src/routes/Watch.tsx`, add `title={item?.Name ?? ''}` to the `<VideoPlayer .../>` props (leave everything else). Confirm `tsc -b` clean.

- [ ] **Step 5: Run `npm test` (all pass) + `npx tsc -b`.**

- [ ] **Step 6: Manual/Playwright check** — play a title; custom controls appear, auto-hide after 3s, play/pause/seek/volume/fullscreen work, keyboard works, progress still reports (Continue Watching advances). Fix before commit if any regress.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: VideoPlayer uses engine + custom ControlBar (native controls removed)"`

---

## Phase 2 — Renegotiation + audio/subtitle selection

### Task 6: `mediaStreams.ts` — track enumeration

**Files:**
- Create: `src/lib/jellyfin/mediaStreams.ts`, `src/lib/jellyfin/mediaStreams.test.ts`

**Interfaces:**
- Consumes: `MediaSourceInfo`, `MediaStream` from the SDK generated client.
- Produces:
  - `type AudioTrack = { index: number; label: string; language?: string; isDefault: boolean }`
  - `type SubtitleTrack = { index: number; label: string; language?: string; isDefault: boolean; isForced: boolean; deliveryMethod?: string; deliveryUrl?: string; codec?: string }`
  - `getAudioTracks(ms: MediaSourceInfo): AudioTrack[]`
  - `getSubtitleTracks(ms: MediaSourceInfo): SubtitleTrack[]` (external/text renderable first; each carries deliveryMethod/deliveryUrl)
  - `defaultAudioIndex(ms): number | undefined` (`ms.DefaultAudioStreamIndex` ?? first audio)
  - `defaultSubtitleIndex(ms): number | undefined` (`ms.DefaultSubtitleStreamIndex`, else a forced sub, else undefined)
  - `subtitleTrackUrl(serverUrl: string, token: string, t: SubtitleTrack): string | null` — `serverUrl + deliveryUrl` with `api_key` appended, only when `deliveryMethod==='External'` and `deliveryUrl` present; else null.
  - Label from `DisplayTitle` else `` `${Language ?? 'Und'}${IsForced?' (Forced)':''}` ``.

- [ ] **Step 1: Write failing test** `mediaStreams.test.ts`
```ts
import { expect, test } from 'vitest';
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { getAudioTracks, getSubtitleTracks, defaultAudioIndex, defaultSubtitleIndex, subtitleTrackUrl } from './mediaStreams';

const ms = {
  DefaultAudioStreamIndex: 2,
  MediaStreams: [
    { Index: 0, Type: 'Video', Codec: 'h264' },
    { Index: 1, Type: 'Audio', Language: 'eng', DisplayTitle: 'English 5.1', IsDefault: false },
    { Index: 2, Type: 'Audio', Language: 'fre', DisplayTitle: 'Français 5.1', IsDefault: true },
    { Index: 3, Type: 'Subtitle', Language: 'eng', DisplayTitle: 'English', IsForced: false, DeliveryMethod: 'External', DeliveryUrl: '/Videos/x/y/Subtitles/3/0/Stream.vtt', Codec: 'subrip' },
  ],
} as unknown as MediaSourceInfo;

test('audio tracks + default', () => {
  const a = getAudioTracks(ms);
  expect(a.map((t) => t.index)).toEqual([1, 2]);
  expect(a[1].label).toBe('Français 5.1');
  expect(defaultAudioIndex(ms)).toBe(2);
});
test('subtitle tracks carry delivery info', () => {
  const s = getSubtitleTracks(ms);
  expect(s[0]).toMatchObject({ index: 3, deliveryMethod: 'External', deliveryUrl: '/Videos/x/y/Subtitles/3/0/Stream.vtt' });
});
test('subtitleTrackUrl builds an authed same-origin url for External', () => {
  const s = getSubtitleTracks(ms)[0];
  expect(subtitleTrackUrl('/jf', 'tok', s)).toBe('/jf/Videos/x/y/Subtitles/3/0/Stream.vtt?api_key=tok');
});
test('defaultSubtitleIndex undefined when none set', () => {
  expect(defaultSubtitleIndex(ms)).toBeUndefined();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `mediaStreams.ts`**
```ts
import type { MediaSourceInfo, MediaStream } from '@jellyfin/sdk/lib/generated-client';

export type AudioTrack = { index: number; label: string; language?: string; isDefault: boolean };
export type SubtitleTrack = {
  index: number; label: string; language?: string; isDefault: boolean; isForced: boolean;
  deliveryMethod?: string; deliveryUrl?: string; codec?: string;
};

function label(s: MediaStream): string {
  if (s.DisplayTitle) return s.DisplayTitle;
  const lang = s.Language ?? 'Und';
  return s.IsForced ? `${lang} (Forced)` : lang;
}

export function getAudioTracks(ms: MediaSourceInfo): AudioTrack[] {
  return (ms.MediaStreams ?? []).filter((s) => s.Type === 'Audio').map((s) => ({
    index: s.Index ?? -1, label: label(s), language: s.Language ?? undefined, isDefault: !!s.IsDefault,
  }));
}

export function getSubtitleTracks(ms: MediaSourceInfo): SubtitleTrack[] {
  return (ms.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle').map((s) => ({
    index: s.Index ?? -1, label: label(s), language: s.Language ?? undefined,
    isDefault: !!s.IsDefault, isForced: !!s.IsForced,
    deliveryMethod: s.DeliveryMethod ?? undefined, deliveryUrl: s.DeliveryUrl ?? undefined,
    codec: s.Codec ?? undefined,
  }));
}

export function defaultAudioIndex(ms: MediaSourceInfo): number | undefined {
  if (ms.DefaultAudioStreamIndex != null) return ms.DefaultAudioStreamIndex;
  return getAudioTracks(ms)[0]?.index;
}

export function defaultSubtitleIndex(ms: MediaSourceInfo): number | undefined {
  if (ms.DefaultSubtitleStreamIndex != null) return ms.DefaultSubtitleStreamIndex;
  const forced = getSubtitleTracks(ms).find((t) => t.isForced);
  return forced?.index;
}

export function subtitleTrackUrl(serverUrl: string, token: string, t: SubtitleTrack): string | null {
  if (t.deliveryMethod !== 'External' || !t.deliveryUrl) return null;
  const sep = t.deliveryUrl.includes('?') ? '&' : '?';
  return `${serverUrl}${t.deliveryUrl}${sep}api_key=${token}`;
}
```

- [ ] **Step 4: Run, verify pass. Commit** — `git add -A && git commit -m "feat: mediaStreams track enumeration + external subtitle URL"`

### Task 7: `playback.ts` — negotiation params, stopEncoding, direct-first

**Files:**
- Modify: `src/lib/jellyfin/playback.ts`
- Modify: `src/lib/jellyfin/playback.test.ts`

**Interfaces:**
- Consumes: `deviceProfile` (Task 8 shape unchanged for now — `buildDeviceProfile()`), `Api`.
- Produces:
  - `type NegotiateParams = { startTicks?: number; maxBitrate?: number; audioStreamIndex?: number; subtitleStreamIndex?: number }`
  - `fetchPlaybackInfo(api, userId, itemId, params: NegotiateParams): Promise<{ mediaSource, playSessionId }>` (replaces the old `startTicks` positional arg — callers pass `{ startTicks }`).
  - `resolveStreamUrl(...)` unchanged signature but **direct-first**: prefer `SupportsDirectStream || SupportsDirectPlay` before the HLS `TranscodingUrl` branch.
  - `stopEncoding(api, deviceId: string, playSessionId: string): Promise<void>` → `DELETE /Videos/ActiveEncodings?deviceId=&playSessionId=` via `api.axiosInstance` (best-effort; swallow errors).

- [ ] **Step 1: Update tests** — in `playback.test.ts`, adjust the two existing `resolveStreamUrl` cases: the direct-stream case must still return the direct URL, and add a case proving **direct wins when BOTH direct and HLS are offered**:
```ts
test('direct-stream wins even when a TranscodingUrl is also present', () => {
  const ms = { Id: 'ms1', Container: 'mkv', SupportsDirectStream: true, SupportsDirectPlay: true, TranscodingUrl: '/videos/itm/master.m3u8?x=1', TranscodingSubProtocol: 'hls' } as unknown as import('@jellyfin/sdk/lib/generated-client').MediaSourceInfo;
  const r = resolveStreamUrl('/jf', 'tok', 'itm', ms, 'dev');
  expect(r.isHls).toBe(false);
  expect(r.url).toBe('/jf/Videos/itm/stream.mkv?Static=true&mediaSourceId=ms1&deviceId=dev&api_key=tok');
});
```
Keep the existing HLS-only case (no direct support → HLS). Add a `fetchPlaybackInfo` params test with a mocked `getMediaInfoApi`:
```ts
import { vi } from 'vitest';
vi.mock('@jellyfin/sdk/lib/utils/api/media-info-api', () => ({
  getMediaInfoApi: () => ({ getPostedPlaybackInfo: vi.fn().mockResolvedValue({ data: { MediaSources: [{ Id: 'm' }], PlaySessionId: 'p' } }) }),
}));
test('fetchPlaybackInfo forwards negotiation params', async () => {
  const { getMediaInfoApi } = await import('@jellyfin/sdk/lib/utils/api/media-info-api');
  const spy = getMediaInfoApi({} as never).getPostedPlaybackInfo as unknown as ReturnType<typeof vi.fn>;
  await fetchPlaybackInfo({} as never, 'u', 'itm', { startTicks: 50, maxBitrate: 3_000_000, audioStreamIndex: 2, subtitleStreamIndex: 3 });
  const arg = spy.mock.calls.at(-1)![0].playbackInfoDto;
  expect(arg).toMatchObject({ UserId: 'u', StartTimeTicks: 50, MaxStreamingBitrate: 3_000_000, AudioStreamIndex: 2, SubtitleStreamIndex: 3 });
});
```
(Update the existing `fetchPlaybackInfo` call in the earlier direct/HLS tests if they used the old positional signature.)

- [ ] **Step 2: Run, verify fail** (signature + direct-first change).

- [ ] **Step 3: Rewrite the three functions in `playback.ts`** (keep `resolvePlayableItem` as-is):
```ts
export type NegotiateParams = { startTicks?: number; maxBitrate?: number; audioStreamIndex?: number; subtitleStreamIndex?: number };

export async function fetchPlaybackInfo(
  api: Api, userId: string, itemId: string, params: NegotiateParams = {},
): Promise<{ mediaSource: MediaSourceInfo; playSessionId: string }> {
  const { data } = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId,
    playbackInfoDto: {
      UserId: userId,
      DeviceProfile: buildDeviceProfile(params.maxBitrate),
      StartTimeTicks: params.startTicks ?? 0,
      MaxStreamingBitrate: params.maxBitrate ?? 120_000_000,
      AudioStreamIndex: params.audioStreamIndex,
      SubtitleStreamIndex: params.subtitleStreamIndex,
      AutoOpenLiveStream: true,
    },
  });
  const mediaSource = data.MediaSources?.[0];
  if (!mediaSource) throw new Error('No playable media source');
  return { mediaSource, playSessionId: data.PlaySessionId ?? '' };
}

export function resolveStreamUrl(
  serverUrl: string, token: string, itemId: string, ms: MediaSourceInfo, deviceId: string,
): { url: string; isHls: boolean } {
  if (ms.SupportsDirectStream || ms.SupportsDirectPlay) {
    const container = (ms.Container ?? 'mp4').split(',')[0];
    const q = new URLSearchParams({ Static: 'true', mediaSourceId: ms.Id ?? itemId, deviceId, api_key: token });
    return { url: `${serverUrl}/Videos/${itemId}/stream.${container}?${q.toString()}`, isHls: false };
  }
  if (ms.TranscodingUrl) {
    return { url: `${serverUrl}${ms.TranscodingUrl}`, isHls: ms.TranscodingSubProtocol === 'hls' };
  }
  throw new Error('No streamable URL for media source');
}

export async function stopEncoding(api: Api, deviceId: string, playSessionId: string): Promise<void> {
  if (!playSessionId) return;
  try {
    await api.axiosInstance.delete(`${api.basePath}/Videos/ActiveEncodings`, { params: { deviceId, playSessionId } });
  } catch { /* best-effort */ }
}
```
Note: `buildDeviceProfile` gains an optional `maxBitrate` arg in Task 8; until then it ignores the arg — add the param now as `buildDeviceProfile(maxBitrate?: number)` returning the same object with `MaxStreamingBitrate: maxBitrate ?? 120_000_000` (small change to satisfy the call; Task 8 expands it).

- [ ] **Step 4: Update the existing `Watch.tsx` call** — change `fetchPlaybackInfo(api, userId, playId, startTicks)` to `fetchPlaybackInfo(api, userId, playId, { startTicks })`.

- [ ] **Step 5: Run all tests + `tsc -b`, verify pass. Commit** — `git add -A && git commit -m "feat: playback negotiation params, direct-first resolve, stopEncoding"`

### Task 8: `deviceProfile.ts` — accurate codecs + subtitle profiles

**Files:**
- Rewrite: `src/lib/jellyfin/deviceProfile.ts`
- Create: `src/lib/jellyfin/deviceProfile.test.ts`

**Interfaces:**
- Produces: `buildDeviceProfile(maxBitrate?: number): DeviceProfile`. Direct-play video codecs are gated by a testable `canPlayCodec(codec)` that consults a `<video>.canPlayType(...)` map; H.264+AAC always allowed; HEVC/AV1/VP9 only when supported. Declares `SubtitleProfiles: [{Format:'vtt',Method:'External'},{Format:'ass',Method:'Encode'},{Format:'pgssub',Method:'Encode'}]`. HLS transcode profile allows `VideoCodec:'h264'`, `AudioCodec:'aac,ac3,eac3,mp3'`.

- [ ] **Step 1: Write failing test** `deviceProfile.test.ts`
```ts
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
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Rewrite `deviceProfile.ts`**
```ts
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
```

- [ ] **Step 4: Run all tests + `tsc -b`. Commit** — `git add -A && git commit -m "feat: accurate codec device profile + subtitle delivery profiles (fixes HEVC)"`

### Task 9: `usePlaybackSession` controller

**Files:**
- Create: `src/hooks/player/usePlaybackSession.ts`
- Test: `src/hooks/player/usePlaybackSession.test.tsx`

**Interfaces:**
- Consumes: `useApi`, `fetchPlaybackInfo`/`resolveStreamUrl`/`stopEncoding`/`NegotiateParams`, `resolvePlayableItem`, `getAudioTracks`/`getSubtitleTracks`/`defaultAudioIndex`/`defaultSubtitleIndex`, `getDeviceId`.
- Produces:
  - `type SessionStream = { url: string; isHls: boolean; startSeconds: number }`
  - `type PlaybackSession = { stream: SessionStream | null; error: string | null; playId: string; playSessionId: string; audioTracks: AudioTrack[]; subtitleTracks: SubtitleTrack[]; audioIndex?: number; subtitleIndex?: number; mediaSource: MediaSourceInfo | null; setAudioTrack(index: number): Promise<void>; setSubtitleTrack(index: number | null): Promise<void>; renegotiate(p: NegotiateParams & { position: number }): Promise<void> }`
  - `function usePlaybackSession(rawItemId: string, getPosition: () => number): PlaybackSession` — resolves the playable item, negotiates once (with default indices), exposes tracks. `renegotiate` guards with a monotonic `negotiationId`; on success sets a fresh `stream` (startSeconds = HLS ? 0 : position). `setAudioTrack` → `renegotiate({audioStreamIndex, position})`. `setSubtitleTrack` → if the target sub is `External` do NOT renegotiate (return; VideoPlayer swaps the `<track>`); else `renegotiate({subtitleStreamIndex: index ?? -1, position})`.
- Note: reporting stays in `Watch`; the session exposes `playId`/`playSessionId` for it and updates them on renegotiation.

- [ ] **Step 1: Write failing test** (mock SDK layer)
```tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

vi.mock('../useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u', serverUrl: '/jf', accessToken: 't', userName: 'x' } }) }));
vi.mock('../../lib/jellyfin/device', () => ({ getDeviceId: () => 'dev' }));
const fetchPlaybackInfo = vi.fn();
vi.mock('../../lib/jellyfin/playback', async (orig) => ({
  ...(await orig<typeof import('../../lib/jellyfin/playback')>()),
  fetchPlaybackInfo: (...a: unknown[]) => fetchPlaybackInfo(...a),
  stopEncoding: vi.fn().mockResolvedValue(undefined),
  resolvePlayableItem: vi.fn().mockResolvedValue({ id: 'ep1', startTicks: 0 }),
  resolveStreamUrl: () => ({ url: 'http://x/master.m3u8', isHls: true }),
}));

import { usePlaybackSession } from './usePlaybackSession';

const MS = { Id: 'm', MediaStreams: [{ Index: 1, Type: 'Audio', Language: 'eng', IsDefault: true }, { Index: 2, Type: 'Audio', Language: 'fre' }] };

test('negotiates once and exposes audio tracks', async () => {
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 0));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  expect(result.current.audioTracks.map((t) => t.index)).toEqual([1, 2]);
  expect(fetchPlaybackInfo).toHaveBeenCalledTimes(1);
});

test('setAudioTrack renegotiates at the given position', async () => {
  fetchPlaybackInfo.mockResolvedValue({ mediaSource: MS, playSessionId: 'ps' });
  const { result } = renderHook(() => usePlaybackSession('ep1', () => 42));
  await waitFor(() => expect(result.current.stream).not.toBeNull());
  await act(async () => { await result.current.setAudioTrack(2); });
  const lastCall = fetchPlaybackInfo.mock.calls.at(-1)!;
  expect(lastCall[3]).toMatchObject({ audioStreamIndex: 2, startTicks: 42 * 10_000_000 });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `usePlaybackSession.ts`**
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import { useApi } from '../useApi';
import { getDeviceId } from '../../lib/jellyfin/device';
import { useItem } from '../api/useItem';
import { fetchPlaybackInfo, resolvePlayableItem, resolveStreamUrl, stopEncoding, type NegotiateParams } from '../../lib/jellyfin/playback';
import { getAudioTracks, getSubtitleTracks, defaultAudioIndex, defaultSubtitleIndex, type AudioTrack, type SubtitleTrack } from '../../lib/jellyfin/mediaStreams';

export type SessionStream = { url: string; isHls: boolean; startSeconds: number };
export type PlaybackSession = {
  stream: SessionStream | null; error: string | null;
  playId: string; playSessionId: string;
  audioTracks: AudioTrack[]; subtitleTracks: SubtitleTrack[];
  audioIndex?: number; subtitleIndex?: number; mediaSource: MediaSourceInfo | null;
  setAudioTrack(index: number): Promise<void>;
  setSubtitleTrack(index: number | null): Promise<void>;
  renegotiate(p: NegotiateParams & { position: number }): Promise<void>;
};

export function usePlaybackSession(rawItemId: string, getPosition: () => number): PlaybackSession {
  const { api, session } = useApi();
  const { userId, serverUrl, accessToken } = session;
  const { data: item } = useItem(rawItemId);
  const [stream, setStream] = useState<SessionStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaSource, setMediaSource] = useState<MediaSourceInfo | null>(null);
  const [audioIndex, setAudioIndex] = useState<number | undefined>();
  const [subtitleIndex, setSubtitleIndex] = useState<number | undefined>();
  const playRef = useRef<{ playId: string; playSessionId: string }>({ playId: '', playSessionId: '' });
  const startedFor = useRef<string | null>(null);
  const negId = useRef(0);

  const apply = useCallback((ms: MediaSourceInfo, playSessionId: string, playId: string, position: number) => {
    const resolved = resolveStreamUrl(serverUrl, accessToken, playId, ms, getDeviceId());
    playRef.current = { playId, playSessionId };
    setMediaSource(ms);
    setAudioIndex(ms.DefaultAudioStreamIndex ?? audioIndex);
    setStream({ ...resolved, startSeconds: resolved.isHls ? 0 : position });
  }, [serverUrl, accessToken, audioIndex]);

  // initial negotiate, once per rawItemId, after item load
  useEffect(() => {
    if (!item?.Id || startedFor.current === rawItemId) return;
    let active = true; setError(null);
    (async () => {
      const { id: playId, startTicks } = await resolvePlayableItem(api, userId, item);
      const { mediaSource: ms, playSessionId } = await fetchPlaybackInfo(api, userId, playId, { startTicks });
      if (!active) return;
      startedFor.current = rawItemId;
      setAudioIndex(defaultAudioIndex(ms));
      setSubtitleIndex(defaultSubtitleIndex(ms));
      apply(ms, playSessionId, playId, startTicks / 10_000_000);
    })().catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'This title can’t be played right now.'); });
    return () => { active = false; };
  }, [item, rawItemId, api, userId, apply]);

  const renegotiate = useCallback(async (p: NegotiateParams & { position: number }) => {
    const myId = ++negId.current;
    const { playId, playSessionId } = playRef.current;
    await stopEncoding(api, getDeviceId(), playSessionId);
    const { mediaSource: ms, playSessionId: nps } = await fetchPlaybackInfo(api, userId, playId, {
      startTicks: Math.round(p.position * 10_000_000),
      maxBitrate: p.maxBitrate, audioStreamIndex: p.audioStreamIndex, subtitleStreamIndex: p.subtitleStreamIndex,
    });
    if (myId !== negId.current) return; // superseded
    apply(ms, nps, playId, p.position);
  }, [api, userId, apply]);

  const setAudioTrack = useCallback(async (index: number) => {
    setAudioIndex(index);
    await renegotiate({ audioStreamIndex: index, position: getPosition() });
  }, [renegotiate, getPosition]);

  const setSubtitleTrack = useCallback(async (index: number | null) => {
    setSubtitleIndex(index ?? undefined);
    const target = index == null ? null : getSubtitleTracks(mediaSource ?? {} as MediaSourceInfo).find((t) => t.index === index);
    // External subs render client-side (VideoPlayer swaps the <track>); no renegotiation.
    if (target && target.deliveryMethod === 'External') return;
    await renegotiate({ subtitleStreamIndex: index ?? -1, position: getPosition() });
  }, [renegotiate, getPosition, mediaSource]);

  return {
    stream, error, playId: playRef.current.playId, playSessionId: playRef.current.playSessionId,
    audioTracks: mediaSource ? getAudioTracks(mediaSource) : [],
    subtitleTracks: mediaSource ? getSubtitleTracks(mediaSource) : [],
    audioIndex, subtitleIndex, mediaSource, setAudioTrack, setSubtitleTrack, renegotiate,
  };
}
```

- [ ] **Step 4: Run tests + `tsc -b`. Commit** — `git add -A && git commit -m "feat: usePlaybackSession controller with position-preserving renegotiation"`

### Task 10: `TrackMenu` + subtitle `<track>` + wire into player/Watch

**Files:**
- Create: `src/components/player/TrackMenu.tsx`, `src/components/player/TrackMenu.module.css`
- Modify: `src/components/player/VideoPlayer.tsx` (render `<track>`s, TrackMenu in `extras`, `menuOpen`)
- Modify: `src/routes/Watch.tsx` (use `usePlaybackSession`)
- Test: `src/components/player/TrackMenu.test.tsx`

**Interfaces:**
- Consumes: `AudioTrack`/`SubtitleTrack`, `subtitleTrackUrl`, `usePlaybackSession`.
- Produces:
  - `TrackMenu({ audioTracks, subtitleTracks, audioIndex, subtitleIndex, onAudio, onSubtitle, onOpenChange })` — a button that toggles a panel with an Audio list and a Subtitles list (incl. "Off"), checkmark on active; calls `onAudio(index)` / `onSubtitle(index|null)`; notifies `onOpenChange(open)`.
  - `VideoPlayer` now takes a `session: PlaybackSession` (instead of raw src) — it reads `session.stream`, renders native `<track>` for the selected External subtitle (`subtitleTrackUrl`), and puts `<TrackMenu…/>` into `ControlBar`'s `extras`, feeding `menuOpen` so auto-hide pauses while open. Progress reporting + Back unchanged. On subtitle change to External, set that `<track>.mode='showing'`; others hidden.

- [ ] **Step 1: Write failing test** `TrackMenu.test.tsx`
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import TrackMenu from './TrackMenu';

test('selecting an audio track and Off subtitles calls handlers', () => {
  const onAudio = vi.fn(), onSubtitle = vi.fn();
  render(<TrackMenu
    audioTracks={[{ index: 1, label: 'English', isDefault: true }, { index: 2, label: 'Français', isDefault: false }]}
    subtitleTracks={[{ index: 3, label: 'English', isDefault: false, isForced: false }]}
    audioIndex={1} subtitleIndex={3} onAudio={onAudio} onSubtitle={onSubtitle} onOpenChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /audio.*subtitle/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  expect(onAudio).toHaveBeenCalledWith(2);
  fireEvent.click(screen.getByRole('button', { name: /^Off$/ }));
  expect(onSubtitle).toHaveBeenCalledWith(null);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `TrackMenu.tsx`**
```tsx
import { useState } from 'react';
import type { AudioTrack, SubtitleTrack } from '../../lib/jellyfin/mediaStreams';
import styles from './TrackMenu.module.css';

export default function TrackMenu({
  audioTracks, subtitleTracks, audioIndex, subtitleIndex, onAudio, onSubtitle, onOpenChange,
}: {
  audioTracks: AudioTrack[]; subtitleTracks: SubtitleTrack[];
  audioIndex?: number; subtitleIndex?: number;
  onAudio: (index: number) => void; onSubtitle: (index: number | null) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = () => { const n = !open; setOpen(n); onOpenChange(n); };
  return (
    <div className={styles.wrap}>
      <button onClick={toggle} aria-label="Audio and subtitles" aria-expanded={open}>💬</button>
      {open && (
        <div className={styles.panel} role="menu">
          <div className={styles.col}>
            <h4>Audio</h4>
            {audioTracks.map((t) => (
              <button key={t.index} className={t.index === audioIndex ? styles.active : ''} onClick={() => onAudio(t.index)}>
                {t.index === audioIndex ? '✓ ' : ''}{t.label}
              </button>
            ))}
          </div>
          <div className={styles.col}>
            <h4>Subtitles</h4>
            <button className={subtitleIndex == null ? styles.active : ''} onClick={() => onSubtitle(null)}>
              {subtitleIndex == null ? '✓ ' : ''}Off
            </button>
            {subtitleTracks.map((t) => (
              <button key={t.index} className={t.index === subtitleIndex ? styles.active : ''} onClick={() => onSubtitle(t.index)}>
                {t.index === subtitleIndex ? '✓ ' : ''}{t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```
`TrackMenu.module.css`:
```css
.wrap { position: relative; }
.panel { position: absolute; bottom: 40px; right: 0; display: flex; gap: 24px; background: rgba(0,0,0,.9); padding: 16px 20px; border-radius: 6px; min-width: 280px; }
.col { display: flex; flex-direction: column; gap: 4px; min-width: 120px; }
.col h4 { color: var(--nf-grey); font-size: 13px; margin-bottom: 6px; }
.col button { color: #fff; text-align: left; padding: 4px 6px; border-radius: 4px; font-size: 14px; }
.col button:hover { background: rgba(255,255,255,.1); }
.active { font-weight: 700; }
```

- [ ] **Step 4: Rewrite `VideoPlayer.tsx` to take `session`** — new props `{ session, poster, title, onProgress, onBack }` (drop `src/isHls/startSeconds/onError`; read from `session.stream`, and pass `session`'s error up is handled in Watch). Render `<track>`s for External subs and the TrackMenu:
```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVideoEngine } from '../../hooks/player/useVideoEngine';
import ControlBar from './ControlBar';
import TrackMenu from './TrackMenu';
import { subtitleTrackUrl } from '../../lib/jellyfin/mediaStreams';
import { useApi } from '../../hooks/useApi';
import type { PlaybackSession } from '../../hooks/player/usePlaybackSession';
import styles from './VideoPlayer.module.css';

export default function VideoPlayer({
  session, poster, title, onProgress, onBack,
}: {
  session: PlaybackSession; poster: string | null; title: string;
  onProgress: (seconds: number, paused: boolean) => void; onBack: () => void;
}) {
  const { session: appSession } = useApi();
  const stream = session.stream!;
  const [menuOpen, setMenuOpen] = useState(false);
  const engine = useVideoEngine({ src: stream.url, isHls: stream.isHls, startSeconds: stream.startSeconds, onError: () => {} });
  const { videoRef } = engine;

  const onProgressRef = useRef(onProgress); onProgressRef.current = onProgress;
  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    const tick = () => onProgressRef.current(video.currentTime, video.paused);
    const id = window.setInterval(tick, 10_000);
    const report = () => onProgressRef.current(video.currentTime, video.paused);
    video.addEventListener('pause', report); video.addEventListener('play', report); video.addEventListener('seeked', report);
    return () => { window.clearInterval(id); video.removeEventListener('pause', report); video.removeEventListener('play', report); video.removeEventListener('seeked', report); };
  }, [videoRef]);

  // External subtitle <track>s; show the selected one.
  const externalSubs = useMemo(
    () => session.subtitleTracks.filter((t) => t.deliveryMethod === 'External'),
    [session.subtitleTracks],
  );
  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    Array.from(video.textTracks).forEach((tt, i) => {
      tt.mode = externalSubs[i]?.index === session.subtitleIndex ? 'showing' : 'disabled';
    });
  }, [session.subtitleIndex, externalSubs, videoRef, stream.url]);

  const onScrub = useCallback((s: number) => engine.seek(s), [engine]);
  const extras = (
    <TrackMenu audioTracks={session.audioTracks} subtitleTracks={session.subtitleTracks}
      audioIndex={session.audioIndex} subtitleIndex={session.subtitleIndex}
      onAudio={(i) => void session.setAudioTrack(i)} onSubtitle={(i) => void session.setSubtitleTrack(i)}
      onOpenChange={setMenuOpen} />
  );

  return (
    <div className={styles.wrap}>
      <video ref={videoRef} className={styles.video} poster={poster ?? undefined} autoPlay crossOrigin="anonymous">
        {externalSubs.map((t) => {
          const url = subtitleTrackUrl(appSession.serverUrl, appSession.accessToken, t);
          return url ? <track key={t.index} kind="subtitles" srcLang={t.language ?? 'und'} label={t.label} src={url} /> : null;
        })}
      </video>
      <ControlBar engine={engine} title={title} onBack={onBack} onScrub={onScrub} onHover={() => {}} menuOpen={menuOpen} extras={extras} />
    </div>
  );
}
```

- [ ] **Step 5: Update `Watch.tsx` to use the session** — replace the local negotiation with `usePlaybackSession`. Keep reporting driven by `onProgress`; read `session.playId`/`session.playSessionId` for `reportStart`/`reportProgress`/`reportStopped` (they update on renegotiation). Concretely:
```tsx
// inside Watch()
const positionRef = useRef(0);
const session = usePlaybackSession(itemId, () => positionRef.current);
// reportStart once when a stream first appears:
const reportedRef = useRef<string | null>(null);
useEffect(() => {
  if (!session.stream || !session.playSessionId || reportedRef.current === session.playSessionId) return;
  reportedRef.current = session.playSessionId;
  void reportStart(api, { itemId: session.playId, playSessionId: session.playSessionId, positionTicks: Math.round(positionRef.current * 1e7) }).catch(() => {});
}, [session.stream, session.playSessionId, session.playId, api]);
const onProgress = useCallback((seconds: number, paused: boolean) => {
  positionRef.current = seconds;
  if (!session.playSessionId) return;
  void reportProgress(api, { itemId: session.playId, playSessionId: session.playSessionId, positionTicks: Math.round(seconds * 1e7), isPaused: paused }).catch(() => {});
}, [api, session.playId, session.playSessionId]);
// unmount + Back: reportStopped with playRef equivalents (use a ref mirroring session.playId/playSessionId).
```
Render: if `session.error` → existing error screen; if `!session.stream` → "Preparing playback…"; else `<VideoPlayer session={session} poster={...} title={item?.Name ?? ''} onProgress={onProgress} onBack={onBack} />`. Keep the unmount `reportStopped` effect using a ref that mirrors the latest `session.playId/playSessionId`.

- [ ] **Step 6: Run `npm test` + `tsc -b`.** Fix type fallout from the VideoPlayer prop change (the old VideoPlayer.test.tsx must be updated to render with a minimal `session` stub, or split: keep a thin engine test and move player-integration to a session-driven test). Update `VideoPlayer.test.tsx` to pass a stub `session` with a `stream` and empty track arrays.

- [ ] **Step 7: Playwright E2E** — play *Fanboys*; open the track menu; switch audio Eng→Fre (verify it resumes near the same time via the reported position / visible timecode); toggle a subtitle on and confirm a cue renders; toggle Off. Commit — `git add -A && git commit -m "feat: audio/subtitle TrackMenu, native VTT subtitles, session-driven Watch"`

---

## Phase 3 — Automatic adaptive quality

### Task 11: `bitrate.ts` — bandwidth measurement

**Files:**
- Create: `src/lib/jellyfin/bitrate.ts`, `src/lib/jellyfin/bitrate.test.ts`

**Interfaces:**
- Consumes: `Api` (`api.axiosInstance`, `api.basePath`), `getSystemApi`.
- Produces:
  - `normalizeBitrate(bps: number): number` → `min(round(bps*0.7), 2_147_483_647)`.
  - `async measureBandwidth(api: Api, opts?: { force?: boolean; now?: () => number }): Promise<number>` — staged sizes [500_000, 1_000_000, 3_000_000] with thresholds [500_000, 20_000_000, 50_000_000]: run a size, compute bps from bytes/elapsed, escalate only if the measured raw bps exceeds the stage threshold; take the last measured; normalize; if `getEndpointInfo().IsInNetwork` → `max(result, 140_000_000)`; on any error → return a conservative `8_000_000`. Cache the result 1h (module-level), bypassed by `force`. `now` injectable for tests (default `performance.now`).
  - Download via `api.axiosInstance.get('/Playback/BitrateTest', { params: { Size }, responseType: 'blob' })`; bytes = `blob.size`.

- [ ] **Step 1: Write failing test** `bitrate.test.ts`
```ts
import { expect, test, vi, beforeEach } from 'vitest';

let clock = 0;
const now = () => clock;
function makeApi(bytesPerStage: number, msPerStage: number, inNetwork = false) {
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
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `bitrate.ts`**
```ts
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
```

- [ ] **Step 4: Run, verify pass. Commit** — `git add -A && git commit -m "feat: bandwidth measurement via staged BitrateTest"`

### Task 12: `abr.ts` — the pure decision function

**Files:**
- Create: `src/lib/player/abr.ts`, `src/lib/player/abr.test.ts`

**Interfaces:**
- Produces:
  - `const BITRATE_LADDER: number[]` = `[120_000_000,60_000_000,40_000_000,20_000_000,15_000_000,10_000_000,8_000_000,6_000_000,4_000_000,3_000_000,1_500_000,720_000,420_000]`.
  - `type AbrState = { currentBitrate: number; bandwidth: number; stallsInWindow: number; bufferAhead: number; stableSecs: number; isTranscoding: boolean }`
  - `decideAbrAction(s: AbrState): { action: 'up' | 'down' | 'none'; targetBitrate: number }` — down when `isTranscoding && (stallsInWindow >= 2 || bufferAhead < 4)` and a lower rung ≤ `bandwidth*0.7` exists; up when `isTranscoding && stableSecs >= 40 && bufferAhead > 12` and a higher rung ≤ `bandwidth` exists; else none. `targetBitrate` = chosen rung (or `currentBitrate` for none). Never act when `!isTranscoding`.
  - `ladderStepDown(current, bandwidth)` / `ladderStepUp(current, bandwidth)` helpers.

- [ ] **Step 1: Write failing test** `abr.test.ts`
```ts
import { expect, test } from 'vitest';
import { decideAbrAction } from './abr';

const base = { currentBitrate: 20_000_000, bandwidth: 8_000_000, stallsInWindow: 0, bufferAhead: 20, stableSecs: 0, isTranscoding: true };

test('downshifts on repeated stalls to a rung within bandwidth', () => {
  const r = decideAbrAction({ ...base, stallsInWindow: 2 });
  expect(r.action).toBe('down');
  expect(r.targetBitrate).toBeLessThanOrEqual(Math.round(8_000_000 * 0.7));
});
test('downshifts on starved buffer', () => {
  expect(decideAbrAction({ ...base, bufferAhead: 2 }).action).toBe('down');
});
test('upshifts when stable with healthy buffer and headroom', () => {
  const r = decideAbrAction({ currentBitrate: 4_000_000, bandwidth: 20_000_000, stallsInWindow: 0, bufferAhead: 15, stableSecs: 60, isTranscoding: true });
  expect(r.action).toBe('up');
  expect(r.targetBitrate).toBeGreaterThan(4_000_000);
});
test('never acts on direct-play', () => {
  expect(decideAbrAction({ ...base, isTranscoding: false, stallsInWindow: 5 }).action).toBe('none');
});
test('no action when steady', () => {
  expect(decideAbrAction(base).action).toBe('none');
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `abr.ts`**
```ts
export const BITRATE_LADDER = [
  120_000_000, 60_000_000, 40_000_000, 20_000_000, 15_000_000, 10_000_000,
  8_000_000, 6_000_000, 4_000_000, 3_000_000, 1_500_000, 720_000, 420_000,
];

export type AbrState = {
  currentBitrate: number; bandwidth: number; stallsInWindow: number;
  bufferAhead: number; stableSecs: number; isTranscoding: boolean;
};

export function ladderStepDown(current: number, bandwidth: number): number | null {
  const cap = Math.round(bandwidth * 0.7);
  const lower = BITRATE_LADDER.filter((b) => b < current && b <= cap);
  return lower.length ? Math.max(...lower) : null;
}
export function ladderStepUp(current: number, bandwidth: number): number | null {
  const higher = BITRATE_LADDER.filter((b) => b > current && b <= bandwidth);
  return higher.length ? Math.min(...higher) : null;
}

export function decideAbrAction(s: AbrState): { action: 'up' | 'down' | 'none'; targetBitrate: number } {
  if (!s.isTranscoding) return { action: 'none', targetBitrate: s.currentBitrate };
  if (s.stallsInWindow >= 2 || s.bufferAhead < 4) {
    const down = ladderStepDown(s.currentBitrate, s.bandwidth);
    if (down != null) return { action: 'down', targetBitrate: down };
  }
  if (s.stableSecs >= 40 && s.bufferAhead > 12) {
    const up = ladderStepUp(s.currentBitrate, s.bandwidth);
    if (up != null) return { action: 'up', targetBitrate: up };
  }
  return { action: 'none', targetBitrate: s.currentBitrate };
}
```

- [ ] **Step 4: Run, verify pass. Commit** — `git add -A && git commit -m "feat: pure ABR decision function + bitrate ladder"`

### Task 13: Wire auto-ABR into the session

**Files:**
- Modify: `src/hooks/player/usePlaybackSession.ts` (measure bandwidth on initial negotiate; run ABR loop)
- Create: `src/hooks/player/useAbrController.ts`
- Test: `src/hooks/player/useAbrController.test.tsx`

**Interfaces:**
- Consumes: `measureBandwidth`, `decideAbrAction`/`AbrState`, `EngineState` (stallCount, bufferedEnd, currentTime, paused, waiting), the session `renegotiate` + current bitrate/isTranscoding.
- Produces:
  - `useAbrController(args: { engineState: EngineState; getPosition: () => number; bandwidth: number; currentBitrate: number; isTranscoding: boolean; onShift: (targetBitrate: number) => void }): void` — samples every ~5s: computes `stallsInWindow` (delta of `stallCount` over the last ~30s), `bufferAhead = bufferedEnd - currentTime`, `stableSecs` (time since last stall while playing); calls `decideAbrAction`; if action ≠ none and target ≠ current, calls `onShift(target)` (debounced so we don't renegotiate more than once per ~15s).
  - `usePlaybackSession` change: on initial negotiate, `const bw = await measureBandwidth(api)` → pass `maxBitrate: bw` into the first `fetchPlaybackInfo`; store `bandwidth` and `currentBitrate` (the negotiated `mediaSource.Bitrate` or the cap) and `isTranscoding` (`!!stream && stream.isHls`); expose them so Watch can mount `useAbrController` with `onShift: (b) => session.renegotiate({ maxBitrate: b, position: getPosition() })`.

- [ ] **Step 1: Write failing test** `useAbrController.test.tsx` — drive it with a fake engineState sequence and assert `onShift` fires with a downshift when stalls accumulate (advance timers). Use `vi.useFakeTimers()`.
```tsx
import { renderHook, act } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useAbrController } from './useAbrController';

test('fires a downshift after repeated stalls', () => {
  vi.useFakeTimers();
  const onShift = vi.fn();
  let engineState = { paused: false, currentTime: 10, duration: 100, bufferedEnd: 11, volume: 1, muted: false, waiting: true, stallCount: 0 };
  const { rerender } = renderHook(({ s }) => useAbrController({ engineState: s, getPosition: () => 10, bandwidth: 8_000_000, currentBitrate: 20_000_000, isTranscoding: true, onShift }), { initialProps: { s: engineState } });
  // simulate two stalls + starved buffer across sample windows
  for (let i = 0; i < 3; i++) {
    engineState = { ...engineState, stallCount: engineState.stallCount + 1, bufferedEnd: 11 };
    rerender({ s: engineState });
    act(() => vi.advanceTimersByTime(5000));
  }
  expect(onShift).toHaveBeenCalled();
  const target = onShift.mock.calls.at(-1)![0] as number;
  expect(target).toBeLessThan(20_000_000);
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `useAbrController.ts`**
```ts
import { useEffect, useRef } from 'react';
import type { EngineState } from './useVideoEngine';
import { decideAbrAction } from '../../lib/player/abr';

export function useAbrController(args: {
  engineState: EngineState; getPosition: () => number;
  bandwidth: number; currentBitrate: number; isTranscoding: boolean;
  onShift: (targetBitrate: number) => void;
}): void {
  const ref = useRef(args); ref.current = args;
  const stallAt = useRef<number[]>([]);
  const lastStallCount = useRef(0);
  const lastShift = useRef(0);
  const lastPlayingStall = useRef(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      const a = ref.current;
      const now = Date.now();
      if (a.engineState.stallCount > lastStallCount.current) {
        stallAt.current.push(now); lastStallCount.current = a.engineState.stallCount; lastPlayingStall.current = now;
      }
      stallAt.current = stallAt.current.filter((t) => now - t < 30_000);
      const bufferAhead = Math.max(0, a.engineState.bufferedEnd - a.engineState.currentTime);
      const stableSecs = a.engineState.paused ? 0 : (now - lastPlayingStall.current) / 1000;
      const decision = decideAbrAction({
        currentBitrate: a.currentBitrate, bandwidth: a.bandwidth,
        stallsInWindow: stallAt.current.length, bufferAhead, stableSecs, isTranscoding: a.isTranscoding,
      });
      if (decision.action !== 'none' && decision.targetBitrate !== a.currentBitrate && now - lastShift.current > 15_000) {
        lastShift.current = now;
        a.onShift(decision.targetBitrate);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, []);
}
```

- [ ] **Step 4: Extend `usePlaybackSession`** — measure bandwidth before the first `fetchPlaybackInfo`, track `bandwidth`, `currentBitrate` (set to `p.maxBitrate` on renegotiate, or `mediaSource.Bitrate ?? cap` initially), and `isTranscoding` (`stream?.isHls === true`). Add these to the returned object. In `Watch`, mount `useAbrController({ engineState: <from a lifted engine? > ...})`. Since the engine lives inside `VideoPlayer`, expose engine state upward: lift `useVideoEngine` into `Watch`? No — simpler: have `VideoPlayer` accept an `onEngineState?: (s: EngineState) => void` callback (or render-prop) and forward it; `Watch` stores it in a ref and mounts `useAbrController`. Implement the smallest version: `VideoPlayer` calls `props.onEngineState?.(engine.state)` in an effect on state change; `Watch` keeps `engineStateRef` and passes a stable object into `useAbrController` via a tiny state mirror.

- [ ] **Step 5: Run tests + `tsc -b`.**

- [ ] **Step 6: Playwright E2E (throttled)** — via CDP `Network.emulateNetworkConditions` (Playwright: `page.context().newCDPSession` then set low `downloadThroughput`), play a high-bitrate title and confirm the reported `MaxStreamingBitrate` / stream renegotiates downward within ~30s (observe via `read_network_requests` on PlaybackInfo calls showing a lower `MaxStreamingBitrate`, or a new `master.m3u8` request). Commit — `git add -A && git commit -m "feat: automatic adaptive quality (bandwidth-measured, stall-driven ABR)"`

---

## Phase 4 — Trickplay scrubber thumbnails

### Task 14: `trickplay.ts` — tile math

**Files:**
- Create: `src/lib/jellyfin/trickplay.ts`, `src/lib/jellyfin/trickplay.test.ts`

**Interfaces:**
- Consumes: `BaseItemDto`, `TrickplayInfo` (SDK).
- Produces:
  - `type Trickplay = { info: import('@jellyfin/sdk/lib/generated-client').TrickplayInfo; width: number; itemId: string; mediaSourceId: string }`
  - `selectTrickplay(item, mediaSourceId, screenWidth, dpr): Trickplay | null` — from `item.Trickplay?.[mediaSourceId]` pick the largest numeric width key ≤ `screenWidth*dpr*0.2` (or the smallest if all exceed); null if none.
  - `type Tile = { imageUrl: string; bgX: number; bgY: number; width: number; height: number }`
  - `tileForTime(tp: Trickplay, serverUrl: string, token: string, seconds: number): Tile` — the documented math; image URL `serverUrl + '/Videos/' + itemId + '/Trickplay/' + info.Width + '/' + index + '.jpg?mediaSourceId=' + msId + '&api_key=' + token`.

- [ ] **Step 1: Write failing test** `trickplay.test.ts`
```ts
import { expect, test } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { selectTrickplay, tileForTime } from './trickplay';

const info = { Interval: 10000, TileWidth: 10, TileHeight: 10, Width: 320, Height: 180, ThumbnailCount: 250 };
const item = { Id: 'itm', Trickplay: { ms1: { '320': info } } } as unknown as BaseItemDto;

test('selectTrickplay picks a width within the screen budget', () => {
  const tp = selectTrickplay(item, 'ms1', 1920, 1);
  expect(tp?.width).toBe(320); // 1920*0.2=384 >= 320
});
test('tileForTime computes sheet index and background offset', () => {
  const tp = selectTrickplay(item, 'ms1', 1920, 1)!;
  // t=125s => currentTile=125000/10000=12 (floor). tileSize=100 => index 0, offset 12 => x=2,y=1
  const tile = tileForTime(tp, '/jf', 'tok', 125);
  expect(tile.imageUrl).toBe('/jf/Videos/itm/Trickplay/320/0.jpg?mediaSourceId=ms1&api_key=tok');
  expect(tile.bgX).toBe(-(2 * 320));
  expect(tile.bgY).toBe(-(1 * 180));
  expect(tile.width).toBe(320);
});
test('multi-sheet boundary: tile 105 -> sheet 1', () => {
  const tp = selectTrickplay(item, 'ms1', 1920, 1)!;
  const tile = tileForTime(tp, '/jf', 'tok', 1055); // currentTile=105 => index 1, offset 5 => x5 y0
  expect(tile.imageUrl).toContain('/Trickplay/320/1.jpg');
  expect(tile.bgX).toBe(-(5 * 320));
  expect(tile.bgY).toBe(0);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `trickplay.ts`**
```ts
import type { BaseItemDto, TrickplayInfo } from '@jellyfin/sdk/lib/generated-client';

export type Trickplay = { info: TrickplayInfo; width: number; itemId: string; mediaSourceId: string };
export type Tile = { imageUrl: string; bgX: number; bgY: number; width: number; height: number };

export function selectTrickplay(item: BaseItemDto, mediaSourceId: string, screenWidth: number, dpr: number): Trickplay | null {
  const byWidth = item.Trickplay?.[mediaSourceId];
  if (!byWidth) return null;
  const widths = Object.keys(byWidth).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (!widths.length) return null;
  const budget = screenWidth * dpr * 0.2;
  const within = widths.filter((w) => w <= budget);
  const width = within.length ? within[within.length - 1] : widths[0];
  const info = byWidth[String(width)];
  if (!info) return null;
  return { info, width, itemId: item.Id ?? '', mediaSourceId };
}

export function tileForTime(tp: Trickplay, serverUrl: string, token: string, seconds: number): Tile {
  const { info } = tp;
  const interval = info.Interval ?? 10000;
  const tw = info.TileWidth ?? 10, th = info.TileHeight ?? 10;
  const w = info.Width ?? 0, h = info.Height ?? 0;
  const currentTile = Math.floor((seconds * 1000) / interval);
  const tileSize = tw * th;
  const index = Math.floor(currentTile / tileSize);
  const offset = currentTile % tileSize;
  const x = offset % tw, y = Math.floor(offset / tw);
  return {
    imageUrl: `${serverUrl}/Videos/${tp.itemId}/Trickplay/${info.Width}/${index}.jpg?mediaSourceId=${tp.mediaSourceId}&api_key=${token}`,
    bgX: -(x * w), bgY: -(y * h), width: w, height: h,
  };
}
```

- [ ] **Step 4: Run, verify pass. Commit** — `git add -A && git commit -m "feat: trickplay resolution selection + tile math"`

### Task 15: `TrickplayBubble` in the Scrubber

**Files:**
- Create: `src/components/player/TrickplayBubble.tsx`, `src/components/player/TrickplayBubble.module.css`
- Modify: `src/components/player/Scrubber.tsx` (accept a `renderBubble` slot or `hover` already exists — add an overlay bubble), `VideoPlayer.tsx` (compute trickplay from session.mediaSource + item; pass hover→bubble), `usePlaybackSession`/Watch to expose the resolved `mediaSource.Id` and the `item`.
- Test: `src/components/player/TrickplayBubble.test.tsx`

**Interfaces:**
- Consumes: `selectTrickplay`/`tileForTime`, `formatTime`.
- Produces:
  - `TrickplayBubble({ trickplay, serverUrl, token, hover })` where `hover: { seconds: number; x: number } | null`; renders (when hover) a positioned bubble: if `trickplay` present, a `width×height` div with `background-image`/`background-position` from `tileForTime`, plus `formatTime(seconds)`; if absent, just the time label. Positioned at `left: hover.x`.
  - `Scrubber` gains an optional `children` overlay OR `VideoPlayer` renders `<TrickplayBubble>` as a sibling using the same `onHover` info it already receives. Simplest: `VideoPlayer` owns `hover` state (set by ControlBar/Scrubber `onHover`) and renders `TrickplayBubble` inside the bottom bar area.

- [ ] **Step 1: Write failing test** `TrickplayBubble.test.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import TrickplayBubble from './TrickplayBubble';

const tp = { info: { Interval: 10000, TileWidth: 10, TileHeight: 10, Width: 320, Height: 180 }, width: 320, itemId: 'itm', mediaSourceId: 'ms1' };

test('shows a thumbnail with the tile background when hovering', () => {
  render(<TrickplayBubble trickplay={tp as never} serverUrl="/jf" token="tok" hover={{ seconds: 125, x: 200 }} />);
  const thumb = screen.getByTestId('trickplay-thumb');
  expect(thumb.style.backgroundImage).toContain('/Videos/itm/Trickplay/320/0.jpg');
  expect(screen.getByText('2:05')).toBeInTheDocument();
});
test('renders nothing when not hovering', () => {
  const { container } = render(<TrickplayBubble trickplay={tp as never} serverUrl="/jf" token="tok" hover={null} />);
  expect(container).toBeEmptyDOMElement();
});
test('time-only when no trickplay', () => {
  render(<TrickplayBubble trickplay={null} serverUrl="/jf" token="tok" hover={{ seconds: 60, x: 10 }} />);
  expect(screen.getByText('1:00')).toBeInTheDocument();
  expect(screen.queryByTestId('trickplay-thumb')).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `TrickplayBubble.tsx`**
```tsx
import type { Trickplay } from '../../lib/jellyfin/trickplay';
import { tileForTime } from '../../lib/jellyfin/trickplay';
import { formatTime } from '../../lib/format';
import styles from './TrickplayBubble.module.css';

export default function TrickplayBubble({
  trickplay, serverUrl, token, hover,
}: {
  trickplay: Trickplay | null; serverUrl: string; token: string;
  hover: { seconds: number; x: number } | null;
}) {
  if (!hover) return null;
  const tile = trickplay ? tileForTime(trickplay, serverUrl, token, hover.seconds) : null;
  return (
    <div className={styles.bubble} style={{ left: hover.x }}>
      {tile && (
        <div
          data-testid="trickplay-thumb"
          className={styles.thumb}
          style={{
            width: tile.width, height: tile.height,
            backgroundImage: `url(${tile.imageUrl})`,
            backgroundPosition: `${tile.bgX}px ${tile.bgY}px`,
          }}
        />
      )}
      <span className={styles.time}>{formatTime(hover.seconds)}</span>
    </div>
  );
}
```
`TrickplayBubble.module.css`:
```css
.bubble { position: absolute; bottom: 44px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none; }
.thumb { border: 2px solid #fff; border-radius: 4px; background-repeat: no-repeat; }
.time { color: #fff; font-size: 13px; text-shadow: 0 1px 2px #000; }
```

- [ ] **Step 4: Wire into `VideoPlayer`** — add `hover` state; pass `onHover={setHover}` down through `ControlBar`→`Scrubber` (ControlBar already forwards `onHover`); compute `const trickplay = useMemo(() => item && session.mediaSource?.Id ? selectTrickplay(item, session.mediaSource.Id, window.screen.width, window.devicePixelRatio) : null, [...])`. This needs `item` in VideoPlayer — pass `item` as a prop from Watch (or pass the resolved `trickplay` from Watch). Simplest: Watch computes `trickplay` (it has `item` and `session.mediaSource`) and passes it to `VideoPlayer`; VideoPlayer renders `<TrickplayBubble trickplay={trickplay} serverUrl={appSession.serverUrl} token={appSession.accessToken} hover={hover} />` inside the bottom-bar container. Put the bubble in `ControlBar` via a new `bubble` slot prop, or render it in VideoPlayer positioned over the scrubber. Choose: add a `bubbleSlot?: React.ReactNode` prop to `ControlBar` rendered just above the Scrubber row.

- [ ] **Step 5: Run tests + `tsc -b`.**

- [ ] **Step 6: Playwright E2E** — with trickplay present (or after enabling generation), hover the scrubber and confirm the thumbnail image loads and time label tracks the pointer; without trickplay, only the time shows. Commit — `git add -A && git commit -m "feat: trickplay scrubber thumbnails with graceful fallback"`

### Task 16: Server-enable docs + final gate

**Files:**
- Create: `docs/trickplay-setup.md`
- Modify: `README.md` (link the player features + trickplay setup)

**Interfaces:** none.

- [ ] **Step 1: Write `docs/trickplay-setup.md`**
```markdown
# Enabling trickplay (scrubber thumbnails) on your Jellyfin server

Jellyflix reads trickplay tile-sheets the server generates; it shows a plain
scrubber where they're absent.

1. Jellyfin **Dashboard → Playback** (or a library's **Manage Library →
   Trickplay** settings): enable **"Enable trickplay image extraction"**.
   Optional: "Generate images during library scan", set interval (default 10s),
   tile size, and hardware acceleration if available.
2. **Dashboard → Scheduled Tasks → "Generate Trickplay Images" → Run**. Large
   libraries take a while and use CPU/GPU + disk for the tile JPEGs.
3. Reload a title in Jellyflix and hover the seek bar — thumbnails appear once
   `item.Trickplay` is populated for that media source.

Notes: HEVC/10-bit sources may need ffmpeg with matching decoders; storage grows
with library size and thumbnail resolution.
```

- [ ] **Step 2: Update `README.md`** — under features, add: "Custom player: automatic adaptive quality, audio/subtitle selection, scrubber thumbnails (see `docs/trickplay-setup.md`)."

- [ ] **Step 3: Full gate** — `npm test && npx tsc -b && npm run build` (all pass; delete regenerated `vite.config.js`/`.d.ts`).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "docs: trickplay setup guide; finalize player improvements"`

---

## Self-Review

**Spec coverage:**
- §4.1 custom controls → Tasks 2–5. ✓
- §4.2 audio/subtitle selection (VTT native, burn-in fallback, no restart for External) → Tasks 6,8,9,10. ✓
- §4.3 automatic adaptive quality (bandwidth measure + pure ABR + loop, accurate profile/HEVC) → Tasks 8,11,12,13. ✓
- §4.4 trickplay (tile math + bubble + server doc) → Tasks 14,15,16. ✓
- §5 renegotiation core (position-preserving, negotiationId, stopEncoding) → Tasks 7,9. ✓
- §6 error handling (bitrate fallback, hls recovery, missing trickplay) → Tasks 2,11,15; existing Watch error screen retained → Task 10. ✓
- §7 testing (pure units + component + controller + E2E) → throughout. ✓

**Type consistency:** `NegotiateParams`, `PlaybackSession`, `EngineState`, `AudioTrack`/`SubtitleTrack`, `AbrState`, `Trickplay`/`Tile` are defined once and consumed with matching shapes. `fetchPlaybackInfo` signature change (positional `startTicks` → `NegotiateParams`) is updated at its one existing caller in Task 7 Step 4 and re-used in Task 9. `buildDeviceProfile` gains `maxBitrate?` in Task 7 (stub) and is fully implemented in Task 8.

**Placeholder scan:** no TBD/TODO; every code step carries full code. The two places that say "simplest: choose X" (Task 13 Step 4 engine-state lifting, Task 15 Step 4 bubble slot) each state a concrete chosen approach, not an open question.

**Known follow-ups (Minor, for final review):**
- Task 13's engine-state lifting adds an `onEngineState` callback from VideoPlayer to Watch; if that proves noisy, refactor to lift `useVideoEngine` into Watch. Flagged, not blocking.
- Client-side audio switching (toggling `audioTracks`) is intentionally NOT implemented (Chrome dropped the API) — all audio switches renegotiate. This matches the spec.
