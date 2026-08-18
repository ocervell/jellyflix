import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ api: {}, session: { userId: 'u' } }) }));
// Mirror the real helper: a backdrop URL only when the item carries its own or a
// parent (series) backdrop tag.
vi.mock('../../lib/jellyfin/images', () => ({
  getBackdropUrl: (_api: unknown, it: BaseItemDto) =>
    it.BackdropImageTags?.length || it.ParentBackdropImageTags?.length ? 'http://bd' : null,
  getLogoUrl: () => null,
}));
// The full item Billboard fetches for the hero (undefined = not loaded / no id).
let fullItem: BaseItemDto | undefined;
vi.mock('../../hooks/api/useItem', () => ({ useItem: () => ({ data: fullItem }) }));

import Billboard from './Billboard';

afterEach(() => { fullItem = undefined; });

test('shows title, synopsis, and fires Play', async () => {
  const item = { Id: 'm1', Name: 'November', Overview: 'A film.' } as BaseItemDto;
  const onPlay = vi.fn();
  render(<Billboard item={item} onPlay={onPlay} onMoreInfo={() => {}} />);
  expect(screen.getByRole('heading', { name: 'November' })).toBeInTheDocument();
  expect(screen.getByText('A film.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /play/i }));
  expect(onPlay).toHaveBeenCalledWith(item);
});

test('episode hero uses the full item so the series backdrop shows', () => {
  // Resume list item for an episode: no backdrop tags of any kind.
  const listItem = { Id: 'ep1', Type: 'Episode', SeriesName: 'Electric Dreams' } as BaseItemDto;
  // Full item (what useItem returns) carries the parent/series backdrop.
  fullItem = { ...listItem, ParentBackdropItemId: 'series1', ParentBackdropImageTags: ['bd'] } as BaseItemDto;
  const { container } = render(<Billboard item={listItem} onPlay={() => {}} onMoreInfo={() => {}} />);
  expect(container.querySelector('img[src="http://bd"]')).not.toBeNull();
});

test('with no full item and no backdrop tags, no background image renders', () => {
  const listItem = { Id: 'ep1', Type: 'Episode', SeriesName: 'Electric Dreams' } as BaseItemDto;
  const { container } = render(<Billboard item={listItem} onPlay={() => {}} onMoreInfo={() => {}} />);
  expect(container.querySelector('img[src="http://bd"]')).toBeNull();
});
