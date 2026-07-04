import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from './components/common/RequireAuth';
import { ApiProvider } from './hooks/useApi';

test('unauthenticated user is redirected from guarded route', () => {
  localStorage.clear();
  render(
    <ApiProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div>login-page</div>} />
          <Route path="/" element={<RequireAuth><div>secret</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );
  expect(screen.getByText('login-page')).toBeInTheDocument();
});
