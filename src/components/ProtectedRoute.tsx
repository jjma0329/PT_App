import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Wraps admin pages — redirects to /admin/login if no valid JWT is found.
// The server will also reject requests with invalid tokens (401), so this
// is just a UX guard to avoid showing a broken page before the API responds.
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}
