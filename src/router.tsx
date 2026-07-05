import { createHashRouter } from 'react-router-dom';
import Login from './routes/Login';
import Home from './routes/Home';
import Watch from './routes/Watch';
import Library from './routes/Library';
import Search from './routes/Search';
import RequireAuth from './components/common/RequireAuth';

export const router = createHashRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: <RequireAuth><Home /></RequireAuth> },
  { path: '/library/:viewId', element: <RequireAuth><Library /></RequireAuth> },
  { path: '/search', element: <RequireAuth><Search /></RequireAuth> },
  { path: '/watch/:itemId', element: <RequireAuth><Watch /></RequireAuth> },
]);
