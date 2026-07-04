import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getBackdropUrl: () => 'http://bd', getLogoUrl: () => null }));

import Billboard from './Billboard';

const item = { Id: 'm1', Name: 'November', Overview: 'A film.' } as BaseItemDto;

test('shows title, synopsis, and fires Play', async () => {
  const onPlay = vi.fn();
  render(<Billboard item={item} onPlay={onPlay} onMoreInfo={() => {}} />);
  expect(screen.getByRole('heading', { name: 'November' })).toBeInTheDocument();
  expect(screen.getByText('A film.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /play/i }));
  expect(onPlay).toHaveBeenCalledWith(item);
});
