import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
vi.mock('../../lib/jellyfin/images', () => ({ getCardImageUrl: () => 'http://img' }));
vi.mock('../common/ItemActions', () => ({ default: () => <div>item actions</div> }));

import PreviewCard from './PreviewCard';

const item = { Id: 'x', Name: 'Fanboys', ProductionYear: 2009, RunTimeTicks: 5880 * 10_000_000 } as BaseItemDto;

test('play button fires onPlay', async () => {
  const onPlay = vi.fn();
  render(<PreviewCard item={item} onOpen={() => {}} onPlay={onPlay} />);
  await userEvent.click(screen.getByRole('button', { name: /^play/i }));
  expect(onPlay).toHaveBeenCalledWith(item);
});

test('not-started item shows the title and a year · runtime metadata row', () => {
  render(<PreviewCard item={item} onOpen={() => {}} onPlay={() => {}} />);
  expect(screen.getByText('Fanboys')).toBeInTheDocument();
  expect(screen.getByText('2009 · 1h 38m')).toBeInTheDocument();
});

test('in-progress item shows the title only (no metadata row)', () => {
  const watching = { ...item, UserData: { PlayedPercentage: 40 } } as BaseItemDto;
  render(<PreviewCard item={watching} onOpen={() => {}} onPlay={() => {}} />);
  expect(screen.getByText('Fanboys')).toBeInTheDocument();
  expect(screen.queryByText(/2009/)).not.toBeInTheDocument();
});

test('series shows a season count instead of runtime', () => {
  const series = { Id: 's', Name: 'Money Heist', Type: 'Series', ProductionYear: 2021, OfficialRating: 'A', ChildCount: 3 } as BaseItemDto;
  render(<PreviewCard item={series} onOpen={() => {}} onPlay={() => {}} />);
  expect(screen.getByText('2021 · A · 3 Seasons')).toBeInTheDocument();
});
