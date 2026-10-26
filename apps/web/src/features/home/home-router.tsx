import { Suspense, lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { Role } from '@lc/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/auth/use-auth';

const StaffDashboard = lazy(() => import('@/features/dashboard/pages/staff-dashboard'));
const TeacherHome = lazy(() => import('@/features/home/pages/teacher-home'));
const StudentHome = lazy(() => import('@/features/home/pages/student-home'));

/** `/` by role (ARCHITECTURE §5): M/S dashboard, T teacher home, H student home, ADMIN accounts. */
export default function HomeRouter() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === Role.ADMIN) return <Navigate to="/settings/users" replace />;
  const Page =
    user.role === Role.TEACHER ? TeacherHome : user.role === Role.STUDENT ? StudentHome : StaffDashboard;
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <Page />
    </Suspense>
  );
}
