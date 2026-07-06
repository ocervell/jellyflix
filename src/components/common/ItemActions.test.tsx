import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi, beforeEach } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

const toggleWatchlist = vi.fn();
const toggleFav = vi.fn();
const toggleWatched = vi.fn();
let membership = new Set<string>();
vi.mock('../../hooks/api/useToggleWatchlist', () => ({ useToggleWatchlist: () => toggleWatchlist }));
vi.mock('../../hooks/api/useWatchlist', () => ({ useWatchlist: () => ({ membership }) }));
vi.mock('../../hooks/api/useItemActions', () => ({ useToggleFavorite: () => toggleFav, useToggleWatched: () => toggleWatched }));
import ItemActions from './ItemActions';

beforeEach(() => { toggleWatchlist.mockReset(); toggleFav.mockReset(); toggleWatched.mockReset(); membership = new Set(); });

test('renders three buttons; not-saved shows Save-for-later and toggles it, stopping propagation', () => {
  const item = { Id: 'x', UserData: { IsFavorite: false, Played: false } } as BaseItemDto;
  const onParent = vi.fn();
  render(<div onClick={onParent}><ItemActions item={item} /></div>);
  expect(screen.getByRole('button', { name: /save for later/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add to favorites/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /mark watched/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /save for later/i }));
  expect(toggleWatchlist).toHaveBeenCalledWith(item);
  expect(onParent).not.toHaveBeenCalled(); // stopPropagation
});

test('reflects saved + favorite state and toggles favorite/watched', () => {
  membership = new Set(['x']);
  const item = { Id: 'x', UserData: { IsFavorite: true, Played: false } } as BaseItemDto;
  render(<ItemActions item={item} />);
  expect(screen.getByRole('button', { name: /remove from saved for later/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /remove from favorites/i }));
  expect(toggleFav).toHaveBeenCalledWith(item);
  fireEvent.click(screen.getByRole('button', { name: /mark watched/i }));
  expect(toggleWatched).toHaveBeenCalledWith(item);
});
