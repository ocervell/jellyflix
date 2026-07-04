import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getCardImageUrl: () => 'http://img' }));

import PreviewCard from './PreviewCard';

const item = { Id: 'x', Name: 'Fanboys', ProductionYear: 2009, RunTimeTicks: 5880 * 10_000_000 } as BaseItemDto;

test('play button fires onPlay', async () => {
  const onPlay = vi.fn();
  render(<PreviewCard item={item} onOpen={() => {}} onPlay={onPlay} />);
  await userEvent.click(screen.getByRole('button', { name: /^play/i }));
  expect(onPlay).toHaveBeenCalledWith(item);
});
