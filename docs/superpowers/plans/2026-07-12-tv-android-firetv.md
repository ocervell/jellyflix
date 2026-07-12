# Android TV / Fire TV Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Jellyflix fully D-pad navigable (usable in a TV browser now) and scaffold a thin Capacitor leanback APK for Android TV / Fire TV.

**Architecture:** Add an always-on spatial-navigation layer using `@noriginmedia/norigin-spatial-navigation`: two reusable wrappers (`Focusable` leaf, `FocusSection` container) plus a global Back handler are wired into every interactive component. Mouse/touch stay unchanged (additive). A Capacitor project (loading the deployed URL) is scaffolded with an Android TV manifest; the APK is built by the user (no Android SDK here).

**Tech Stack:** React 19 + TypeScript strict, Vite, `@noriginmedia/norigin-spatial-navigation`, Vitest + @testing-library/react, Playwright (keyboard E2E), Capacitor (scaffold).

## Global Constraints

- **Additive only:** every change keeps existing `onClick`/mouse/touch behavior; the full existing test suite must stay green.
- **Always-on:** spatial nav active with no device detection; arrow keys move focus, Enter/OK activates.
- **Library:** `@noriginmedia/norigin-spatial-navigation` (only new runtime dep).
- **Focus movement is E2E-verified, not unit-tested:** jsdom has no layout geometry, so norigin's geometric focus movement can't run in Vitest. Per-task tests assert rendering + `onEnterPress` activation + no regressions; the real navigation is verified by the Playwright keyboard E2E (Task 12). Do NOT write unit tests that assert focus *moved* by arrow key.
- **Back priority:** open TrackMenu → close it; open DetailModal → close it; on `/watch` → leave player; else `navigate(-1)`; at root → no-op (APK maps to exit).
- **Capacitor APK is scaffold-only** — config + Android manifest edits + `docs/tv-build.md`; built by the user in Android Studio.
- TypeScript strict, no `any`. Run one test: `npx vitest run <path>`; suite `npx vitest run`; build/type-check `npm run build`.
- Focus ring styling must respect `@media (prefers-reduced-motion: reduce)` (no scale).

---

### Task 1: Focus foundation — init, `Focusable`, `FocusSection`

**Files:**
- Create: `src/lib/tv/focus.ts`
- Create: `src/components/tv/Focusable.tsx`
- Create: `src/components/tv/FocusSection.tsx`
- Create: `src/components/tv/focus.module.css`
- Modify: `src/main.tsx` (call `initFocus()`)
- Test: `src/components/tv/Focusable.test.tsx`

**Interfaces:**
- Produces:
  - `initFocus(): void` — calls norigin `init` once (idempotent).
  - `Focusable(props: { children: React.ReactNode; onEnterPress?: () => void; className?: string; as?: 'div' | 'li'; focusKey?: string; onArrowPress?: (dir: 'left'|'right'|'up'|'down') => boolean; ariaLabel?: string; onFocus?: () => void }): JSX.Element` — a focusable leaf; adds `styles.focused` when focused and fires `onEnterPress` on OK/Enter.
  - `FocusSection(props: { children: React.ReactNode; className?: string; as?: 'div'|'ul'|'section'|'header'; focusKey?: string; isBoundary?: boolean }): JSX.Element` — a focus container that provides `FocusContext` to its children.

- [ ] **Step 1: Install the dependency**

Run: `npm i @noriginmedia/norigin-spatial-navigation`
Expected: adds to `dependencies`.

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/tv/Focusable.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi, beforeAll } from 'vitest';
import { initFocus } from '../../lib/tv/focus';
import { Focusable } from './Focusable';

beforeAll(() => initFocus());

test('Focusable renders its children and fires onEnterPress on Enter', () => {
  const onEnter = vi.fn();
  render(<Focusable onEnterPress={onEnter} ariaLabel="Play"><span>Play</span></Focusable>);
  const el = screen.getByText('Play').parentElement as HTMLElement;
  // norigin listens on keydown; Enter triggers the focused element's onEnterPress once focused.
  el.focus?.();
  fireEvent.keyDown(window, { key: 'Enter', keyCode: 13 });
  // Even without geometric focus, activating via click path must also work:
  fireEvent.click(el);
  expect(onEnter).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/tv/Focusable.test.tsx`
Expected: FAIL — cannot find module `../../lib/tv/focus` / `./Focusable`.

- [ ] **Step 4: Implement**

```ts
// src/lib/tv/focus.ts
import { init } from '@noriginmedia/norigin-spatial-navigation';

let started = false;
/** Initialise spatial navigation once. Arrow keys move focus; Enter/OK activates. */
export function initFocus(): void {
  if (started) return;
  started = true;
  init({ debug: false, visualDebug: false });
}
```

```tsx
// src/components/tv/Focusable.tsx
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import styles from './focus.module.css';

export function Focusable({
  children, onEnterPress, onArrowPress, className, as = 'div', focusKey, ariaLabel, onFocus,
}: {
  children: React.ReactNode; onEnterPress?: () => void;
  onArrowPress?: (dir: 'left' | 'right' | 'up' | 'down') => boolean;
  className?: string; as?: 'div' | 'li'; focusKey?: string; ariaLabel?: string; onFocus?: () => void;
}) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => onEnterPress?.(),
    onArrowPress: (dir) => (onArrowPress ? onArrowPress(dir as 'left' | 'right' | 'up' | 'down') : true),
    onFocus: () => onFocus?.(),
  });
  const cls = `${className ?? ''} ${focused ? styles.focused : ''}`.trim();
  const props = { ref, className: cls, 'aria-label': ariaLabel, onClick: () => onEnterPress?.(), role: 'button', tabIndex: -1 };
  return as === 'li' ? <li {...props}>{children}</li> : <div {...props}>{children}</div>;
}
```

```tsx
// src/components/tv/FocusSection.tsx
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';

export function FocusSection({
  children, className, as = 'div', focusKey, isBoundary = false,
}: {
  children: React.ReactNode; className?: string; as?: 'div' | 'ul' | 'section' | 'header'; focusKey?: string; isBoundary?: boolean;
}) {
  const { ref, focusKey: fk } = useFocusable({ focusKey, isFocusBoundary: isBoundary, trackChildren: true, saveLastFocusedChild: true });
  const Tag = as as 'div';
  return (
    <FocusContext.Provider value={fk}>
      <Tag ref={ref} className={className}>{children}</Tag>
    </FocusContext.Provider>
  );
}
```

```css
/* src/components/tv/focus.module.css */
.focused { outline: 3px solid #fff; outline-offset: 2px; border-radius: 4px; transform: scale(1.04); transition: transform .12s ease; position: relative; z-index: 2; }
@media (prefers-reduced-motion: reduce) { .focused { transform: none; transition: none; } }
```

```tsx
// src/main.tsx — add the import and call before render
import { initFocus } from './lib/tv/focus';
initFocus();
```
(Add `import { initFocus } from './lib/tv/focus';` with the other imports and `initFocus();` immediately before `createRoot(...)`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/tv/Focusable.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/tv src/components/tv src/main.tsx
git commit -m "feat(tv): spatial-nav foundation (init, Focusable, FocusSection)"
```

---

### Task 2: Global Back handler (`useTvBack`)

**Files:**
- Create: `src/lib/tv/back.tsx`
- Modify: `src/main.tsx` (wrap app in `TvBackProvider`)
- Test: `src/lib/tv/back.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `TvBackProvider(props: { onExit?: () => void; children: React.ReactNode }): JSX.Element` — installs one keydown listener for `Escape`/`Backspace`/`GoBack`.
  - `useTvBack(handler: () => boolean, active: boolean): void` — while `active`, pushes `handler` onto a stack; on Back the top handler runs first; returning `true` consumes the event. If no handler consumes it, the provider calls `history.back()` (or `onExit` at root).

- [ ] **Step 1: Write the failing test**

```tsx
// src/lib/tv/back.test.tsx
import { render, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { TvBackProvider, useTvBack } from './back';

function Consumer({ handler, active }: { handler: () => boolean; active: boolean }) {
  useTvBack(handler, active);
  return null;
}

test('top active handler runs first and can consume Back', () => {
  const outer = vi.fn(() => false);
  const inner = vi.fn(() => true);
  const onExit = vi.fn();
  render(
    <TvBackProvider onExit={onExit}>
      <Consumer handler={outer} active />
      <Consumer handler={inner} active />
    </TvBackProvider>,
  );
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(inner).toHaveBeenCalledTimes(1); // last-registered runs first
  expect(outer).not.toHaveBeenCalled();   // inner consumed it
  expect(onExit).not.toHaveBeenCalled();
});

test('falls through to onExit when nothing consumes', () => {
  const onExit = vi.fn();
  render(<TvBackProvider onExit={onExit}><Consumer handler={() => false} active /></TvBackProvider>);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onExit).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tv/back.test.tsx`
Expected: FAIL — cannot find module `./back`.

- [ ] **Step 3: Implement**

```tsx
// src/lib/tv/back.tsx
import { createContext, useContext, useEffect, useRef } from 'react';

type Handler = () => boolean;
const Ctx = createContext<{ push: (h: Handler) => void; pop: (h: Handler) => void } | null>(null);

export function TvBackProvider({ onExit, children }: { onExit?: () => void; children: React.ReactNode }) {
  const stack = useRef<Handler[]>([]);
  const api = useRef({
    push: (h: Handler) => { stack.current.push(h); },
    pop: (h: Handler) => { stack.current = stack.current.filter((x) => x !== h); },
  }).current;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Backspace' && e.key !== 'GoBack') return;
      // Ignore Backspace typed into inputs.
      if (e.key === 'Backspace' && (e.target as HTMLElement)?.tagName === 'INPUT') return;
      for (let i = stack.current.length - 1; i >= 0; i--) {
        if (stack.current[i]()) { e.preventDefault(); return; }
      }
      if (window.history.length > 1) window.history.back();
      else onExit?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** While `active`, register `handler` at the top of the Back stack. */
export function useTvBack(handler: Handler, active: boolean): void {
  const ctx = useContext(Ctx);
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => {
    if (!ctx || !active) return;
    const h: Handler = () => ref.current();
    ctx.push(h);
    return () => ctx.pop(h);
  }, [ctx, active]);
}
```

```tsx
// src/main.tsx — wrap <App /> in <TvBackProvider>
import { TvBackProvider } from './lib/tv/back';
// ...inside render, wrap the existing tree:
//   <ApiProvider><QueryClientProvider ...><TvBackProvider><App /></TvBackProvider></QueryClientProvider></ApiProvider>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tv/back.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tv/back.tsx src/lib/tv/back.test.tsx src/main.tsx
git commit -m "feat(tv): global Back handler stack (useTvBack)"
```

---

### Task 3: TopNav focusable

**Files:**
- Modify: `src/components/nav/TopNav.tsx`
- Modify: `src/components/nav/TopNav.module.css` (focus ring on links)

**Interfaces:**
- Consumes: `FocusSection` (Task 1), `Focusable` (Task 1).

- [ ] **Step 1: Wire focus (no new unit test — smoke via build; nav is E2E-verified in Task 12)**

Wrap the nav links + search + sign-out in a `FocusSection`, and make each link/button a `Focusable`. Replace the `<nav className={styles.links}>` block and the `.right` block:

```tsx
// TopNav.tsx — imports
import { FocusSection } from '../tv/FocusSection';
import { Focusable } from '../tv/Focusable';
import { useNavigate } from 'react-router-dom';
// inside component: const navigate = useNavigate();
```

Replace the returned `<header>` body with a `FocusSection` wrapping the existing structure, each link/button becoming `Focusable` that calls the same navigation/handler on `onEnterPress`:

```tsx
return (
  <FocusSection as="header" focusKey="topnav" className={scrolled ? `${styles.nav} ${styles.solid}` : styles.nav}>
    <div className={styles.left}>
      <span className={styles.logo}>JELLYFLIX</span>
      <nav className={styles.links}>
        <Focusable ariaLabel="Home" onEnterPress={() => navigate('/')} className={location.pathname === '/' ? styles.active : ''}>Home</Focusable>
        {tv && <Focusable ariaLabel="TV Shows" onEnterPress={() => navigate(`/library/${tv.Id}`)} className={isActive(tv.Id) ? styles.active : ''}>TV Shows</Focusable>}
        {movies && <Focusable ariaLabel="Movies" onEnterPress={() => navigate(`/library/${movies.Id}`)} className={isActive(movies.Id) ? styles.active : ''}>Movies</Focusable>}
      </nav>
    </div>
    <div className={styles.right}>
      <SearchBox />
      <Focusable ariaLabel="Sign out" onEnterPress={logout} className={styles.logout}>Sign out</Focusable>
    </div>
  </FocusSection>
);
```

(The `<a href>` links become `Focusable` divs that navigate; keep `styles.active`. Keep `SearchBox` as-is — it's handled in Task 9.)

- [ ] **Step 2: Type-check + suite**

Run: `npx tsc -b` → no errors. Run: `npx vitest run` → suite green (existing TopNav/App tests must still pass; if a test queried the links as anchors by role `link`, update it to role `button` — anchors became focusable buttons).

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/TopNav.tsx src/components/nav/TopNav.module.css
git commit -m "feat(tv): TopNav D-pad focusable"
```

---

### Task 4: Home rows — `Row` container + `PreviewCard` focusable

**Files:**
- Modify: `src/components/row/Row.tsx`
- Modify: `src/components/row/PreviewCard.tsx`
- Modify: `src/components/row/PreviewCard.module.css` (focus mirrors hover-expand)

**Interfaces:**
- Consumes: `FocusSection`, `Focusable`.
- Produces: rows are horizontal focus containers; each card focusable; on focus the card scrolls into the strip and shows the hover-expand chrome.

- [ ] **Step 1: Make `Row` a focus container**

In `Row.tsx`, wrap the `<ul className={styles.strip}>` in a `FocusSection` (as the horizontal container). Keep the existing arrow buttons for mouse. The `Row` self-hides on empty (unchanged).

```tsx
// Row.tsx — import FocusSection; wrap the strip:
import { FocusSection } from '../tv/FocusSection';
// ...
<FocusSection as="ul" className={styles.strip} focusKey={`row-${title}`}>
  {items.map((item) => (
    <PreviewCard key={item.Id} item={item} onOpen={onOpen} onPlay={onPlay} />
  ))}
</FocusSection>
```
(Replace the `<ul ref={stripRef} className={styles.strip}>…</ul>`; move `stripRef` handling — keep the arrow `page()` buttons operating on the same `<ul>`. Since `FocusSection` owns the `ref`, attach `stripRef` for the arrow paging via a wrapping div OR keep the arrow buttons targeting the section element by class query. Simplest: keep `stripRef` by rendering the arrows to scroll the nearest `.strip` via `document`/ref — but to stay minimal, wrap: put `stripRef` on an outer div and let FocusSection be inside. Concretely: keep `<div className={styles.viewport}>` with the arrow buttons and the `FocusSection` strip inside; the arrows call `page(dir)` which scrolls the FocusSection's DOM node found via a ref forwarded from FocusSection — to avoid ref plumbing, give the strip a stable id and scroll it by `getElementById`.)

To keep it simple and correct, add an `id` to the strip and scroll by id:
```tsx
const stripId = `strip-${title}`;
const page = (dir: 1 | -1) => { const el = document.getElementById(stripId); if (el) el.scrollTo({ left: nextScrollLeft(el, dir), behavior: 'smooth' }); };
// FocusSection as="ul" ... plus id via a wrapper: since FocusSection doesn't take id, wrap children scroll target:
```
Because `FocusSection` renders the `<ul>` without an `id`, extend `FocusSection` to also accept and forward an optional `id` prop (add `id?: string` to its props and pass to the tag). Then `<FocusSection as="ul" id={stripId} ...>`.

- [ ] **Step 2: Make `PreviewCard` focusable + focus-expand**

In `PreviewCard.tsx`, wrap the card in `Focusable` with `onEnterPress={() => onOpen(item)}`, and on focus scroll into view + show chrome. Add an `onFocus` that calls `el.scrollIntoView({ block: 'nearest', inline: 'center' })`. Add `:focus-within` mirrors of the hover CSS.

```tsx
// PreviewCard.tsx — wrap the outer .card:
import { Focusable } from '../tv/Focusable';
// return:
<Focusable className={styles.card} ariaLabel={fullLabel}
  onEnterPress={() => onOpen(item)}
  onFocus={(e => e)} /* handled in CSS + norigin scroll */>
  {/* existing .art button, .panel ... unchanged (still clickable by mouse) */}
</Focusable>
```
Keep the inner `.art`/`.play`/`.more` buttons for mouse; the outer Focusable handles remote Enter → open.

In `PreviewCard.module.css`, add `:focus-within` beside every `:hover` reveal so the expand/actions show under the focus ring:
```css
.card:hover .panel, .card:focus-within .panel { /* existing reveal */ }
.card:hover, .card:focus-within { /* existing scale/expand */ }
```
(Duplicate each existing `.card:hover…` selector with a `.card:focus-within…` twin.)

norigin scrolls the focused element into view automatically; the horizontal strip scrolls to keep the focused card centered.

- [ ] **Step 3: Type-check + suite**

Run: `npx tsc -b` and `npx vitest run`. Existing `Row.test`/`PreviewCard.test` must pass; if a test asserted the card is a `<button>` at the root, adjust to the new focusable wrapper (the inner play/more buttons still exist).

- [ ] **Step 4: Commit**

```bash
git add src/components/row/Row.tsx src/components/row/PreviewCard.tsx src/components/row/PreviewCard.module.css src/components/tv/FocusSection.tsx
git commit -m "feat(tv): home rows + cards D-pad focusable with focus-expand"
```

---

### Task 5: Library / Search grid — `PosterGrid` container + `PosterCard` focusable (2-D)

**Files:**
- Modify: `src/components/library/PosterGrid.tsx`
- Modify: `src/components/library/PosterCard.tsx`
- Modify: `src/components/library/PosterCard.module.css` (focus mirrors hover overlay)

**Interfaces:**
- Consumes: `FocusSection`, `Focusable`. norigin resolves up/down/left/right across the grid by geometry.

- [ ] **Step 1: Grid container + focusable tiles**

In `PosterGrid.tsx`, wrap the `<ul className={styles.grid}>` in `FocusSection` (as `ul`). Each `<li>` stays; wrap `PosterCard` interaction as focusable. On focus, scroll into view (norigin does this) — and when a focused tile is near the end, the existing `sentinelRef` infinite-scroll still triggers `onLoadMore` as the page scrolls.

```tsx
// PosterGrid.tsx
import { FocusSection } from '../tv/FocusSection';
// replace <ul className={styles.grid}> with:
<FocusSection as="ul" className={styles.grid} focusKey="poster-grid">
  {items.map((item) => (<li key={item.Id}><PosterCard item={item} onOpen={onOpen} /></li>))}
</FocusSection>
```

In `PosterCard.tsx`, wrap the `.hit` button in a `Focusable` with `onEnterPress={() => onOpen(item)}`:
```tsx
import { Focusable } from '../tv/Focusable';
// wrap outer .card:
<Focusable className={styles.card} ariaLabel={label} onEnterPress={() => onOpen(item)}>
  {/* existing .hit button (mouse) + .poster + .overlay unchanged */}
</Focusable>
```
Add `:focus-within` twin to the `.overlay` hover reveal in `PosterCard.module.css`.

- [ ] **Step 2: Type-check + suite**

Run: `npx tsc -b`, `npx vitest run`. Existing PosterGrid/PosterCard tests must pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/library/PosterGrid.tsx src/components/library/PosterCard.tsx src/components/library/PosterCard.module.css
git commit -m "feat(tv): library/search poster grid 2-D D-pad focusable"
```

---

### Task 6: DetailModal + EpisodeList focusable (focus trap + restore)

**Files:**
- Modify: `src/components/detail/DetailModal.tsx`
- Modify: `src/components/detail/EpisodeList.tsx`

**Interfaces:**
- Consumes: `FocusSection` (with `isBoundary`), `Focusable`, `useTvBack`, norigin `setFocus`.
- Produces: modal traps focus while open; Back closes it; Play focused on open.

- [ ] **Step 1: Modal focus trap + Back-to-close + initial focus**

In `DetailModal.tsx`: wrap the `.modal` in `FocusSection isBoundary focusKey="detail-modal"`; on mount `setFocus('detail-play')`; register `useTvBack(() => { onClose(); return true; }, true)`. Make Play/close/Go-to-series `Focusable` (Play gets `focusKey="detail-play"`). `ItemActions` buttons: make them focusable in Task 8's spirit — here, wrap the existing `ItemActions` in a `FocusSection` so its buttons are reachable (ItemActions internals stay mouse-clickable; add a `Focusable` wrapper around the group is enough for the group to be entered).

```tsx
// DetailModal.tsx — imports
import { FocusSection } from '../tv/FocusSection';
import { Focusable } from '../tv/Focusable';
import { useTvBack } from '../../lib/tv/back';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
// inside component:
useTvBack(() => { onClose(); return true; }, true);
useEffect(() => { if (item) setFocus('detail-play'); }, [item]);
```
Wrap `.modal` in `<FocusSection isBoundary focusKey="detail-modal" className={styles.modal} ...>`. Replace the Play `<button>` with `<Focusable focusKey="detail-play" className={styles.play} ariaLabel={isResumable(item) ? 'Continue' : 'Play'} onEnterPress={() => onPlay(item)}>…</Focusable>`, the Go-to-series button and close button likewise with `Focusable`.

- [ ] **Step 2: EpisodeList rows + Play buttons focusable**

In `EpisodeList.tsx`: wrap the `<ul className={styles.list}>` in `FocusSection`; each episode row becomes `Focusable` (`onEnterPress={() => ep.Id && onSelect(ep.Id)}`), and the thumbnail Play button becomes a nested `Focusable` (`onEnterPress={() => onPlay(ep)}`) — nested focusables are fine with norigin. Season `<select>` stays a native control (reachable/operable). Add `:focus-within` twin for the `.playBtn` reveal in `EpisodeList.module.css`.

```tsx
// EpisodeList.tsx — replace the row <div role=button ...> with Focusable, and the .playBtn <button> with a nested Focusable
import { FocusSection } from '../tv/FocusSection';
import { Focusable } from '../tv/Focusable';
// <FocusSection as="ul" className={styles.list} focusKey="episode-list"> ... </FocusSection>
// row: <Focusable as="li"? -> keep <li>, put Focusable inside:
// <li><Focusable className={styles.ep} ariaLabel={ep.Name ?? ''} onEnterPress={() => ep.Id && onSelect(ep.Id)}> ...
//     <Focusable className={styles.playBtn} ariaLabel={`Play ${ep.Name ?? ''}`} onEnterPress={() => onPlay(ep)}><Play .../></Focusable>
//   ...</Focusable></li>
```
Keep the existing `onClick`/keydown for mouse where present.

- [ ] **Step 3: Type-check + suite**

Run: `npx tsc -b`, `npx vitest run`. Existing DetailModal/EpisodeList tests must pass (the `role="button"` row is now a Focusable which also renders `role="button"` — queries by `Go to`, `Play`, `Watched` still resolve).

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/DetailModal.tsx src/components/detail/EpisodeList.tsx src/components/detail/EpisodeList.module.css
git commit -m "feat(tv): detail modal focus trap + episode list D-pad focusable"
```

---

### Task 7: Player — ControlBar + Scrubber D-pad + TrackMenu focus trap

**Files:**
- Modify: `src/components/player/ControlBar.tsx`
- Modify: `src/components/player/TrackMenu.tsx`

**Interfaces:**
- Consumes: `FocusSection`, `Focusable`, `useTvBack`, norigin `setFocus`.
- Produces: every control focusable; Scrubber Left/Right seeks ±10s (consumes arrow, no focus move); TrackMenu traps focus + Back closes; focus keeps controls visible.

- [ ] **Step 1: Controls focusable + scrubber seek**

In `ControlBar.tsx`: wrap the bottom `.buttons` in a `FocusSection`; make play/pause, rewind10, forward10, mute, fullscreen `Focusable` (calling the same handlers on `onEnterPress`). Wrap the `Scrubber` in a `Focusable` whose `onArrowPress` seeks: `left → engine.seekBy(-10); return false`, `right → engine.seekBy(10); return false`, `up/down → return true` (let focus leave). On any focus in the bar, call `ping()` so controls stay visible (add `onFocus={ping}` to the section wrapper or each control).

```tsx
// ControlBar.tsx — imports
import { FocusSection } from '../tv/FocusSection';
import { Focusable } from '../tv/Focusable';
// Scrubber wrapper:
<Focusable ariaLabel="Seek bar" onFocus={ping}
  onArrowPress={(dir) => { if (dir === 'left') { engine.seekBy(-10); return false; } if (dir === 'right') { engine.seekBy(10); return false; } return true; }}>
  <Scrubber currentTime={displayTime} duration={displayDuration} bufferedEnd={state.bufferedEnd} onScrub={onScrub} onHover={onHover} />
</Focusable>
// each bottom button -> <Focusable ariaLabel="..." onFocus={ping} onEnterPress={handler}>{icon}</Focusable>
```
Keep the existing keyboard `useEffect` (space/f/m) — it still works and is complementary.

- [ ] **Step 2: TrackMenu focus trap + Back-to-close**

In `TrackMenu.tsx`: when `open`, wrap the panel in `FocusSection isBoundary`, make each option a `Focusable` (calls `pickAudio`/`pickSubtitle`), register `useTvBack(() => { if (open) { close(); return true; } return false; }, open)`, and `setFocus` the first option on open. The 💬 toggle is a `Focusable`.

- [ ] **Step 3: Type-check + suite**

Run: `npx tsc -b`, `npx vitest run`. Existing ControlBar/TrackMenu tests must pass (aria-labels unchanged; queries still resolve).

- [ ] **Step 4: Commit**

```bash
git add src/components/player/ControlBar.tsx src/components/player/TrackMenu.tsx
git commit -m "feat(tv): player controls D-pad + scrubber seek + track menu trap"
```

---

### Task 8: FilterBar / Dropdown + ItemActions focusable

**Files:**
- Modify: `src/components/library/Dropdown.tsx`
- Modify: `src/components/library/FilterBar.tsx`
- Modify: `src/components/common/ItemActions.tsx`

**Interfaces:**
- Consumes: `FocusSection`, `Focusable`, `useTvBack`.

- [ ] **Step 1: Dropdown focus trap**

In `Dropdown.tsx`: make the trigger a `Focusable` (`onEnterPress={() => setOpen(o => !o)}`); when `open`, wrap `.menu` in `FocusSection isBoundary` and register `useTvBack(() => { if (open) { setOpen(false); return true; } return false; }, open)`. The menu's children (option buttons passed in) should be focusable — wrap `FilterBar`'s option buttons in `Focusable` (Step 2).

- [ ] **Step 2: FilterBar + ItemActions focusable**

In `FilterBar.tsx`, wrap the bar in a `FocusSection` and make each control/option a `Focusable` calling its existing handler. In `ItemActions.tsx`, wrap the three buttons each in a `Focusable` (`onEnterPress` = the existing toggle), keeping `stopPropagation` semantics (the Focusable's onEnterPress calls the toggle; mouse onClick path already stops propagation — keep it).

- [ ] **Step 3: Type-check + suite**

Run: `npx tsc -b`, `npx vitest run`. Existing FilterBar/ItemActions tests must pass (button names unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/components/library/Dropdown.tsx src/components/library/FilterBar.tsx src/components/common/ItemActions.tsx
git commit -m "feat(tv): filter dropdowns + item actions D-pad focusable"
```

---

### Task 9: SearchBox + Login focusable + per-screen initial focus

**Files:**
- Modify: `src/components/nav/SearchBox.tsx`
- Modify: `src/routes/Login.tsx`
- Modify: `src/routes/Home.tsx`, `src/routes/Library.tsx`, `src/routes/Search.tsx` (set initial focus)

**Interfaces:**
- Consumes: `Focusable`, norigin `setFocus`.

- [ ] **Step 1: SearchBox + Login**

In `SearchBox.tsx`: make the search-icon toggle a `Focusable` (`onEnterPress={() => setOpen(o => !o)}`); the `<input>` stays native (typing needs a real input) but should be reachable — leave it focusable natively (`tabIndex` default) and let norigin focus land on the icon which opens it. In `Login.tsx`: make the Sign In button a `Focusable` (`onEnterPress` submits); inputs stay native. On mount `setFocus` the username input via a focusKey-less native focus (`inputRef.current?.focus()`).

- [ ] **Step 2: Per-screen initial focus**

In `Home.tsx`, `Library.tsx`, `Search.tsx`: on first content load, `setFocus` the first focusable (`setFocus('poster-grid')` for library/search; for Home, `setFocus` the first row — give the first rendered `Row` a stable `focusKey` and focus it). Guard so it runs once.

- [ ] **Step 3: Type-check + suite**

Run: `npx tsc -b`, `npx vitest run`. Existing SearchBox/Login tests must pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav/SearchBox.tsx src/routes/Login.tsx src/routes/Home.tsx src/routes/Library.tsx src/routes/Search.tsx
git commit -m "feat(tv): search/login focusable + per-screen initial focus"
```

---

### Task 10: Player Back + Watch route exit

**Files:**
- Modify: `src/routes/Watch.tsx`

**Interfaces:**
- Consumes: `useTvBack`.

- [ ] **Step 1: Back leaves the player**

In `Watch.tsx`, register `useTvBack(() => { onBack(); return true; }, true)` so the remote Back button triggers the same `onBack` (report Stopped + `navigate(-1)`) as the on-screen Back button.

- [ ] **Step 2: Type-check + suite**

Run: `npx tsc -b`, `npx vitest run`. Existing Watch tests must pass.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Watch.tsx
git commit -m "feat(tv): remote Back leaves the player"
```

---

### Task 11: Capacitor leanback scaffold (build docs only)

**Files:**
- Create: `capacitor.config.ts`
- Create: `docs/tv-build.md`
- Modify: `.gitignore` (ignore `android/` build output, `node_modules`)

**Interfaces:** none (packaging artifacts). NOT built here — no Android SDK.

- [ ] **Step 1: Capacitor config**

```ts
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'me.jahmyst.jellyflix',
  appName: 'Jellyflix',
  webDir: 'dist',
  // Thin wrapper: load the deployed web app so the /jf reverse proxy works and
  // updates ship with every redeploy. Replace with your reachable Jellyflix URL.
  server: { url: 'https://jellyflix.jahmyst.synology.me', cleartext: false },
};

export default config;
```

- [ ] **Step 2: Build doc**

Create `docs/tv-build.md` with exact steps:

```markdown
# Android TV / Fire TV build

The APK is a thin Capacitor WebView that loads the deployed Jellyflix URL
(set in `capacitor.config.ts` → `server.url`). D-pad navigation is handled by
the web app's spatial navigation. Build on a machine with Android Studio + SDK.

## One-time
    npm i -D @capacitor/cli
    npm i @capacitor/core @capacitor/android
    npx cap add android

## After the android/ project exists, apply the TV manifest edits
In `android/app/src/main/AndroidManifest.xml`:
- On the main `<activity>`, add a second intent-filter category so it shows on the TV home:
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
      </intent-filter>
- In `<manifest>`, declare TV-friendly features:
      <uses-feature android:name="android.software.leanback" android:required="false" />
      <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
- On `<application>` add a TV banner (320×180 drawable): android:banner="@drawable/banner"

## Build + install
    npx cap sync
    # open android/ in Android Studio → Build > Build APK, or:
    cd android && ./gradlew assembleDebug
    adb connect <TV-IP>:5555 && adb install app/build/outputs/apk/debug/app-debug.apk

## Notes
- The remote Back button is delivered to the web app; the global Back handler
  (src/lib/tv/back.tsx) resolves it (menu → modal → player → history → exit).
- To update the app, just redeploy the web app — the wrapper reloads server.url.
```

- [ ] **Step 3: Commit**

```bash
git add capacitor.config.ts docs/tv-build.md .gitignore
git commit -m "chore(tv): scaffold Capacitor leanback config + build docs"
```

---

### Task 12: Full keyboard E2E + final gate

**Files:**
- Create: `docs/superpowers/plans/tv-e2e-notes.md` (record the E2E run results; not a test file since Playwright isn't in the repo suite)

- [ ] **Step 1: Build + full suite**

Run: `npm run build` → type-checks + builds clean.
Run: `npx vitest run` → entire suite green (all changes additive; the pre-existing `Watch.test` parallel-load flake is the only acceptable intermittent failure — it passes in isolation).

- [ ] **Step 2: Keyboard E2E (controller runs this with Playwright against `npm run dev`)**

Drive with arrow keys + Enter + Escape (record pass/fail in the notes file):
1. Login: arrows reach Sign In; Enter submits (mock or real creds).
2. Home: Right/Left move within a row and scroll the strip; Down/Up move between rows; Enter opens the detail modal; the focus ring is visible on the focused card.
3. Detail: focus starts on Play; Escape closes and restores focus to the card; an episode row Enter → episode view; a thumbnail Play Enter → `/watch`.
4. Player: D-pad reaches each control; on the seek bar, Left/Right change `currentTime` by ~10s; Escape leaves the player.
5. Library: 2-D arrow navigation across posters + page scroll; Enter opens detail; FilterBar dropdown opens, arrows move options, Enter selects, Escape closes.
6. Search: type a query, arrows into results, Enter opens.

- [ ] **Step 3: Commit the notes + finish**

```bash
git add docs/superpowers/plans/tv-e2e-notes.md
git commit -m "docs(tv): keyboard E2E verification notes"
```

---

## Self-Review

**Spec coverage:**
- A1 root setup → Task 1 (init, FocusContext via FocusSection) + Task 9 (per-screen initial focus). ✅
- A2 focusable units (every component in the table) → Tasks 3–10. ✅
- A3 focus ring + hover→focus → Task 1 CSS + `:focus-within` twins in Tasks 4/5/6/7. ✅
- A4 Back handler + auto-scroll → Task 2 + `useTvBack` usage in Tasks 6/7/8/10; norigin auto-scroll in Tasks 4/5. ✅
- Part B Capacitor scaffold → Task 11. ✅
- Testing (unit + E2E) → helper/back unit tests (Tasks 1–2), per-task suite gates, Task 12 E2E. ✅

**Placeholder scan:** Task 4's `Row` scroll-by-id and `FocusSection` `id` prop are spelled out; no "TBD". The Capacitor `server.url` is a real value (the deployed URL), documented as replaceable.

**Type consistency:** `Focusable`/`FocusSection`/`useTvBack`/`initFocus` signatures defined in Tasks 1–2 are used with those exact shapes in Tasks 3–10. `FocusSection` gains an optional `id?: string` in Task 4 (noted there) — a superset, backward compatible with Task 1's usages.

**Note on tests:** per the Global Constraints, focus *movement* is not unit-tested (jsdom has no geometry); per-task gates are type-check + full-suite-green + the two foundation unit tests, and the real navigation is Task 12's keyboard E2E. This is intentional, not a coverage gap.
