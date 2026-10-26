import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@lc/shared';
import { Skeleton } from '@/components/ui/skeleton';
import ForbiddenPage from '@/features/errors/forbidden-page';
import { useAuth } from './use-auth';

export function FullPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col gap-4 p-6" role="status" aria-label="Đang tải">
      <Skeleton className="h-14 w-full" />
      <div className="flex flex-1 gap-4">
        <Skeleton className="hidden w-60 md:block" />
        <Skeleton className="flex-1" />
      </div>
    </div>
  );
}

/**
 * Layout guard for everything behind login. Anonymous users go to /login (remembering where
 * they were headed); users who must change their password can reach /change-password only.
 */
export function RequireAuth() {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSkeleton />;
  if (!user) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

/** Route guard: renders the 403 page unless the signed-in role is allowed. */
export function RequireRole({ roles, children }: { roles: Role[]; children?: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <ForbiddenPage />;
  return <>{children ?? <Outlet />}</>;
}
