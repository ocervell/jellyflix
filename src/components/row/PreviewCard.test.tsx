import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { initFocus } from '../../lib/tv/focus';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getCardImageUrl: () => 'http://img' }));
vi.mock('../common/ItemActions', () => ({ default: () => <div>item actions</div> }));

import PreviewCard from './PreviewCard';

beforeAll(() => initFocus());

const item = { Id: 'x', Name: 'Fanboys', ProductionYear: 2009, RunTimeTicks: 5880 * 10_000_000 } as BaseItemDto;

test('play button fires onPlay', async () => {
  const onPlay = vi.fn();
  render(<PreviewCard item={item} onOpen={() => {}} onPlay={onPlay} />);
  await userEvent.click(screen.getByRole('button', { name: /^play/i }));
  expect(onPlay).toHaveBeenCalledWith(item);
});

test('play button does not also fire onOpen (no click bubbling to wrapper)', async () => {
  const onPlay = vi.fn();
  const onOpen = vi.fn();
  render(<PreviewCard item={item} onOpen={onOpen} onPlay={onPlay} />);
  await userEvent.click(screen.getByRole('button', { name: /^play/i }));
  expect(onPlay).toHaveBeenCalledWith(item);
  expect(onOpen).not.toHaveBeenCalled();
});
