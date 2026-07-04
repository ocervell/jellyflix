import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('./Card', () => ({ default: ({ item }: { item: BaseItemDto }) => <div>{item.Name}</div> }));
import Row from './Row';

test('renders title and items', () => {
  const items = [{ Id: '1', Name: 'A' }, { Id: '2', Name: 'B' }] as BaseItemDto[];
  render(<Row title="Latest" items={items} onOpen={() => {}} />);
  expect(screen.getByRole('heading', { name: 'Latest' })).toBeInTheDocument();
  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.getByText('B')).toBeInTheDocument();
});

test('renders nothing when empty', () => {
  const { container } = render(<Row title="Empty" items={[]} onOpen={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});
