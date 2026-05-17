import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';

export function PrivateRoute({ children }) {
  const isAuth = useAuthStore(s => s.isAuth);
  if (!isAuth) return <Navigate to="/login" replace />;
  return children;
}
