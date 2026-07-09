# ControlBar Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presentation-only polish of the player `ControlBar` — migrate its unicode glyphs to lucide icons, shrink the ±10 labels, make the scrubber/controls span nearly full width, and give the volume slider a Netflix-style hover-reveal.

**Architecture:** Single component pair (`ControlBar.tsx` + `ControlBar.module.css`). No behavior, handler, or data changes; every aria-label is preserved so the existing test's role queries keep passing. Icons come from `lucide-react` (already a dependency, all nine verified present).

**Tech Stack:** React 19 + TypeScript strict, CSS modules, `lucide-react`, Vitest + @testing-library/react.

## Global Constraints

- Presentation only: do NOT change the keyboard handler, `useAutoHide`, the `extras`/`bubbleSlot` slots, progress reporting, or any aria-label.
- Preserved aria-labels (hard contract, tests query by name): `Back`, `Play`, `Pause`, `Rewind 10 seconds`, `Forward 10 seconds`, `Mute`/`Unmute`, `Volume`, `Fullscreen`.
- Volume slider = hover-reveal; slider stays in the DOM when collapsed (so `getByRole('slider',{name:'Volume'})` resolves).
- Volume icon: `VolumeX` if muted or volume 0; `Volume1` if volume ≤ 0.5; else `Volume2`.
- Fullscreen icon visibly larger (`Maximize size={26}`) than the ~20px row icons.
- `--nf-inset` = `4vw` (`src/styles/tokens.css`); `.bottom` drops it for a fixed `24px` so the bar spans near full width. `.top` keeps `var(--nf-inset)`.
- Run tests: `npx vitest run src/components/player/ControlBar.test.tsx`. Type-check/build gate: `npx tsc -b` (Vitest does NOT type-check).

---

### Task 1: ControlBar polish (icons, full-width, hover-reveal volume)

**Files:**
- Modify: `src/components/player/ControlBar.tsx` (full rewrite of the render + add a `VolumeIcon` helper)
- Modify: `src/components/player/ControlBar.module.css` (full rewrite)
- Test: `src/components/player/ControlBar.test.tsx` (add one regression assertion)

**Interfaces:**
- Consumes: `VideoEngine` from `../../hooks/player/useVideoEngine`, `useAutoHide`, `Scrubber`, `formatTime` — all unchanged. Public props of `ControlBar` are unchanged.
- Produces: nothing new consumed elsewhere (leaf component).

- [ ] **Step 1: Add a regression assertion (guards the hover-reveal restructure)**

The volume slider moves inside a `.volumeGroup` and is visually collapsed until hover; it must remain in the DOM and reachable by role. Add this test to `src/components/player/ControlBar.test.tsx` (after the existing test):

```tsx
test('volume slider stays in the DOM (hover-reveal) and mute/fullscreen are reachable', () => {
  const engine = makeEngine();
  render(<ControlBar engine={engine} title="X" onBack={() => {}} onScrub={() => {}} onHover={() => {}} menuOpen={false} extras={null} />);
  expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /mute/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /fullscreen/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /rewind/i }));
  expect((engine as never as { seekBy: (n: number) => void }).seekBy).toHaveBeenCalledWith(-10);
});
```

- [ ] **Step 2: Run the test — it passes against the CURRENT code (characterization/regression, not RED)**

Run: `npx vitest run src/components/player/ControlBar.test.tsx`
Expected: PASS (2 tests). This is a refactor: the assertion locks behavior that must survive the rewrite. If it fails now, stop and reconcile before touching the component.

- [ ] **Step 3: Rewrite `src/components/player/ControlBar.tsx`**

```tsx
import { useEffect } from 'react';
import { ChevronLeft, Play, Pause, RotateCcw, RotateCw, Volume2, Volume1, VolumeX, Maximize } from 'lucide-react';
import type { VideoEngine } from '../../hooks/player/useVideoEngine';
import { useAutoHide } from '../../hooks/player/useAutoHide';
import Scrubber from './Scrubber';
import { formatTime } from '../../lib/format';
import styles from './ControlBar.module.css';

function VolumeIcon({ muted, volume }: { muted: boolean; volume: number }) {
  if (muted || volume === 0) return <VolumeX size={20} />;
  if (volume <= 0.5) return <Volume1 size={20} />;
  return <Volume2 size={20} />;
}

export default function ControlBar({
  engine, title, onBack, onScrub, onHover, menuOpen, extras, bubbleSlot,
}: {
  engine: VideoEngine; title: string; onBack: () => void;
  onScrub: (s: number) => void; onHover: (info: { seconds: number; x: number } | null) => void;
  menuOpen: boolean; extras: React.ReactNode; bubbleSlot?: React.ReactNode;
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
        <button className={styles.back} onClick={onBack} aria-label="Back"><ChevronLeft size={22} /> Back</button>
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.center}>
        <button className={styles.bigPlay} onClick={engine.togglePlay} aria-label={state.paused ? 'Play' : 'Pause'}>
          {state.paused ? <Play size={40} fill="currentColor" strokeWidth={0} /> : <Pause size={40} fill="currentColor" strokeWidth={0} />}
        </button>
      </div>
      <div className={styles.bottom}>
        <div className={styles.scrubRow}>
          {bubbleSlot}
          <Scrubber currentTime={state.currentTime} duration={state.duration} bufferedEnd={state.bufferedEnd} onScrub={onScrub} onHover={onHover} />
        </div>
        <div className={styles.buttons}>
          <button onClick={engine.togglePlay} aria-label={state.paused ? 'Play' : 'Pause'}>
            {state.paused ? <Play size={20} fill="currentColor" strokeWidth={0} /> : <Pause size={20} fill="currentColor" strokeWidth={0} />}
          </button>
          <button className={styles.icon10} onClick={() => engine.seekBy(-10)} aria-label="Rewind 10 seconds">
            <RotateCcw size={22} /><span className={styles.num} aria-hidden="true">10</span>
          </button>
          <button className={styles.icon10} onClick={() => engine.seekBy(10)} aria-label="Forward 10 seconds">
            <RotateCw size={22} /><span className={styles.num} aria-hidden="true">10</span>
          </button>
          <div className={styles.volumeGroup}>
            <button onClick={engine.toggleMute} aria-label={state.muted ? 'Unmute' : 'Mute'}>
              <VolumeIcon muted={state.muted} volume={state.volume} />
            </button>
            <input className={styles.volume} type="range" min={0} max={1} step={0.05} value={state.muted ? 0 : state.volume}
              onChange={(e) => engine.setVolume(Number(e.target.value))} aria-label="Volume" />
          </div>
          <span className={styles.time}>{formatTime(state.currentTime)} / -{formatTime(remaining)}</span>
          <span className={styles.spacer} />
          {extras}
          <button onClick={engine.requestFullscreen} aria-label="Fullscreen"><Maximize size={26} /></button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `src/components/player/ControlBar.module.css`**

```css
.wrap { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between;
  background: linear-gradient(0deg, rgba(0,0,0,.7) 0%, transparent 25%, transparent 75%, rgba(0,0,0,.6) 100%);
  opacity: 1; transition: opacity .3s ease; }
.hidden { opacity: 0; cursor: none; }
.top { display: flex; align-items: center; gap: 16px; padding: 20px var(--nf-inset); }
.back { display: inline-flex; align-items: center; gap: 4px; color: #fff; font-size: 18px; }
.title { color: #fff; font-weight: 700; font-size: 18px; }
.center { flex: 1; display: grid; place-items: center; }
.bigPlay { display: grid; place-items: center; width: 72px; height: 72px; border-radius: 50%; background: rgba(0,0,0,.4); color: #fff; }
.bottom { padding: 12px 24px 24px; display: flex; flex-direction: column; gap: 8px; }
.scrubRow { position: relative; }
.buttons { display: flex; align-items: center; gap: 16px; color: #fff; }
.buttons button { display: inline-flex; align-items: center; justify-content: center; color: #fff; }
.icon10 { position: relative; }
.num { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -40%); font-size: 9px; font-weight: 700; line-height: 1; pointer-events: none; }
.volumeGroup { display: flex; align-items: center; gap: 8px; overflow: hidden; }
.volume { -webkit-appearance: none; appearance: none; width: 0; opacity: 0; height: 4px; border-radius: 2px;
  background: rgba(255,255,255,.3); cursor: pointer; transition: width .2s ease, opacity .2s ease; }
.volumeGroup:hover .volume, .volumeGroup:focus-within .volume { width: 80px; opacity: 1; }
.volume::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #fff; }
.volume::-moz-range-thumb { width: 12px; height: 12px; border: none; border-radius: 50%; background: #fff; }
.spacer { flex: 1; }
.time { font-size: 14px; color: var(--nf-grey); }
@media (prefers-reduced-motion: reduce) { .wrap { transition: none; } .volume { transition: none; } }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/player/ControlBar.test.tsx`
Expected: PASS (2 tests) — labels unchanged, so both the existing test and the new one pass.

- [ ] **Step 6: Type-check + full suite**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run`
Expected: full suite green (a pre-existing flaky `Watch.test.tsx` Node-26 localStorage flake is the only acceptable failure).

- [ ] **Step 7: Commit**

```bash
git add src/components/player/ControlBar.tsx src/components/player/ControlBar.module.css src/components/player/ControlBar.test.tsx
git commit -m "feat(player): lucide icons, full-width bar, hover-reveal volume slider"
```

---

## Self-Review

**Spec coverage:** lucide migration (Back/Play/Pause/±10/volume/fullscreen) → Step 3 ✅; smaller "10" overlay (`.num` 9px) → Steps 3-4 ✅; full-width `.bottom` (24px vs `--nf-inset`) → Step 4 ✅; bigger fullscreen (`Maximize 26`) → Step 3 ✅; hover-reveal volume + custom track/thumb → Step 4 ✅; volume icon thresholds → `VolumeIcon` Step 3 ✅; aria-labels preserved / slider stays in DOM → Steps 1-2 + constraints ✅; reduced-motion → Step 4 ✅.

**Placeholder scan:** none — full TSX and CSS provided, exact commands.

**Type consistency:** props signature unchanged; `VolumeIcon({muted, volume})` matches its call site; all imported icons exist in `lucide-react` (verified). `strokeWidth={0}` + `fill="currentColor"` matches the existing filled-Play convention used elsewhere in the app.

**Simplification note (ponytail):** dropped the spec's separate `.fs` CSS class — the fullscreen button is enlarged purely via `Maximize size={26}`, so an empty class would be dead code.
