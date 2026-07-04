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
