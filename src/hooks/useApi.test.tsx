import { render, screen } from '@testing-library/react';
import { expect, test, beforeEach } from 'vitest';
import { ApiProvider, useAuth } from './useApi';

beforeEach(() => localStorage.clear());

function AuthProbe() {
  const { session } = useAuth();
  return <div>session:{session ? session.userName : 'none'}</div>;
}

test('starts with no session', () => {
  render(<ApiProvider><AuthProbe /></ApiProvider>);
  expect(screen.getByText('session:none')).toBeInTheDocument();
});
