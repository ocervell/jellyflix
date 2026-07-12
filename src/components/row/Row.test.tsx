import { render, screen } from '@testing-library/react';
import { beforeAll, expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { initFocus } from '../../lib/tv/focus';

vi.mock('./PreviewCard', () => ({ default: ({ item }: { item: BaseItemDto }) => <div>{item.Name}</div> }));
import Row from './Row';

beforeAll(() => initFocus());

test('renders title and items', () => {
  const items = [{ Id: '1', Name: 'A' }, { Id: '2', Name: 'B' }] as BaseItemDto[];
  render(<Row title="Latest" items={items} onOpen={() => {}} onPlay={() => {}} />);
  expect(screen.getByRole('heading', { name: 'Latest' })).toBeInTheDocument();
  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.getByText('B')).toBeInTheDocument();
});

test('renders nothing when empty', () => {
  const { container } = render(<Row title="Empty" items={[]} onOpen={() => {}} onPlay={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});
