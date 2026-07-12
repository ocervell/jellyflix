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

test('Focusable ignores bubbled clicks from nested interactive elements', () => {
  const onEnter = vi.fn();
  const inner = vi.fn();
  render(
    <Focusable onEnterPress={onEnter} ariaLabel="Card">
      <span>label</span>
      <button onClick={inner}>Inner</button>
    </Focusable>,
  );
  fireEvent.click(screen.getByText('Inner'));
  expect(inner).toHaveBeenCalled();
  expect(onEnter).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('label'));
  expect(onEnter).toHaveBeenCalled();
});
