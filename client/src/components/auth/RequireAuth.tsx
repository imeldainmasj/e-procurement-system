import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { bootstrapSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="loading loading-spinner loading-lg text-primary" aria-label="Memuat" />
    </div>
  );
}

/** Restores the session on first load and redirects anonymous users to /login. */
export function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  useEffect(() => {
    void bootstrapSession();
  }, []);

  if (status === 'idle' || status === 'loading') return <FullScreenLoader />;
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Sends already-signed-in users away from /login. */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    void bootstrapSession();
  }, []);

  if (status === 'idle' || status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}
