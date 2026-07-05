import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

const toggleFav = vi.fn(); const toggleWatched = vi.fn();
vi.mock('../../hooks/api/useItemActions', () => ({ useToggleFavorite: () => toggleFav, useToggleWatched: () => toggleWatched }));
import ItemActions from './ItemActions';

test('reflects state and toggles favorite + watched, stopping propagation', () => {
  const item = { Id: 'x', UserData: { IsFavorite: true, Played: false } } as BaseItemDto;
  const onParent = vi.fn();
  render(<div onClick={onParent}><ItemActions item={item} /></div>);
  expect(screen.getByRole('button', { name: /remove from my list/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /remove from my list/i }));
  expect(toggleFav).toHaveBeenCalledWith(item);
  fireEvent.click(screen.getByRole('button', { name: /mark watched/i }));
  expect(toggleWatched).toHaveBeenCalledWith(item);
  expect(onParent).not.toHaveBeenCalled(); // stopPropagation
});
