# L-ADMISSIONS-1: lead status labels and lead creator name

Needed by: `apps/web/src/features/admissions` (A-05).

1. `apps/web/src/lib/status.ts` has no `lead` group. Please add `StatusGroup` `'lead'` with
   `NEW` (Mới, info), `PROFILE_CREATED` (Đã tạo hồ sơ, success), `CANCELLED` (Đã hủy, muted).
   Until then the lane uses `features/admissions/components/lead-status-badge.tsx`
   (marked `TODO W1-MERGE`); Lead should switch it to `StatusBadge group="lead"` and delete it.
2. `LeadDto` only exposes `createdBy` (id). DESIGN §4.3 lists a "người tiếp nhận" column; add
   `createdByName` to `LeadDto` (or expand it in the API) if the column is wanted. Omitted for now.
3. `features/admissions/course-options.ts` should be replaced by `useCourses` from
   `features/courses` at merge (`TODO W1-MERGE`).
