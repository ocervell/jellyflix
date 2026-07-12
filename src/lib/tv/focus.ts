import { init } from '@noriginmedia/norigin-spatial-navigation';

let started = false;
/** Initialise spatial navigation once. Arrow keys move focus; Enter/OK activates. */
export function initFocus(): void {
  if (started) return;
  started = true;
  // shouldFocusDOMNode: real DOM focus follows virtual focus, so `:focus-within` CSS
  // (card hover-expand mirrors) works and the browser auto-scrolls the focused node into view.
  init({ debug: false, visualDebug: false, shouldFocusDOMNode: true });
}
