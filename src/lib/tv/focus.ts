import { init, pause, resume } from '@noriginmedia/norigin-spatial-navigation';

let started = false;
const isNativeField = (el: EventTarget | null) =>
  el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

/** Initialise spatial navigation once. Arrow keys move focus; Enter/OK activates. */
export function initFocus(): void {
  if (started) return;
  started = true;
  // shouldFocusDOMNode: real DOM focus follows virtual focus, so `:focus-within` CSS
  // (card hover-expand mirrors) works and the browser auto-scrolls the focused node into view.
  init({ debug: false, visualDebug: false, shouldFocusDOMNode: true });
  // norigin's global keydown listener preventDefault()s arrows/Enter unconditionally, which
  // breaks caret movement and native <select> operation while a form field is focused.
  // Pause spatial nav for the duration of native field focus, resume on blur.
  document.addEventListener('focusin', (e) => { if (isNativeField(e.target)) pause(); });
  document.addEventListener('focusout', (e) => { if (isNativeField(e.target)) resume(); });
}
