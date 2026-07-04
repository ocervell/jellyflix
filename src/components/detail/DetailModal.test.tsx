import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getBackdropUrl: () => 'http://bd', getLogoUrl: () => null }));
vi.mock('../../hooks/api/useItem', () => ({
  useItem: () => ({ data: { Id: 'm1', Name: 'November', Type: 'Movie', Overview: 'x', ProductionYear: 2017 } as BaseItemDto, isLoading: false }),
}));
vi.mock('./EpisodeList', () => ({ default: () => <div>episodes</div> }));

import DetailModal from './DetailModal';

test('renders movie detail and plays', async () => {
  const onPlay = vi.fn();
  render(<DetailModal itemId="m1" onClose={() => {}} onPlay={onPlay} />);
  expect(screen.getByRole('heading', { name: 'November' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /play/i }));
  expect(onPlay).toHaveBeenCalled();
});
