# Decisions

- NestJS 11, Mongoose 8, Node 26.
- No Docker for development or tests; tests use mongodb-memory-server (MongoMemoryReplSet). docker-compose.yml is provided for optional use only.
- Permissions (@lc/shared, one per PRD §3 row; S cells allowed at role level): leads.create, students.create, enrollments.updateCourse, courses.manage, rooms.manage, placement.schedule, placement.grade, classes.manage, enrollments.assign, enrollments.confirm, students.search, students.viewProfile, students.update, sessions.manage, sessions.view, attendance.take, attendance.viewHistory, grades.enter, grades.view, fees.update, discounts.decide, fees.view, reports.view, users.manage (ADMIN+MANAGER), settings.update (MANAGER only; not in PRD matrix).
- Shared zod contracts (packages/shared/src/schemas): DTO ids are 24-hex strings; instants are ISO-8601 strings; date-only fields (dob, heldOn, dueDate, startDate/endDate, report from/to) are `YYYY-MM-DD` in both inputs and responses. Weekday is ISO 1=Mon..7=Sun. Reasons are shape-only (`zReason`, may be empty) so services raise REASON_REQUIRED; score, weight, discount, session-range (92 days) rules stay in services. PATCH bodies are `.partial().strict()`; immutable fields (course/room/class `code`, class `currentSize`, user `email`/`role`) are excluded so they yield VALIDATION_FAILED.
- Shape inventions: `PUT /placement-tests/:id/results` body is the bare array; `PUT /assessments/:id/grades` `confirm` defaults false; `GET /attendance/summary` requires `groupBy`; `POST /users` returns `{ user, tempPassword }`; `POST /users/:id/reset-password` returns `{ tempPassword }`; `POST /classes/:id/sessions/cancel-future` returns `{ cancelled }`; `POST /sessions/check-conflicts` returns `{ conflicts: SessionConflictDto[] }`; report DTOs use `{ totals, rows }` (attendance: byClass/byStudent/overThreshold; academic: rows/distribution/passRate/failRate); rates are 0..1 fractions; `GET /reports/:type/export` query = union of filters + `format`; `RoomStatus` (ACTIVE|INACTIVE) lives in schemas/rooms.ts; boolean query params use `zBoolQuery` ('true'|'false'|'1'|'0').
- Auth: change-password revokes all refresh tokens and rotates the cookie but already-issued access tokens stay valid for up to 15 minutes (stateless JWT). `JWT_REFRESH_SECRET` is kept in the env schema but reserved/unused: refresh tokens are opaque random values stored as sha256. The web client must dedupe concurrent `/auth/refresh` calls (single in-flight promise), because rotation is single-use and a reuse revokes every session of the user.
- Enrollment uniqueness: unique partial index `uniq_active_student_course` on enrollments `{studentId, courseId}` with `partialFilterExpression: { status: { $in: [PENDING_PLACEMENT, WAITING_CLASS, ENROLLED] } }` (supported by the Mongo version used in tests; `ACTIVE_ENROLLMENT_STATUSES` in `database/active-enrollment.ts`). `createPending` does a pre-check for a clean error and maps E11000 from the index to `ENROLLMENT_EXISTS`, so concurrent calls cannot both succeed (covered by a 3-way concurrent test). Note this index also constrains later transitions into an active state (e.g. un-cancelling) when another active enrollment exists.
- Events: `@nestjs/event-emitter@^3` (v12 is ESM-only and incompatible with Nest 11/Jest CJS); `EventEmitterModule.forRoot()` lives in AppModule. Notifications API read-side is `NotificationsApiService` in modules/notifications (the write-side `NotificationsService.notify` stays in CommonModule).


## Web route -> owning feature map (Task 12)

Roles: A=ADMIN, M=MANAGER, S=ACADEMIC_STAFF, T=TEACHER, H=STUDENT. Lanes edit only the files listed under their own `apps/web/src/features/<m>/`; `router.tsx`, `layouts/*`, `auth/*` are Lead-owned. Every page is a lazy default export (placeholder until the lane fills it). Routes outside `AppShell`: `/login`, `/change-password` (`features/auth`, Lead). `/` -> `features/home/home-router.tsx` (Lead) -> `dashboard/pages/staff-dashboard` (M/S, reports lane), `home/pages/teacher-home` (T) and `home/pages/student-home` (H) (student-portal lane); ADMIN is redirected to `/settings/users`. `*` -> 404, 403 page rendered by `RequireRole`.

| Route | Roles | Page file (under `apps/web/src/features/`) |
|---|---|---|
| `/notifications` | all | `notifications/pages/notifications-page.tsx` |
| `/admissions/leads` | M, S | `admissions/pages/leads-page.tsx` |
| `/admissions/leads/new` | M, S | `admissions/pages/lead-form-page.tsx` |
| `/admissions/leads/:id` | M, S | `admissions/pages/lead-detail-page.tsx` |
| `/admissions/placement` | M, S, T | `admissions/pages/placement-page.tsx` |
| `/admissions/placement/:id` | M, S, T | `admissions/pages/placement-detail-page.tsx` |
| `/admissions/placement/:id/grade` | T | `admissions/pages/placement-grade-page.tsx` |
| `/students` | M, S, T | `students/pages/students-page.tsx` |
| `/students/:id` | M, S, T | `students/pages/student-detail-page.tsx` |
| `/me/profile` | H | `students/pages/my-profile-page.tsx` |
| `/classes` | M, S, T | `classes/pages/classes-page.tsx` |
| `/classes/:id` | M, S, T | `classes/pages/class-detail-page.tsx` |
| `/enrollments/waiting` | M, S | `enrollments/pages/waiting-list-page.tsx` |
| `/me/classes` | H | `enrollments/pages/my-classes-page.tsx` |
| `/schedule` | M, S, T, H | `schedule/pages/schedule-page.tsx` |
| `/sessions/:id/attendance` | M, S, T | `attendance/pages/take-attendance-page.tsx` |
| `/attendance` | M, S, T | `attendance/pages/attendance-history-page.tsx` |
| `/me/attendance` | H | `attendance/pages/my-attendance-page.tsx` |
| `/assessments/:id/grades` | M, S, T | `grades/pages/grade-entry-page.tsx` |
| `/results` | M, S, T | `grades/pages/results-page.tsx` |
| `/me/results` | H | `grades/pages/my-results-page.tsx` |
| `/fees` | M, S, T | `fees/pages/fees-page.tsx` |
| `/fees/invoices/:id` | M, S | `fees/pages/invoice-detail-page.tsx` |
| `/fees/discounts` | M | `fees/pages/discounts-page.tsx` |
| `/me/fees` | H | `fees/pages/my-fees-page.tsx` |
| `/reports` | M, S | `reports/pages/reports-page.tsx` |
| `/settings/courses` | M, S | `courses/pages/courses-page.tsx` |
| `/settings/rooms` | M, S | `rooms/pages/rooms-page.tsx` |
| `/settings/users` | A, M | `users/pages/users-page.tsx` |
| `/settings/center` | M | `settings/pages/center-settings-page.tsx` |

**Tab slots** (`layouts/tab-slots.ts`, Lead-owned registries `CLASS_TABS` / `STUDENT_TABS`; the detail pages are `TabbedDetail` frames, the lane owning the page may customise the header only). Tab components read the route id via `useParams()`; active tab is `?tab=<key>`.

| Slot | Tab key | Roles | Component file |
|---|---|---|---|
| `/classes/:id` | students (Học viên) | M, S, T | `classes/components/class-students-tab.tsx` |
| `/classes/:id` | schedule (Lịch học) | M, S, T | `schedule/components/class-schedule-tab.tsx` |
| `/classes/:id` | attendance (Điểm danh) | M, S, T | `attendance/components/class-attendance-tab.tsx` |
| `/classes/:id` | assessments (Bài đánh giá & điểm) | M, S, T | `grades/components/class-assessments-tab.tsx` |
| `/classes/:id` | fees (Học phí lớp) | M, S | `fees/components/class-fees-tab.tsx` |
| `/students/:id` | info (Thông tin) | M, S, T | `students/components/student-info-tab.tsx` |
| `/students/:id` | enrollments (Khóa học & lớp) | M, S | `enrollments/components/student-enrollments-tab.tsx` |
| `/students/:id` | attendance (Chuyên cần) | M, S, T | `attendance/components/student-attendance-tab.tsx` |
| `/students/:id` | results (Kết quả) | M, S, T | `grades/components/student-results-tab.tsx` |
| `/students/:id` | fees (Học phí) | M, S | `fees/components/student-fees-tab.tsx` |
| `/students/:id` | documents (Giấy tờ) | M, S | `students/components/student-documents-tab.tsx` |
| `/students/:id` | audit (Lịch sử thay đổi) | M, S | `students/components/student-audit-tab.tsx` |

Notification `refType` -> target mapping lives in `features/notifications/notification-target.ts` (CLASS, SESSION, STUDENT, INVOICE, ASSESSMENT known; unknown stays on the page). Lanes that emit notifications use these refType strings or add a case there via contract request.
