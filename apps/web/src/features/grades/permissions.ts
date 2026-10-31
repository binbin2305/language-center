import { can } from '@lc/shared';
import type { MeDto } from '@lc/shared';

/** Create/edit/delete assessments: T and S (BACKEND_SCHEMA §3.3, R21). */
// TODO W2-MERGE: swap to can(user,'assessments.manage') (L-GRADES-1)
export function canManageAssessments(user: MeDto | null): boolean {
  return can(user, 'grades.enter') || can(user, 'attendance.take');
}
