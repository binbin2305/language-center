import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Role } from '@lc/shared';

/**
 * Tab slot registries (Lead-owned). A lane implements ONLY the tab component in its own
 * feature folder; keys, labels, roles and order are changed through a contract request.
 * Tab components read the route id with `useParams()` (`id` = class / student id).
 */
export interface TabSlot {
  key: string;
  label: string;
  roles: Role[];
  component: LazyExoticComponent<ComponentType>;
}

const { MANAGER, ACADEMIC_STAFF, TEACHER } = Role;
const STAFF = [MANAGER, ACADEMIC_STAFF];

/** `/classes/:id` — DESIGN §4.5. */
export const CLASS_TABS: TabSlot[] = [
  {
    key: 'students',
    label: 'Học viên',
    roles: [...STAFF, TEACHER],
    component: lazy(() => import('@/features/classes/components/class-students-tab')),
  },
  {
    key: 'schedule',
    label: 'Lịch học',
    roles: [...STAFF, TEACHER],
    component: lazy(() => import('@/features/schedule/components/class-schedule-tab')),
  },
  {
    key: 'attendance',
    label: 'Điểm danh',
    roles: [...STAFF, TEACHER],
    component: lazy(() => import('@/features/attendance/components/class-attendance-tab')),
  },
  {
    key: 'assessments',
    label: 'Bài đánh giá & điểm',
    roles: [...STAFF, TEACHER],
    component: lazy(() => import('@/features/grades/components/class-assessments-tab')),
  },
  {
    key: 'fees',
    label: 'Học phí lớp',
    roles: STAFF,
    component: lazy(() => import('@/features/fees/components/class-fees-tab')),
  },
];

/** `/students/:id` — DESIGN §4.4. Teachers see info (reduced), attendance and results only. */
export const STUDENT_TABS: TabSlot[] = [
  {
    key: 'info',
    label: 'Thông tin',
    roles: [...STAFF, TEACHER],
    component: lazy(() => import('@/features/students/components/student-info-tab')),
  },
  {
    key: 'enrollments',
    label: 'Khóa học & lớp',
    roles: STAFF,
    component: lazy(() => import('@/features/enrollments/components/student-enrollments-tab')),
  },
  {
    key: 'attendance',
    label: 'Chuyên cần',
    roles: [...STAFF, TEACHER],
    component: lazy(() => import('@/features/attendance/components/student-attendance-tab')),
  },
  {
    key: 'results',
    label: 'Kết quả',
    roles: [...STAFF, TEACHER],
    component: lazy(() => import('@/features/grades/components/student-results-tab')),
  },
  {
    key: 'fees',
    label: 'Học phí',
    roles: STAFF,
    component: lazy(() => import('@/features/fees/components/student-fees-tab')),
  },
  {
    key: 'documents',
    label: 'Giấy tờ',
    roles: STAFF,
    component: lazy(() => import('@/features/students/components/student-documents-tab')),
  },
  {
    key: 'audit',
    label: 'Lịch sử thay đổi',
    roles: STAFF,
    component: lazy(() => import('@/features/students/components/student-audit-tab')),
  },
];

