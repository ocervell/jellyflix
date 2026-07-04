import { createHashRouter } from 'react-router-dom';
import Login from './routes/Login';
import Home from './routes/Home';
import RequireAuth from './components/common/RequireAuth';

export const router = createHashRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: <RequireAuth><Home /></RequireAuth> },
]);
