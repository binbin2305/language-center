import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Outlet, useRoutes, type RouteObject } from 'react-router-dom';
import { Role } from '@lc/shared';
import { FullPageSkeleton, RequireAuth, RequireRole } from '@/auth/require-role';
import { AuthProvider, type AuthProviderProps } from '@/auth/auth-context';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/layouts/app-shell';
import { AuthLayout } from '@/layouts/auth-layout';
import HomeRouter from '@/features/home/home-router';
import NotFoundPage from '@/features/errors/not-found-page';

/**
 * The full Wave 0 route table (DESIGN §4). Lanes edit only the page files in their own
 * `features/<m>/` folder; the route -> file -> roles map is documented in docs/DECISIONS.md.
 */
const { ADMIN, MANAGER, ACADEMIC_STAFF: STAFF, TEACHER, STUDENT } = Role;

type Page = LazyExoticComponent<ComponentType>;

interface AppRoute {
  path: string;
  page: Page;
  roles: Role[];
}

const M_S = [MANAGER, STAFF];
const M_S_T = [MANAGER, STAFF, TEACHER];
const ALL = [ADMIN, MANAGER, STAFF, TEACHER, STUDENT];

export const APP_ROUTES: AppRoute[] = [
  { path: 'notifications', roles: ALL, page: lazy(() => import('@/features/notifications/pages/notifications-page')) },

  // 4.3 Admissions
  { path: 'admissions/leads', roles: M_S, page: lazy(() => import('@/features/admissions/pages/leads-page')) },
  { path: 'admissions/leads/new', roles: M_S, page: lazy(() => import('@/features/admissions/pages/lead-form-page')) },
  { path: 'admissions/leads/:id', roles: M_S, page: lazy(() => import('@/features/admissions/pages/lead-detail-page')) },
  { path: 'admissions/placement', roles: M_S_T, page: lazy(() => import('@/features/admissions/pages/placement-page')) },
  { path: 'admissions/placement/:id', roles: M_S_T, page: lazy(() => import('@/features/admissions/pages/placement-detail-page')) },
  { path: 'admissions/placement/:id/grade', roles: [TEACHER], page: lazy(() => import('@/features/admissions/pages/placement-grade-page')) },

  // 4.4 Students
  { path: 'students', roles: M_S_T, page: lazy(() => import('@/features/students/pages/students-page')) },
  { path: 'students/:id', roles: M_S_T, page: lazy(() => import('@/features/students/pages/student-detail-page')) },
  { path: 'me/profile', roles: [STUDENT], page: lazy(() => import('@/features/students/pages/my-profile-page')) },

  // 4.5 Classes & enrollments
  { path: 'classes', roles: M_S_T, page: lazy(() => import('@/features/classes/pages/classes-page')) },
  { path: 'classes/:id', roles: M_S_T, page: lazy(() => import('@/features/classes/pages/class-detail-page')) },
  { path: 'enrollments/waiting', roles: M_S, page: lazy(() => import('@/features/enrollments/pages/waiting-list-page')) },
  { path: 'me/classes', roles: [STUDENT], page: lazy(() => import('@/features/enrollments/pages/my-classes-page')) },

  // 4.6 Schedule
  { path: 'schedule', roles: [...M_S_T, STUDENT], page: lazy(() => import('@/features/schedule/pages/schedule-page')) },

  // 4.7 Attendance
  { path: 'sessions/:id/attendance', roles: M_S_T, page: lazy(() => import('@/features/attendance/pages/take-attendance-page')) },
  { path: 'attendance', roles: M_S_T, page: lazy(() => import('@/features/attendance/pages/attendance-history-page')) },
  { path: 'me/attendance', roles: [STUDENT], page: lazy(() => import('@/features/attendance/pages/my-attendance-page')) },

  // 4.8 Grades
  { path: 'assessments/:id/grades', roles: M_S_T, page: lazy(() => import('@/features/grades/pages/grade-entry-page')) },
  { path: 'results', roles: M_S_T, page: lazy(() => import('@/features/grades/pages/results-page')) },
  { path: 'me/results', roles: [STUDENT], page: lazy(() => import('@/features/grades/pages/my-results-page')) },

  // 4.9 Fees
  { path: 'fees', roles: M_S_T, page: lazy(() => import('@/features/fees/pages/fees-page')) },
  { path: 'fees/invoices/:id', roles: M_S, page: lazy(() => import('@/features/fees/pages/invoice-detail-page')) },
  { path: 'fees/discounts', roles: [MANAGER], page: lazy(() => import('@/features/fees/pages/discounts-page')) },
  { path: 'me/fees', roles: [STUDENT], page: lazy(() => import('@/features/fees/pages/my-fees-page')) },

  // 4.10 Reports
  { path: 'reports', roles: M_S, page: lazy(() => import('@/features/reports/pages/reports-page')) },

  // 4.11 Catalog & administration
  { path: 'settings/courses', roles: M_S, page: lazy(() => import('@/features/courses/pages/courses-page')) },
  { path: 'settings/rooms', roles: M_S, page: lazy(() => import('@/features/rooms/pages/rooms-page')) },
  { path: 'settings/users', roles: [ADMIN, MANAGER], page: lazy(() => import('@/features/users/pages/users-page')) },
  { path: 'settings/center', roles: [MANAGER], page: lazy(() => import('@/features/settings/pages/center-settings-page')) },
];

const LoginPage = lazy(() => import('@/features/auth/pages/login-page'));
const ChangePasswordPage = lazy(() => import('@/features/auth/pages/change-password-page'));

function Root({ auth }: { auth?: Omit<AuthProviderProps, 'children'> }) {
  return (
    <AuthProvider {...auth}>
      <Suspense fallback={<FullPageSkeleton />}>
        <Outlet />
      </Suspense>
      <Toaster />
    </AuthProvider>
  );
}

export function createRoutes(auth?: Omit<AuthProviderProps, 'children'>): RouteObject[] {
  return [
    {
      element: <Root auth={auth} />,
      children: [
        {
          element: <AuthLayout />,
          children: [{ path: '/login', element: <LoginPage /> }],
        },
        {
          element: <RequireAuth />,
          children: [
            {
              element: <AuthLayout />,
              children: [{ path: '/change-password', element: <ChangePasswordPage /> }],
            },
            {
              element: <AppShell />,
              children: [
                { index: true, element: <HomeRouter /> },
                ...APP_ROUTES.map(({ path, page: Page, roles }) => ({
                  path,
                  element: (
                    <RequireRole roles={roles}>
                      <Page />
                    </RequireRole>
                  ),
                })),
                { path: '*', element: <NotFoundPage /> },
              ],
            },
          ],
        },
      ],
    },
  ];
}

/** Declarative (non data-router) setup: no loaders are needed and it behaves identically in jsdom tests. */
export function AppRoutes({ auth }: { auth?: Omit<AuthProviderProps, 'children'> }) {
  return useRoutes(createRoutes(auth));
}
