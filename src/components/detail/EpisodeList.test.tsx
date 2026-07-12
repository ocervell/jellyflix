import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { initFocus } from '../../lib/tv/focus';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getCardImageUrl: () => null }));
vi.mock('../../hooks/api/useSeasons', () => ({ useSeasons: () => ({ data: [{ Id: 's1', Name: 'Season 1' }] }) }));
vi.mock('../../hooks/api/useEpisodes', () => ({
  useEpisodes: () => ({ data: [{ Id: 'e1', Name: 'Pilot', IndexNumber: 1 } as BaseItemDto] }),
}));

import EpisodeList from './EpisodeList';

beforeAll(() => initFocus());

test('clicking the episode play button plays it without selecting the row', async () => {
  const onPlay = vi.fn();
  const onSelect = vi.fn();
  render(<EpisodeList seriesId="ser1" onPlay={onPlay} onSelect={onSelect} />);

  await userEvent.click(screen.getByRole('button', { name: 'Play Pilot' }));

  expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ Id: 'e1' }));
  expect(onSelect).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'Pilot' }));
  expect(onSelect).toHaveBeenCalledWith('e1');
});
