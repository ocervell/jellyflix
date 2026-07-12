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
