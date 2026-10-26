import { ClassStatus, EnrollmentStatus } from './enums';

/** BACKEND_SCHEMA §2.8 */
export const ENROLLMENT_TRANSITIONS: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  PENDING_PLACEMENT: [EnrollmentStatus.WAITING_CLASS, EnrollmentStatus.CANCELLED],
  WAITING_CLASS: [EnrollmentStatus.ENROLLED, EnrollmentStatus.CANCELLED],
  ENROLLED: [
    EnrollmentStatus.TRANSFERRED,
    EnrollmentStatus.RESERVED,
    EnrollmentStatus.CANCELLED,
    EnrollmentStatus.COMPLETED,
  ],
  RESERVED: [EnrollmentStatus.WAITING_CLASS, EnrollmentStatus.CANCELLED],
  TRANSFERRED: [],
  COMPLETED: [],
  CANCELLED: [],
};

/** BACKEND_SCHEMA §2.10 */
export const CLASS_TRANSITIONS: Record<ClassStatus, readonly ClassStatus[]> = {
  PLANNED: [ClassStatus.ONGOING, ClassStatus.INACTIVE],
  ONGOING: [ClassStatus.FINISHED, ClassStatus.INACTIVE],
  INACTIVE: [ClassStatus.PLANNED],
  FINISHED: [],
};

export function canTransition<S extends string>(
  table: Record<S, readonly S[]>,
  from: S,
  to: S,
): boolean {
  return table[from].includes(to);
}
