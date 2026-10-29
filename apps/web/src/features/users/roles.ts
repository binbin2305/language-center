import { Role } from '@lc/shared';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Quản trị hệ thống',
  MANAGER: 'Quản lý',
  ACADEMIC_STAFF: 'Giáo vụ',
  TEACHER: 'Giáo viên',
  STUDENT: 'Học viên',
};

/** Roles that POST /users accepts (ADMIN and STUDENT are rejected by the API). */
export const CREATABLE_ROLES: Role[] = [Role.TEACHER, Role.ACADEMIC_STAFF, Role.MANAGER];

/** Only teachers carry a teacher profile (languages, levels, specialization). */
export const hasTeacherProfile = (role: Role): boolean => role === Role.TEACHER;
