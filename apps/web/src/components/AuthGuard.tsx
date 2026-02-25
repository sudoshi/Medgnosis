// =============================================================================
// Medgnosis Web — Auth guard component
// Redirects to /login if not authenticated
// =============================================================================

import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.js';

export function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
