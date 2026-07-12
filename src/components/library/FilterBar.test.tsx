import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, expect, test, vi } from 'vitest';
import FilterBar from './FilterBar';
import { DEFAULT_QUERY } from '../../lib/library/query';
import { initFocus } from '../../lib/tv/focus';

beforeAll(() => initFocus());

test('changing sort and toggling a genre call onChange with updated query', async () => {
  const onChange = vi.fn();
  render(<FilterBar query={DEFAULT_QUERY} genres={['Action', 'Drame']} decades={[2010, 2000]} total={974} onChange={onChange} />);
  expect(screen.getByText(/974/)).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText(/sort by/i, { selector: 'select' }), 'year');
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_QUERY, sort: 'year' });
  // open Genre dropdown and toggle Action
  await userEvent.click(screen.getByRole('button', { name: /genre/i }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Action' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_QUERY, genres: ['Action'] });
});

test('status segmented control and clear', async () => {
  const onChange = vi.fn();
  render(<FilterBar query={{ ...DEFAULT_QUERY, status: 'unplayed', genres: ['Action'] }} genres={['Action']} decades={[]} total={5} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: /^played$/i }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'played' }));
  await userEvent.click(screen.getByRole('button', { name: /clear/i }));
  expect(onChange).toHaveBeenCalledWith(DEFAULT_QUERY);
});

const genres = ['Action', 'Drama'];
const decades = [2010, 2000];

test('renders Genre and Decade dropdowns by default', () => {
  render(<FilterBar query={DEFAULT_QUERY} genres={genres} decades={decades} total={3} onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: /genre/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /decade/i })).toBeInTheDocument();
});

test('facets=false hides Genre and Decade but keeps sort + status', () => {
  render(<FilterBar query={DEFAULT_QUERY} genres={genres} decades={decades} total={3} facets={false} onChange={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /genre/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /decade/i })).not.toBeInTheDocument();
  expect(screen.getByLabelText(/sort by/i, { selector: 'select' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^unplayed$/i })).toBeInTheDocument();
});
