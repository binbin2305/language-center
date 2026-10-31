# L-GRADES-1: permission `assessments.manage`

Request: add `'assessments.manage': [TEACHER, ACADEMIC_STAFF]` to `PERMISSIONS` in `packages/shared/src/permissions.ts` (BACKEND_SCHEMA §3.3: T and S create/edit/delete assessments; controller ruling R21).

Until then `features/grades/permissions.ts` `canManageAssessments` uses `can(user,'grades.enter') || can(user,'attendance.take')` (same T+S set), marked `TODO W2-MERGE`. Lead swaps it to `can(user,'assessments.manage')` at merge.
