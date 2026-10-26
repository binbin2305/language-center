import { NotificationRefType, Role } from '@lc/shared';

/**
 * Where a notification leads, by `refType`. Unknown refTypes return null: the notification
 * is still marked read but the user stays put. Owning lanes add a case when they start
 * emitting a new refType.
 */
export function notificationTarget(
  refType: NotificationRefType | null | undefined,
  refId: string | null | undefined,
  role: Role,
): string | null {
  if (!refType || !refId) return null;
  const isStudent = role === Role.STUDENT;
  switch (refType) {
    case NotificationRefType.CLASS:
      return isStudent ? '/me/classes' : `/classes/${refId}`;
    case NotificationRefType.SESSION:
      return isStudent ? '/schedule' : `/sessions/${refId}/attendance`;
    case NotificationRefType.STUDENT:
      return isStudent ? '/me/profile' : `/students/${refId}`;
    case NotificationRefType.INVOICE:
      return isStudent ? '/me/fees' : `/fees/invoices/${refId}`;
    case NotificationRefType.ASSESSMENT:
      return isStudent ? '/me/results' : `/assessments/${refId}/grades`;
    // ENROLLMENT, PLACEMENT_TEST, PAYMENT: no screen yet; owning lanes add their route here.
    default:
      return null;
  }
}
