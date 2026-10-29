# Decisions

- NestJS 11, Mongoose 8, Node 26.
- No Docker for development or tests; tests use mongodb-memory-server (MongoMemoryReplSet). docker-compose.yml is provided for optional use only.
- Permissions (@lc/shared, one per PRD §3 row; S cells allowed at role level): leads.create, students.create, enrollments.updateCourse, courses.manage, rooms.manage, placement.schedule, placement.grade, classes.manage, enrollments.assign, enrollments.confirm, students.search, students.viewProfile, students.update, sessions.manage, sessions.view, attendance.take, attendance.viewHistory, grades.enter, grades.view, fees.update, discounts.decide, fees.view, reports.view, users.manage (ADMIN+MANAGER), settings.update (MANAGER only; not in PRD matrix).
- Shared zod contracts (packages/shared/src/schemas): DTO ids are 24-hex strings; instants are ISO-8601 strings; date-only fields (dob, heldOn, dueDate, startDate/endDate, report from/to) are `YYYY-MM-DD` in both inputs and responses. Weekday is ISO 1=Mon..7=Sun. Reasons are shape-only (`zReason`, may be empty) so services raise REASON_REQUIRED; score, weight, discount, session-range (92 days) rules stay in services. PATCH bodies are `.partial().strict()`; immutable fields (course/room/class `code`, class `currentSize`, user `email`/`role`) are excluded so they yield VALIDATION_FAILED.
- Shape inventions: `PUT /placement-tests/:id/results` body is the bare array; `PUT /assessments/:id/grades` `confirm` defaults false; `GET /attendance/summary` requires `groupBy`; `POST /users` returns `{ user, tempPassword }`; `POST /users/:id/reset-password` returns `{ tempPassword }`; `POST /classes/:id/sessions/cancel-future` returns `{ cancelled }`; `POST /sessions/check-conflicts` returns `{ conflicts: SessionConflictDto[] }`; report DTOs use `{ totals, rows }` (attendance: byClass/byStudent/overThreshold; academic: rows/distribution/passRate/failRate); rates are 0..1 fractions; `GET /reports/:type/export` query = union of filters + `format`; `RoomStatus` (ACTIVE|INACTIVE) lives in schemas/rooms.ts; boolean query params use `zBoolQuery` ('true'|'false'|'1'|'0').
- Auth: change-password revokes all refresh tokens and rotates the cookie but already-issued access tokens stay valid for up to 15 minutes (stateless JWT). `JWT_REFRESH_SECRET` is optional in the env schema and reserved/unused: refresh tokens are opaque random values stored as sha256. The web client must dedupe concurrent `/auth/refresh` calls (single in-flight promise), because rotation is single-use and a reuse outside the grace window (below) revokes every session of the user.
- Enrollment uniqueness: unique partial index `uniq_active_student_course` on enrollments `{studentId, courseId}` with `partialFilterExpression: { status: { $in: [PENDING_PLACEMENT, WAITING_CLASS, ENROLLED] } }` (supported by the Mongo version used in tests; `ACTIVE_ENROLLMENT_STATUSES` in `database/active-enrollment.ts`). `createPending` does a pre-check for a clean error and maps E11000 from the index to `ENROLLMENT_EXISTS`, so concurrent calls cannot both succeed (covered by a 3-way concurrent test). Note this index also constrains later transitions into an active state (e.g. un-cancelling) when another active enrollment exists.
- Events: `@nestjs/event-emitter@^3` (v12 is ESM-only and incompatible with Nest 11/Jest CJS); `EventEmitterModule.forRoot()` lives in AppModule. Notifications API read-side is `NotificationsApiService` in modules/notifications (the write-side `NotificationsService.notify` stays in CommonModule).
- Date-only storage: date-only fields (dob, startDate/endDate, dueDate, heldOn, …) are stored as a `Date` at VN midnight of that day (`fromDateOnly(day)` = `startOfVnDay`) and serialized with `toDateOnly(d)` (= `vnDay`) from `@lc/shared`. Never use `toISOString().slice(0, 10)`: VN midnight is 17:00Z of the previous day, so it returns the wrong date.
- Roles: `RolesGuard` reads `@Roles` with `getAllAndOverride`, so a handler-level `@Roles` replaces the class-level one (it does not intersect or merge) — repeat the roles on the handler if you need a subset.
- Time: Mongoose `createdAt`/`updatedAt` come from ClockService too — every schema uses `timestamps: clockTimestamps` (`database/schemas/helpers.ts`), backed by `clockHolder` which `ClockHolderBinder` binds to the app's ClockService (FakeClock in tests). New schemas must use it (an e2e test checks every registered model).
- Refresh reuse grace: presenting a refresh token rotated < 10 s ago (or losing the atomic claim to a concurrent rotation) returns 401 UNAUTHENTICATED without revoking other tokens; later reuse still revokes every token of the user. The web client serialises refreshes across tabs with `navigator.locks` (`lc-refresh`) and shares new tokens over `BroadcastChannel('lc-auth')`.
- Usernames are canonical: STUDENT usernames (student codes) uppercase, email usernames lowercase (User pre-validate hook); login normalises input the same way (contains `@` → lowercase, else uppercase).
- Errors: Mongoose `ValidationError` → 400 VALIDATION_FAILED with `details.fields` (path → message); `CastError` (malformed ObjectId) → 404 NOT_FOUND.
- Cross-lane DI contracts live in Lead-owned `apps/api/src/common/contracts/`: `INVOICE_CREATOR`, `OUTSTANDING_CHECKER` (L-FEES implements), `SCHEDULE_CONFLICT_CHECKER` (L-SCHEDULE implements). The global `ContractsModule` provides no-ops; the implementing lane provides + exports the token from its own module, and the Lead adds that module to each consumer's `imports` at merge (explicit imports win over the global no-op). Consumers inject by token only.
- `@lc/shared` resolves from `packages/shared/src` in dev, typecheck, lint and tests (tsconfig `paths`, jest `moduleNameMapper`, vite alias); the API production build (`tsconfig.build.json`) resolves the built `dist`, which is produced by the package's `prepare` script on install, by `pnpm --filter api build`, and by the merge gate.
- Test factories generate codes outside every service namespace (HV1999…, HD199901…, PT199901…, `F-` class/course/room codes) so they never collide with CounterService codes.
- Notification `refType` is the closed `NotificationRefType` enum in `@lc/shared` (CLASS, SESSION, STUDENT, INVOICE, ASSESSMENT, ENROLLMENT, PLACEMENT_TEST, PAYMENT).


### Installed for lanes

Lanes cannot edit package.json / pnpm-lock.yaml, so these are pre-installed (all load under ts-jest CJS / Vitest; checked with a smoke import):

- web: `@fullcalendar/core|react|daygrid|timegrid|list|interaction` ^6.1.22 (MIT packages only; v7 is ESM-only with a temporal-polyfill peer and its plugins are not released at 7), `recharts` ^3.10.1 (+ `react-is` ^18.3.1 peer; 2.x is deprecated upstream).
- api: `exceljs` ^4.4.0, `pdfmake` ^0.3.13 (+ `@types/pdfmake` ^0.3.3), `multer` ^2.5.0 (+ `@types/multer` ^2.3.0; `@nestjs/platform-express` already present), `@nestjs/swagger` ^11.4.7 (12.x requires Nest 12).
- root dev: `@playwright/test` ^1.64.1 — browsers are not downloaded; run `pnpm exec playwright install chromium` when needed.

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

Notification `refType` -> target mapping lives in `features/notifications/notification-target.ts` (CLASS, SESSION, STUDENT, INVOICE, ASSESSMENT mapped; ENROLLMENT, PLACEMENT_TEST, PAYMENT and unknown values stay on the page). Lanes emit `NotificationRefType` values and add a route case there via contract request.

- **Khóa CounterService (sinh mã):** `student:<YYYY>` → `HV<YYYY><5 số>`, `invoice:<YYYYMM>` → `HD<YYYYMM><4 số>`, `payment:<YYYYMM>` → `PT<YYYYMM><4 số>`. `seed:demo` nâng các bộ đếm này bằng `$max` để service tiếp tục sau mã demo.
- Wave 1 non-blocking warnings (D2): warnings ride inside `data`, never `meta`, so plain `apiPost/apiPatch` can read them: `PATCH /students/:id` and `/students/me/contact` -> `UpdateStudentResultDto { student, warnings?: { duplicates } }`; `POST /sessions` and `PATCH /sessions/:id` -> `CreateSessionResultDto { session, warnings: SessionWarning[] }`; `POST /sessions/bulk` -> `BulkCreateSessionsResultDto` with `warnings`. Only code today is `ROOM_TOO_SMALL`.
- DUPLICATE_PERSON (D3, D10): `details: { duplicates: DuplicateMatchDto[] }` (`DuplicatePersonDetails`), each entry carries `kind` (LEAD|STUDENT), `matchedOn` (phone and/or email, never empty) and the student `code` when applicable. Phone compared after `zVnPhone` normalisation (`09...`), email lowercased. CANCELLED leads and soft-deleted students never match; a lead being converted does not match itself.
- Attendance rates (D6, D7): `absenceRate(counts)` = (EXCUSED+UNEXCUSED)/all records, 0 when none; class roster `warning = rate > attendanceWarningThreshold` (FR-ATT-05). `attendanceRate(counts)` = (PRESENT+LATE)/all records, null when none, used for `StudentDetailDto.summary.attendanceRate`. Both are pure helpers in `@lc/shared` (`attendance-rate.ts`). In Wave 1 `summary.averageScore` is null and `summary.outstandingBalance` is 0; the Lead wires real values in Wave 3.
- Class dependencies (D9): `CLASS_HAS_DEPENDENCIES` `details.reasons` is the closed enum `ClassDependencyReason` = ACTIVE_STUDENTS | ENROLLMENT_HISTORY | SESSIONS | GRADES | INVOICES. A class with only enrollment history (e.g. TRANSFERRED) still cannot be deleted (FR-CLS-04).
- Locked accounts (D4): a user with `status=LOCKED` who logs in with the correct password gets 423 ACCOUNT_LOCKED (no `lockedUntil`); a wrong password stays 401 INVALID_CREDENTIALS so status is not leaked; DISABLED is always 401. Locking does not revoke access tokens already issued (up to 15 minutes).
- Web client: `apiPostForm(path, form)` sends multipart without setting Content-Type (the runtime adds the boundary); `apiGetBlob(path)` downloads binary through the same `request()` path, so 401 -> refresh -> retry applies. In vitest/jsdom, jsdom's FormData/File are not serialised as multipart by Node's fetch; tests that exercise uploads end-to-end must build the form with Node classes (see `nodeForm` in `lib/__tests__/api.test.ts`).
