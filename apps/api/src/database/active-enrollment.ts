import { EnrollmentStatus } from '@lc/shared';

/** "Active" enrollment statuses (BACKEND_SCHEMA §2.8). */
export const ACTIVE_ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  EnrollmentStatus.PENDING_PLACEMENT,
  EnrollmentStatus.WAITING_CLASS,
  EnrollmentStatus.ENROLLED,
];
