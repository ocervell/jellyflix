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
