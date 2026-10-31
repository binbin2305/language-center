import { can } from '@lc/shared';
import type { MeDto } from '@lc/shared';

/** Create/edit/delete assessments: T and S (BACKEND_SCHEMA §3.3, R21). */
export function canManageAssessments(user: MeDto | null): boolean {
  return can(user, 'assessments.manage');
}
