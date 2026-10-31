import { NotificationRefType, NotificationType, Role } from '@lc/shared';

/**
 * Where a notification leads, by `refType`. Unknown refTypes return null: the notification
 * is still marked read but the user stays put. Owning lanes add a case when they start
 * emitting a new refType.
 */
export function notificationTarget(
  refType: NotificationRefType | null | undefined,
  refId: string | null | undefined,
  role: Role,
  type?: NotificationType | null,
): string | null {
  if (!refType || !refId) return null;
  const isStudent = role === Role.STUDENT;
  switch (refType) {
    case NotificationRefType.CLASS:
      return isStudent ? '/me/classes' : `/classes/${refId}`;
    case NotificationRefType.SESSION:
      return isStudent ? '/schedule' : `/sessions/${refId}/attendance`;
    case NotificationRefType.STUDENT:
      if (isStudent) return type === NotificationType.ATTENDANCE_WARNING ? '/me/attendance' : '/me/profile';
      return `/students/${refId}`;
    case NotificationRefType.INVOICE:
      return isStudent ? '/me/fees' : `/fees/invoices/${refId}`;
    case NotificationRefType.ASSESSMENT:
      return isStudent ? '/me/results' : `/assessments/${refId}/grades`;
    case NotificationRefType.ENROLLMENT:
      return isStudent ? '/me/classes' : null;
    case NotificationRefType.PLACEMENT_TEST:
      if (isStudent) return null;
      return role === Role.TEACHER
        ? `/admissions/placement/${refId}/grade`
        : `/admissions/placement/${refId}`;
    // PAYMENT: no screen yet; the owning lane adds its route here.
    default:
      return null;
  }
}
