import { Role } from '@lc/shared';

/**
 * Where a notification leads, by `refType`. Unknown refTypes return null: the notification
 * is still marked read but the user stays put. Owning lanes add a case when they start
 * emitting a new refType.
 */
export function notificationTarget(
  refType: string | null | undefined,
  refId: string | null | undefined,
  role: Role,
): string | null {
  if (!refType || !refId) return null;
  const isStudent = role === Role.STUDENT;
  switch (refType) {
    case 'CLASS':
      return isStudent ? '/me/classes' : `/classes/${refId}`;
    case 'SESSION':
      return isStudent ? '/schedule' : `/sessions/${refId}/attendance`;
    case 'STUDENT':
      return isStudent ? '/me/profile' : `/students/${refId}`;
    case 'INVOICE':
      return isStudent ? '/me/fees' : `/fees/invoices/${refId}`;
    case 'ASSESSMENT':
      return isStudent ? '/me/results' : `/assessments/${refId}/grades`;
    default:
      return null;
  }
}
