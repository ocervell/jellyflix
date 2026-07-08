# ControlBar Polish — Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Goal

Polish the video player's `ControlBar` — presentation only, no behavior changes: migrate its remaining unicode-glyph controls to lucide icons (consistent with the rest of the app), make the scrubber/controls span nearly full width, shrink the ±10 labels, replace the volume icon, and give the volume slider a slick Netflix-style hover-reveal.

## Background

`src/components/player/ControlBar.tsx` is the last component in Jellyflix still using unicode glyphs (`▶ ❚❚ ⟲10 10⟳ 🔊 🔇 ⛶ ‹`); everything else migrated to `lucide-react` (already a dependency) in SP1.5. Its layout uses `--nf-inset` (= `4vw`, from `src/styles/tokens.css`) as the horizontal inset on `.top` and `.bottom`, which makes the scrubber + control row noticeably narrower than the video.

This change is purely visual. It must not alter: the keyboard handler, `useAutoHide` behavior, the `extras`/`bubbleSlot` slots, progress reporting, or any aria-label (the existing `ControlBar.test.tsx` queries controls by accessible name, so labels are a hard contract).

## Scope decisions (locked)

- **Volume slider:** hover-reveal (Netflix-style) — only the mute icon shows; the slider expands when the volume area is hovered or focused, collapses otherwise.
- **±10 buttons:** keep the "10", render it much smaller as a centered overlay on a circular-arrow icon.
- Presentation only — no new controls, no behavior changes (YAGNI).

## Icon migration (lucide-react)

All from `lucide-react` (verified present): `Play`, `Pause`, `RotateCcw`, `RotateCw`, `Volume2`, `Volume1`, `VolumeX`, `Maximize`, `ChevronLeft`.

| Control | Before | After | aria-label (unchanged) |
|---|---|---|---|
| Back | `‹ Back` | `<ChevronLeft/>` + "Back" text | `Back` |
| Center play/pause | `▶` / `❚❚` | `<Play fill/>` (~40) / `<Pause fill/>` | `Play` / `Pause` |
| Bottom play/pause | `▶` / `❚❚` | `<Play fill/>` (~20) / `<Pause fill/>` | `Play` / `Pause` |
| Rewind 10 | `⟲10` | `<RotateCcw size={22}/>` + centered "10" overlay | `Rewind 10 seconds` |
| Forward 10 | `10⟳` | `<RotateCw size={22}/>` + centered "10" overlay | `Forward 10 seconds` |
| Mute/volume | `🔊` / `🔇` | `VolumeX` if muted or volume 0; `Volume1` if volume ≤ 0.5; else `Volume2` | `Mute` / `Unmute` |
| Fullscreen | `⛶` | `<Maximize size={26}/>` (bigger than the ~20 row icons) | `Fullscreen` |

**±10 overlay:** the button becomes `position: relative`; inside it the lucide icon plus a `<span>` positioned absolutely dead-center with `font-size: 9px; font-weight: 700; pointer-events: none;` reading "10". So the icon carries the rewind/forward meaning and the number is small, matching the request. The `aria-label` stays on the button, and the "10" span is `aria-hidden`.

## Layout & styling

**Full-width bottom bar:** change `.bottom`'s horizontal padding from `var(--nf-inset)` to a small fixed inset (`24px`) so the scrubber and the button row span nearly edge-to-edge. `.top` (Back + title) keeps `var(--nf-inset)` — the complaint was specifically about the play/scrubber bar, and the title reading inset from the edge is fine.

**Custom volume slider (hover-reveal):**
- Wrap the mute button + volume `<input type="range">` in a `.volumeGroup` (`display: flex; align-items: center`).
- The slider (`.volume`) is collapsed by default (`width: 0; opacity: 0`) and expands on `.volumeGroup:hover` / `.volumeGroup:focus-within` (`width: 80px; opacity: 1`) with a `width, opacity` transition. `overflow: hidden` on the group keeps the collapsed slider from taking space. The slider stays in the DOM (so `getByRole('slider', {name:'Volume'})` still resolves and keyboard focus reveals it).
- Restyle the range input itself: `appearance: none; height: 4px` track (`background: rgba(255,255,255,.3)`), and a small round thumb via `::-webkit-slider-thumb` and `::-moz-range-thumb` (`width/height: 12px; border-radius: 50%; background: #fff`). This mirrors the Scrubber's visual language (4px track, small knob).
- Add `.volumeGroup` transition to the existing `@media (prefers-reduced-motion: reduce)` block so the reveal is instant when reduced motion is requested.

**Icon button sizing:** normalize the bottom-row icon buttons to a consistent size (line-height/height so lucide icons align), fullscreen visibly larger via `size={26}`. Keep the existing `.buttons` gap and `.spacer`.

## Components / files

- **`src/components/player/ControlBar.tsx`** — replace glyphs with lucide components; wrap ±10 buttons with the "10" overlay span; wrap mute + volume in `.volumeGroup`; add classes (`.icon10`, `.num`, `.volumeGroup`, `.fs`) as needed. Volume-icon selection is a small inline helper (muted/0 → `VolumeX`, ≤0.5 → `Volume1`, else `Volume2`). No logic/handler/keyboard changes.
- **`src/components/player/ControlBar.module.css`** — `.bottom` full-width inset; `.volumeGroup` hover-reveal + slider track/thumb styling; `.icon10`/`.num` overlay; `.fs` sizing; reduced-motion addition.

## Error handling / data flow

None — this is a presentational component; it renders `engine.state` and calls existing `engine` methods. No new data, no async, no failure surface.

## Testing

- `src/components/player/ControlBar.test.tsx` already asserts the controls by accessible name and exercises the keyboard handler. Because every aria-label is preserved, these must continue to pass unchanged; run them and fix only a query that legitimately breaks (e.g. if a label string changed — it should not).
- Add lightweight assertions that the migrated controls still render and are reachable: the Rewind/Forward buttons still expose `Rewind 10 seconds` / `Forward 10 seconds`, the mute button toggles `Mute`/`Unmute` by state, the volume `slider` (name `Volume`) is present in the DOM, and `Fullscreen` is present. Assert the ±10 "10" text is `aria-hidden` (not part of the accessible name).
- No live/server verification is required (presentational; the test server is unreachable from the exec environment anyway). Visual confirmation is by inspection when next in front of a running client.

## Out of scope (YAGNI)

- No new controls (PiP, settings gear beyond the existing `extras` slot).
- No changes to auto-hide, keyboard shortcuts, ABR, or reporting.
- **Not** the episode HLS-resume bug — root cause is confirmed and recorded, but it is a core-playback change requiring live verification and ships as its own separate batch.
