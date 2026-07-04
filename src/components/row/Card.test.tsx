import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getCardImageUrl: () => 'http://img/x.jpg' }));

import Card from './Card';

const item = { Id: 'x', Name: 'Fanboys', UserData: { PlayedPercentage: 40 } } as BaseItemDto;

test('renders card image and fires onOpen', async () => {
  const onOpen = vi.fn();
  render(<Card item={item} onOpen={onOpen} />);
  expect(screen.getByRole('img', { name: /fanboys/i })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /fanboys/i }));
  expect(onOpen).toHaveBeenCalledWith(item);
});
