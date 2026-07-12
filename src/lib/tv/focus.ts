import { init } from '@noriginmedia/norigin-spatial-navigation';

let started = false;
/** Initialise spatial navigation once. Arrow keys move focus; Enter/OK activates. */
export function initFocus(): void {
  if (started) return;
  started = true;
  init({ debug: false, visualDebug: false });
}
