// Domain events from ARCHITECTURE.md section 4.4.
export const DomainEvent = {
  EnrollmentEnrolled: 'enrollment.enrolled',
  SessionCreated: 'session.created',
  SessionUpdated: 'session.updated',
  SessionCancelled: 'session.cancelled',
  AttendanceRecorded: 'attendance.recorded',
  GradesConfirmed: 'grades.confirmed',
  ClassFinished: 'class.finished',
} as const;
export type DomainEvent = (typeof DomainEvent)[keyof typeof DomainEvent];
