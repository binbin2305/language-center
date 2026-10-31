import { Role } from './enums';

const { ADMIN, MANAGER, ACADEMIC_STAFF, TEACHER, STUDENT } = Role;

// One permission per row of PRD section 3. "S" (scoped) cells are allowed at role level;
// data scoping is enforced in services.
export const PERMISSIONS = {
  'leads.create': [MANAGER, ACADEMIC_STAFF],
  'students.create': [MANAGER, ACADEMIC_STAFF],
  'enrollments.updateCourse': [MANAGER, ACADEMIC_STAFF, STUDENT],
  'courses.manage': [MANAGER, ACADEMIC_STAFF],
  'rooms.manage': [MANAGER, ACADEMIC_STAFF],
  'placement.schedule': [MANAGER, ACADEMIC_STAFF],
  'placement.grade': [TEACHER],
  'classes.manage': [MANAGER, ACADEMIC_STAFF],
  'enrollments.assign': [MANAGER, ACADEMIC_STAFF],
  'enrollments.confirm': [STUDENT],
  'students.search': [MANAGER, TEACHER, ACADEMIC_STAFF],
  'students.viewProfile': [MANAGER, TEACHER, STUDENT, ACADEMIC_STAFF],
  'students.update': [MANAGER, ACADEMIC_STAFF],
  'sessions.manage': [MANAGER, ACADEMIC_STAFF],
  'sessions.view': [MANAGER, TEACHER, STUDENT, ACADEMIC_STAFF],
  'attendance.take': [TEACHER, ACADEMIC_STAFF],
  'attendance.viewHistory': [MANAGER, TEACHER, STUDENT, ACADEMIC_STAFF],
  'grades.enter': [TEACHER],
  'assessments.manage': [TEACHER, ACADEMIC_STAFF],
  'grades.view': [MANAGER, TEACHER, STUDENT, ACADEMIC_STAFF],
  'fees.update': [MANAGER, ACADEMIC_STAFF],
  'discounts.decide': [MANAGER],
  'payments.void': [MANAGER],
  'fees.view': [MANAGER, TEACHER, STUDENT, ACADEMIC_STAFF],
  'reports.view': [MANAGER, ACADEMIC_STAFF],
  'users.manage': [ADMIN, MANAGER],
  'settings.update': [MANAGER],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(user: { role: Role } | null, p: Permission): boolean {
  if (!user) return false;
  return (PERMISSIONS[p] as readonly Role[]).includes(user.role);
}
