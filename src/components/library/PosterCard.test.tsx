import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getPosterUrl: () => 'http://img/p.jpg' }));
vi.mock('../common/ItemActions', () => ({ default: () => <div>item actions</div> }));
import PosterCard from './PosterCard';

const item = { Id: 'x', Name: 'Fanboys', ProductionYear: 2009, UserData: { PlayedPercentage: 40 } } as BaseItemDto;

test('renders poster, title, year and fires onOpen', async () => {
  const onOpen = vi.fn();
  render(<PosterCard item={item} onOpen={onOpen} />);
  expect(screen.getByRole('img', { name: /fanboys/i })).toBeInTheDocument();
  expect(screen.getByText('Fanboys')).toBeInTheDocument();
  expect(screen.getByText('2009')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /fanboys/i }));
  expect(onOpen).toHaveBeenCalledWith(item);
});
