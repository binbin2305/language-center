# Wave 1 — 4 lane nghiệp vụ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiện thực TASK.md Wave 1 — Danh mục/Tài khoản/Cài đặt (L-CATALOG), Tuyển sinh & Hồ sơ HV (L-ADMISSIONS), Lớp học (L-CLASSES), Lịch học (L-SCHEDULE) — API + màn hình, rồi merge thành `main` có tag `w1`.

**Architecture:** Lead làm Task 0 (chuẩn bị hợp đồng, tuần tự) trên `main`. Sau đó 4 lane chạy song song, mỗi lane một worktree `../lc-<LANE>` trên nhánh `lane/<LANE>` (`scripts/lane-start.sh`), chỉ sửa file trong `scripts/lane-owners.json`. Trong một lane các task chạy tuần tự (API trước, FE sau). Task cuối (Lead) chạy merge-gate từng lane, merge tuần tự vào `main`, kiểm tra toàn bộ và tag `w1`.

**Tech Stack:** như Wave 0 — NestJS 11, Mongoose 8, zod 3, Jest + supertest + MongoMemoryReplSet; React 18, TanStack Query 5, react-hook-form, shadcn/ui, FullCalendar 6, Vitest + RTL + MSW 2.

**Spec:** `PRD.md`, `BACKEND_SCHEMA.md` §2–3, `DESIGN.md` §4.3–4.6, §4.11, `RULES.md`, `TASK.md` (Wave 1), `docs/DECISIONS.md`, `docs/superpowers/wave0-ledger.md` (R13/R14 + minor deferred).

## Global Constraints
- Mọi shell: `export PATH=/opt/homebrew/bin:$PATH`. Commit: `git -c user.name=huybin2305 -c user.email=huybin2305@gmail.com commit …`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RULES.md áp dụng nguyên văn: TDD (RED chạy và fail đúng lý do trước GREEN), test tên tiếng Việt có mã FR, mỗi endpoint có test quyền (mỗi role không được phép → 403, ngoài phạm vi → 404), controller mỏng, `@Roles` tường minh trên mọi route, input qua `ZodValidationPipe(<schema @lc/shared>)`, `toDto` (không trả document), `withTransaction` cho ghi nhiều document, `ClockService.now()`, `AuditService.log` cho ghi students/classes/sessions.
- Lane **không** sửa `packages/shared`, `apps/api/src/{common,database}`, `apps/api/test/{helpers,factories}` (trừ `<lane>.extra.ts`), `app.module.ts`, `apps/web/src/{router.tsx,lib,layouts,auth,components}`, `package.json`, lockfile. Thiếu hợp đồng → `docs/contract-requests/<lane>-<n>.md` và làm phần khác.
- Ngày-only lưu bằng `fromDateOnly(day)` và trả bằng `toDateOnly(d)` (`@lc/shared`); **cấm** `toISOString().slice(0,10)`.
- Handler `@Roles` **thay thế** `@Roles` của class (không giao) — lặp lại đủ role trên handler.
- `clockHolder` là global theo process: mỗi file e2e một `createTestApp()` (`beforeAll`) và `t.close()` (`afterAll`); không tạo app thứ hai trong cùng file.
- Thời điểm mặc định của test: `DEFAULT_NOW = 2026-01-05T02:00:00Z` (09:00 thứ Hai 05/01/2026 giờ VN).
- Factory sinh mã ngoài không gian dịch vụ (`F-…`, `HV1999…`) — test tạo mã thật (HV2026…) phải đi qua service.
- Mỗi task kết thúc bằng: `pnpm --filter api test:e2e -- <file>` (hoặc `pnpm --filter web test -- <dir>`) xanh, `pnpm lint && pnpm typecheck` xanh, rồi commit conventional (`feat(<module>): …`).
- FE: gọi API chỉ qua `features/<m>/api.ts` + `features/<m>/hooks.ts` (mẫu: `features/notifications/api.ts`); test đặt ở `features/<m>/__tests__/`, mock mạng bằng `server.use(...)` từ `apps/web/test/msw/server.ts`; render bằng `renderApp({ user: makeUser(Role.X), route })` (`apps/web/test/render.tsx`, `apps/web/test/users.ts`); ẩn/hiện hành động bằng `can(user, permission)`; lỗi qua `lib/error-messages.ts`.

## Review Focus
1. **Hai request đồng thời tạo trùng** (mã lớp/khóa/phòng khác hoa thường, convert cùng lead hai lần) — chỉ một thành công, cái còn lại 409 đúng mã, không còn document mồ côi. Test: C-01 (code race), CL-01 (`CLASS_CODE_EXISTS` song song), A-02 (2 convert song song cùng lead → 1×201, 1×409 PROFILE_EXISTS).
2. **Tạo lịch lặp qua ranh giới tháng/DST-less VN và buổi chạm biên** — 18:00 VN = 11:00Z, buổi 19:30–21:00 sau 18:00–19:30 không xung đột, và tạo lặp trùng **chính nó** (hai buổi trong cùng request chồng nhau khi weekdays có trùng/ngày lặp) phải không xảy ra. Test: S-01 bảng, S-02 (`weekdays: [1,1,3]` → không sinh buổi trùng, đúng 8 buổi cho tháng 1).
3. **Phạm vi dữ liệu khi giáo viên là trợ giảng hoặc dạy thay** — GV trợ giảng thấy lớp/HV như GV chính; GV dạy thay thấy buổi đó trong `/sessions` nhưng không thấy lớp trong `/classes`. Test: CL-03, S-04, A-03.
4. **Tìm kiếm tiếng Việt có ký tự đặc biệt** (`đ`, chữ hoa có dấu, ký tự regex như `(`/`+`) — không lỗi 500, khớp không dấu. Test: A-03 (`"dang"` khớp `"Đặng"`, `q="+84("` → 200 rỗng, không 500).
5. **Sửa hồ sơ sau khi đổi tên** — `fullNameSearch` phải cập nhật (W0 Task 6 minor) để tìm theo tên mới. Test: A-04 (PATCH fullName rồi `GET /students?q=<tên mới không dấu>` khớp).

---

## Lead decisions (đã chốt, lane không tranh luận lại)
- **D1 Nhánh:** Task 0 fast-forward `main` cục bộ lên `wave0` (W0 đã qua final review), tag `w0`; `lane-start.sh`/`merge-gate.sh` dùng `main` như thiết kế. Push để người dùng tự làm khi có credentials.
- **D2 Cảnh báo kèm dữ liệu:** cảnh báo không chặn nằm **trong `data`** (không dùng `meta`) để dùng được `apiPost/apiPatch` hiện có: `PATCH /students/:id` → `{ data: UpdateStudentResultDto }`; `POST /sessions` → `{ data: CreateSessionResultDto }`; `POST /sessions/bulk` → `BulkCreateSessionsResultDto` có thêm `warnings`.
- **D3 DUPLICATE_PERSON:** `details: { duplicates: DuplicateMatchDto[] }` (lead + student, mỗi bản ghi kèm `matchedOn`). Lead CANCELLED không tính trùng; student xóa mềm không tính.
- **D4 Tài khoản bị khóa:** user `status=LOCKED` đăng nhập **đúng mật khẩu** → 423 ACCOUNT_LOCKED (không `lockedUntil`); sai mật khẩu → 401 như cũ (không lộ trạng thái). `DISABLED` → 401. Refresh/me đã chặn status ≠ ACTIVE (W0). Lock **không** thu hồi access token đang có (≤15 phút, như change-password).
- **D5 Tạo ADMIN qua API** → 400 VALIDATION_FAILED `details.fields.role` (giống nhánh STUDENT của `createStaff`). M và A tạo được TEACHER/ACADEMIC_STAFF/MANAGER.
- **D6 Tỷ lệ vắng:** helper thuần `absenceRate(counts)` = (EXCUSED+UNEXCUSED)/tổng bản ghi, 0 khi không có bản ghi; `warning = rate > attendanceWarningThreshold` (FR-ATT-05). L-ATTENDANCE (W2) dùng lại helper này.
- **D7 Tóm tắt hồ sơ HV ở W1:** `summary.attendanceRate` = (PRESENT+LATE)/tổng bản ghi của HV (null khi chưa có); `averageScore: null`; `outstandingBalance: 0` — Lead nối dữ liệu thật ở W3 (tích hợp chéo). Ghi vào `docs/DECISIONS.md`.
- **D8 Đăng nhập HV bằng email** (FR-ADM-04 vế "email") **hoãn sang W3 Lead**: auth hiện đăng nhập theo `username` (mã HV). W1 không đổi `createStudentAccount`. Ghi `docs/QUESTIONS.md`.
- **D9 Lớp có lịch sử:** lý do phụ thuộc là enum đóng `ClassDependencyReason` = `ACTIVE_STUDENTS | ENROLLMENT_HISTORY | SESSIONS | GRADES | INVOICES`. Lớp chỉ còn `ENROLLMENT_HISTORY` cũng không xóa được (FR-CLS-04 [Quyết định]).
- **D10 SĐT trùng khi tạo lead/convert:** so khớp sau chuẩn hóa `zVnPhone` (`09…`); email so khớp lowercase. Cùng một người: lead đang convert không tự trùng với chính nó.

---

## File Structure

```
packages/shared/src/                          (Task 0, Lead)
  schemas/leads.ts        + DuplicateMatchDto, DuplicatePersonDetails
  schemas/students.ts     + UpdateStudentResultDto; StudentBriefDto + dob, phone; StudentTeacherViewDto
  schemas/sessions.ts     + SessionWarning, CreateSessionResultDto; BulkCreateSessionsResultDto.warnings
  schemas/classes.ts      + ClassDependencyReason
  attendance-rate.ts      absenceRate(), attendanceRate()            (+ index.ts export)
apps/api/src/modules/auth/auth.service.ts      D4 (Task 0)
apps/web/src/lib/api.ts                        + apiPostForm, apiGetBlob (Task 0)

apps/api/src/modules/<m>/                      (lanes)
  <m>.controller.ts  <m>.service.ts  <m>.mapper.ts (toDto)  <m>.module.ts
apps/api/src/modules/schedule/conflict-checker.ts (+ .spec.ts)   S-01
apps/api/src/modules/schedule/recurrence.ts (+ .spec.ts)         S-02
apps/api/src/modules/admissions/{leads,students,documents}.{controller,service}.ts
apps/api/test/e2e/<m>.e2e-spec.ts (một file / task, tên theo lane-owners glob)
apps/web/src/features/<m>/{api.ts,hooks.ts,pages/*,components/*,__tests__/*}
```

---

### Task 0: Lead — chuẩn bị Wave 1 (tuần tự, trước khi mở lane)

**Files:**
- Modify: `packages/shared/src/schemas/{leads,students,sessions,classes}.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/attendance-rate.ts`, `packages/shared/src/__tests__/attendance-rate.test.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`, `apps/api/test/e2e/auth.e2e-spec.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/lib/__tests__/api.test.ts`
- Modify: `docs/DECISIONS.md`, `docs/QUESTIONS.md`

**Interfaces — Produces:**
```ts
// leads.ts
export const DuplicateMatchDto = z.object({
  kind: z.enum(['LEAD', 'STUDENT']), id: zObjectId, fullName: z.string(),
  phone: z.string(), email: z.string().nullable(), code: z.string().optional(), // student code
  status: z.string(), matchedOn: z.array(z.enum(['phone', 'email'])).min(1),
});
export const DuplicatePersonDetails = z.object({ duplicates: z.array(DuplicateMatchDto) });
// students.ts
export const UpdateStudentResultDto = z.object({
  student: StudentDto, warnings: z.object({ duplicates: z.array(DuplicateMatchDto) }).optional() });
StudentBriefDto  // += dob: zDateOnly, phone: z.string()
export const StudentTeacherViewDto = StudentBriefDto.extend({ enrollments: z.array(EnrollmentDto) });
// sessions.ts
export const SessionWarning = z.object({ code: z.literal('ROOM_TOO_SMALL'),
  roomCapacity: z.number().int(), classMaxCapacity: z.number().int() });
export const CreateSessionResultDto = z.object({ session: SessionDto, warnings: z.array(SessionWarning) });
BulkCreateSessionsResultDto // += warnings: z.array(SessionWarning)
// classes.ts
ListClassesQuery // += includePast: zBoolQuery.optional()  (CL-03, chỉ STUDENT dùng)
export const ClassDependencyReason = z.enum(['ACTIVE_STUDENTS','ENROLLMENT_HISTORY','SESSIONS','GRADES','INVOICES']);
// attendance-rate.ts
export type AttendanceCounts = Partial<Record<AttendanceStatus, number>>;
export function absenceRate(c: AttendanceCounts): number;            // 0 khi tổng = 0
export function attendanceRate(c: AttendanceCounts): number | null;  // null khi tổng = 0
// web lib/api.ts
export function apiPostForm<T>(path: string, form: FormData): Promise<T>;   // không set Content-Type (để boundary)
export function apiGetBlob(path: string): Promise<Blob>;                     // có refresh-on-401 như request()
```

- [ ] **Step 1:** `git checkout main && git merge --ff-only wave0 && git tag w0` (dừng và báo nếu không fast-forward được).
- [ ] **Step 2 (RED):** shared test `absenceRate({PRESENT:8,EXCUSED:1,UNEXCUSED:1}) === 0.2`, `absenceRate({}) === 0`, `attendanceRate({PRESENT:3,LATE:1}) === 1`, `attendanceRate({PRESENT:3,UNEXCUSED:1}) === 0.75`, `attendanceRate({}) === null`; parse test cho `DuplicateMatchDto` (matchedOn rỗng → fail) và `ClassDependencyReason`. Auth e2e: `it('FR-USR-01 user LOCKED đăng nhập đúng mật khẩu → 423 ACCOUNT_LOCKED')`, `it('user LOCKED sai mật khẩu → 401 INVALID_CREDENTIALS')`, `it('user DISABLED → 401')`. Web: `apiPostForm` gửi `FormData` (MSW handler nhận `request.formData()` có file), không có header `content-type: application/json`; `apiGetBlob` trả Blob và refresh một lần khi 401.
- [ ] **Step 3:** chạy `pnpm --filter @lc/shared test`, `pnpm --filter api test:e2e -- auth`, `pnpm --filter web test -- api` → FAIL đúng lý do.
- [ ] **Step 4 (GREEN):** hiện thực các mục Interfaces; auth: trong `login`, sau `verifyPassword`, `status === LOCKED && valid` → `AppError(ACCOUNT_LOCKED)`, mọi status ≠ ACTIVE còn lại → `INVALID_CREDENTIALS`.
- [ ] **Step 5:** ghi D2, D3, D6, D7, D9 vào `docs/DECISIONS.md`; D8 vào `docs/QUESTIONS.md`.
- [ ] **Step 6:** full verification `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && bash scripts/__tests__/merge-gate.test.sh` → xanh. Commit `chore(shared): wave 1 contracts` + `feat(auth): 423 for locked accounts` + `feat(web): form upload and blob helpers` trên `main`.
- [ ] **Step 7:** `bash scripts/lane-start.sh L-CATALOG` (và L-ADMISSIONS, L-CLASSES, L-SCHEDULE) → 4 worktree `../lc-<LANE>`; mỗi worktree `pnpm install --frozen-lockfile` xanh.

---

## Lane L-CATALOG (worktree `../lc-L-CATALOG`)

### Task C-01: Courses API (FR-FEE-01 baseFee)

**Files:** `apps/api/src/modules/courses/{courses.controller,courses.service,courses.mapper}.ts`; test `apps/api/test/e2e/courses.e2e-spec.ts`

**Interfaces — Produces (dùng bởi A-01, CL-01 qua model, FE qua HTTP):**
- `GET /courses` (ALL_ROLES; `ListCoursesQuery`, sort allow-list `code|name|createdAt`) → `Paginated<CourseDto>`; `GET /courses/:id` (ALL_ROLES); `POST /courses` (M,S) → 201 `CourseDto`; `PATCH /courses/:id` (M,S) `UpdateCourseInput`.
- `toCourseDto(doc): CourseDto` trong `courses.mapper.ts`.

- [ ] **Step 1 (RED)** `describe('FR-FEE-01 Khóa học')`:
  - `M tạo khóa → 201, code lưu UPPERCASE, baseFee 3_000_000`; `S tạo được`; `T, H POST → 403`; `T, H GET /courses → 200`.
  - `code "ielts-a" khi đã có "IELTS-A" → 409 CONFLICT details.fields.code`; `hai POST song song cùng code → 1×201, 1×409`.
  - `levels: [] → 400 VALIDATION_FAILED fields.levels`; `baseFee 1.5 → 400 fields.baseFee`; `PATCH { code } → 400`.
  - `GET /courses?status=ACTIVE không chứa khóa ARCHIVED` (danh sách chọn khi tạo lead); `PATCH status ARCHIVED → 200`; `GET /courses/:id không tồn tại → 404`.
- [ ] **Step 2:** `pnpm --filter api test:e2e -- courses` → FAIL (404 route).
- [ ] **Step 3 (GREEN):** trùng mã: schema đã `uppercase` + unique index `{code:1}` (course/room/class) → bắt E11000 → `AppError(CONFLICT, undefined, { fields: { code: 'DUPLICATE' } })`. `q` lọc code/name bằng regex đã escape.
- [ ] **Step 4:** test xanh, lint/typecheck xanh. Commit `feat(courses): courses API`.

### Task C-02: Rooms API

**Files:** `apps/api/src/modules/rooms/*`; test `apps/api/test/e2e/rooms.e2e-spec.ts`

**Produces:** `GET/POST /rooms`, `GET/PATCH /rooms/:id` — tất cả `@Roles(MANAGER, ACADEMIC_STAFF)`; `toRoomDto`.

- [ ] **Step 1 (RED)** `describe('Phòng học')`: CRUD M/S; `code trùng khác hoa thường → 409 fields.code`; `capacity 0 → 400 fields.capacity`; `T, H, A mọi route → 403`; `?status=ACTIVE` lọc; PATCH `{code}` → 400.
- [ ] **Step 2–4:** RED → GREEN (giống C-01) → commit `feat(rooms): rooms API`.

### Task C-03: Users API (FR-USR-01)

**Files:** `apps/api/src/modules/users/{users.controller,teachers.controller,users.service,users.mapper}.ts`; test `apps/api/test/e2e/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `UsersService.createStaff` (W0, giữ nguyên chữ ký), `createStudentAccount` (W0, **không đổi** — A-02 dùng).
- Produces: `GET/POST /users`, `GET/PATCH /users/:id`, `POST /users/:id/{lock,unlock,reset-password}` — `@Roles(ADMIN, MANAGER)`; `GET /teachers` — `@Roles(MANAGER, ACADEMIC_STAFF)` → `{ data: TeacherOptionDto[] }` (chỉ TEACHER ACTIVE, sort fullName); `toUserDto` (không bao giờ có `passwordHash`).
- Thêm `UsersController` vào `UsersModule.controllers` (module lane-owned).

- [ ] **Step 1 (RED)** `describe('FR-USR-01 Tài khoản')`:
  - `M tạo TEACHER có teacherProfile {languages:['en'],levels:['B1']} → 201 { user, tempPassword }, user.mustChangePassword true, không có passwordHash`; `A tạo được`; `S, T, H POST /users → 403`.
  - `role ADMIN → 400 fields.role` (D5); `role STUDENT → 400`; `email trùng (khác hoa thường) → 409 fields.email`.
  - `POST /users/:id/lock → status LOCKED; đăng nhập đúng mật khẩu → 423`; `unlock → đăng nhập được`; `lock chính mình → 400 VALIDATION_FAILED fields.id 'SELF'`; `MANAGER lock/reset/PATCH user ADMIN → 403 FORBIDDEN`.
  - `reset-password → { tempPassword }, mật khẩu cũ hết hiệu lực, mustChangePassword true`.
  - `GET /users?role=TEACHER&q=lan` lọc + phân trang; `GET /users/:id user STUDENT → 200` (xem được, không sửa role).
  - `GET /teachers` M,S → chỉ TEACHER ACTIVE; T,H,A → 403.
  - Audit: create/lock/unlock/reset ghi `audit_logs` với `entity: 'user'`.
- [ ] **Step 2:** RED → FAIL.
- [ ] **Step 3 (GREEN):** lock/unlock bằng `findOneAndUpdate` có điều kiện `role ≠ ADMIN` khi actor là MANAGER; unlock cũng xóa `lockedUntil`, `failedLoginCount`. Reset dùng `generateTempPassword/hashPassword` (`modules/auth/password.ts`).
- [ ] **Step 4:** xanh → commit `feat(users): users and teachers API`.

### Task C-04: Settings API (FR-SET-01)

**Files:** `apps/api/src/modules/settings/{settings.controller,settings.service}.ts`; test `apps/api/test/e2e/settings.e2e-spec.ts`

**Consumes:** `common/settings/settings.service.ts` (W0 `SettingsService` có cache + version guard) — controller chỉ gọi nó; module settings không tự đọc model.
**Produces:** `GET /settings` (ALL_ROLES) → `SettingsDto`; `PATCH /settings` (`@Roles(MANAGER)`) `UpdateSettingsInput` → `SettingsDto`.

- [ ] **Step 1 (RED)** `describe('FR-SET-01 Cài đặt')`: `M PATCH attendanceWarningThreshold 0.3 → GET trả 0.3`; `S, T, H, A PATCH → 403`; `threshold 1.2 → 400`, `-0.1 → 400`; `gradeLockDays 7.5 → 400`, `366 → 400`, `0 → 200`; `field lạ → 400`; mọi role GET → 200; PATCH ghi audit `entity: 'settings'`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(settings): settings API`.

### Task C-05: FE Khóa học, Phòng, Tài khoản, Cài đặt (DESIGN §4.11)

**Files:** `apps/web/src/features/{courses,rooms,users,settings}/{api.ts,hooks.ts,pages/*-page.tsx,components/*}`; tests `apps/web/src/features/{courses,users,settings}/__tests__/*.test.tsx`; tùy chọn `apps/web/test/msw/{courses,rooms,users,settings}.handlers.ts`

**Produces (dùng chéo FE ở W1 qua import):** `coursesApi.list(params)`, `useCourses(params)` trong `features/courses/hooks.ts`; `usersApi.teachers()`, `useTeachers()` trong `features/users/hooks.ts`; `roomsApi.list`, `useRooms` trong `features/rooms/hooks.ts`. Lane khác **chỉ import**, không sửa.

- [ ] **Step 1 (RED):**
  - courses: `tạo khóa thành công → hàng "IELTS-A" xuất hiện trong bảng` (MSW POST 201 rồi GET trả thêm hàng); `409 → "Mã khóa học đã tồn tại" hiển thị dưới ô Mã` (từ `details.fields.code` → `setError`).
  - users: `tạo GV → dialog "Mật khẩu tạm" hiển thị tempPassword và nút "Sao chép" gọi navigator.clipboard.writeText`; `nút Khóa → ConfirmDialog → POST /users/:id/lock`.
  - nav: `ACADEMIC_STAFF không thấy menu "Tài khoản" và "Cài đặt"`; `MANAGER thấy cả hai`.
  - settings: `nhập ngưỡng 120 (%) → lỗi dưới ô, không gọi PATCH`; form hiển thị ngưỡng dạng % (0.2 ↔ 20).
  - rooms: `sức chứa 0 → lỗi dưới ô`.
- [ ] **Step 2:** `pnpm --filter web test -- features/courses features/users features/settings features/rooms` → FAIL.
- [ ] **Step 3 (GREEN):** trang = `PageHeader` + `DataTable` + dialog form (react-hook-form + `zodResolver(CreateCourseInput)`), 4 trạng thái (loading/rỗng/lỗi/dữ liệu); `baseFee` dùng `MoneyInput`, hiển thị `MoneyText`.
- [ ] **Step 4:** xanh → commit `feat(web): catalog, users and settings screens`.

---

## Lane L-ADMISSIONS (worktree `../lc-L-ADMISSIONS`)

`AdmissionsController` W0 là `@Controller('')` — tách thành `LeadsController @Controller('leads')`, `StudentsController @Controller('students')`; `AdmissionsModule` thêm `imports: [UsersModule, EnrollmentsModule]`.

### Task A-01: Leads API (FR-ADM-01, 02, 08)

**Files:** `apps/api/src/modules/admissions/{leads.controller,leads.service,duplicates.service,admissions.mapper}.ts`; test `apps/api/test/e2e/admissions-leads.e2e-spec.ts`

**Interfaces — Produces:**
- `DuplicatesService.find(input: { phone: string; email?: string | null }, exclude?: { leadId?: Types.ObjectId; studentId?: Types.ObjectId }): Promise<DuplicateMatchDto[]>` — dùng lại ở A-02, A-04.
- `POST /leads` (M,S; `CreateLeadQuery`), `GET /leads` (`ListLeadsQuery`; from/to theo ngày VN của `createdAt`), `GET/PATCH /leads/:id`, `POST /leads/:id/cancel` (NEW → CANCELLED; trạng thái khác → 422 INVALID_STATUS_TRANSITION).

- [ ] **Step 1 (RED)** `describe('FR-ADM-01/02/08 Lead')`:
  - `thiếu fullName → 400 fields.fullName` — lặp `it.each` cho fullName, dob, gender, phone, interestedCourseId.
  - `phone "+84912345678" lưu "0912345678"`.
  - `SĐT trùng lead NEW khác → 409 DUPLICATE_PERSON details.duplicates[0] {kind:'LEAD', matchedOn:['phone']}`; `trùng SĐT student → kind 'STUDENT' kèm code`; `trùng cả hai → 2 phần tử`; `?force=true → 201`; `email "A@X.VN" trùng "a@x.vn" → 409 matchedOn ['email']`; `lead CANCELLED cùng SĐT → không tính trùng`.
  - `course ARCHIVED → 400 fields.interestedCourseId`; `course không tồn tại → 400`.
  - `lọc ?status=NEW&courseId=…&from=2026-01-05&to=2026-01-05` (tạo lead ở 2 ngày bằng `t.clock.set`).
  - `T, H, A mọi route → 403`; `cancel → CANCELLED`, `cancel lần hai → 422`.
- [ ] **Step 2–3:** RED → GREEN. Truy vấn trùng: `$or` trên phone/email, lead `status ≠ CANCELLED`, student `deletedAt: null`.
- [ ] **Step 4:** commit `feat(admissions): leads API with duplicate detection`.

### Task A-02: Convert lead → student (FR-ADM-02..05)

**Files:** `apps/api/src/modules/admissions/convert.service.ts` (+ route trong `leads.controller.ts`); test `apps/api/test/e2e/admissions-convert.e2e-spec.ts`

**Interfaces — Consumes:** `CounterService.next('student:<YYYY>', s): Promise<number>` → `HV${YYYY}${String(n).padStart(5,'0')}`, năm = `vnDay(clock.now()).slice(0,4)`, `UsersService.createStudentAccount(studentId, code, s)`, `EnrollmentsService.createPending(studentId, courseId, actor, s)`, `withTransaction` (`common/db/transaction.ts`), `AuditService.log`.
**Produces:** `POST /leads/:id/convert?force=` (M,S) → 201 `ConvertLeadResultDto`.

- [ ] **Step 1 (RED)** `describe('FR-ADM-03..05 Tạo hồ sơ từ lead')`:
  - `tạo student code /^HV2026\d{5}$/ (FakeClock 2026), user STUDENT username = code mustChangePassword, enrollment PENDING_PLACEMENT cho interestedCourseId, lead PROFILE_CREATED + studentId`.
  - `SĐT trùng student khác → 409 DUPLICATE_PERSON; ?force=true → 201 (hai anh em cùng SĐT)`; lead tự nó không bị tính trùng (D10).
  - `lead không tồn tại → 404 LEAD_NOT_FOUND`; `lead CANCELLED → 422 INVALID_STATUS_TRANSITION`; `convert lần hai → 409 PROFILE_EXISTS`; `2 convert song song cùng lead → 1×201, 1×409, đúng 1 student`.
  - **Nguyên tử:** override `EnrollmentsService` bằng `createTestApp({ overrides: [{ provide: EnrollmentsService, useValue: { createPending: () => { throw new Error('boom') } } }] })` → 500 và **không còn** student/user nào, lead vẫn NEW (file test riêng `admissions-convert-rollback.e2e-spec.ts` vì một app/file).
  - `20 convert song song 20 lead khác nhau → 20 mã khác nhau`.
  - `audit_logs có entity 'student' action create`.
  - `T, H → 403`.
- [ ] **Step 2–3:** RED → GREEN. Thứ tự trong transaction: claim lead (`findOneAndUpdate {_id, status: NEW, studentId: null}` → null thì phân biệt 404/409/422) → mã → student (`fullNameSearch = removeVietnameseTones(fullName)`) → user → link `student.userId` → createPending → audit.
- [ ] **Step 4:** commit `feat(admissions): convert lead to student`.

### Task A-03: Students search & detail (FR-STU-01, 02)

**Files:** `apps/api/src/modules/admissions/{students.controller,students.service}.ts`; test `apps/api/test/e2e/admissions-students.e2e-spec.ts`

**Consumes:** `ScopeService.teacherStudentIds(userId)`, `attendanceRate()` (Task 0).
**Produces:** `GET /students` (M,S,T) → `Paginated<StudentDto>` (T: `Paginated<StudentBriefDto>`); `GET /students/:id` (M,S → `StudentDetailDto`; T → `StudentTeacherViewDto` chỉ enrollments ở lớp của GV; H chỉ `user.studentId`); `GET /students/me` (H) → `StudentDetailDto` (route khai báo **trước** `:id`).

- [ ] **Step 1 (RED)** `describe('FR-STU-01/02 Học viên')`:
  - `q "nguyen van" khớp "Nguyễn Văn A"`; `q "dang" khớp "Đặng Thị B"`; `q theo code, phone "0912…", email`; `q "+84(" → 200 rỗng`; phân trang `limit=2` meta.total đúng; lọc `status`, `classId`, `courseId` (qua enrollments).
  - GV: `chỉ thấy HV ENROLLED/COMPLETED ở lớp mình (kể cả trợ giảng)`; `xem HV khác → 404`; response GV không có `email`, `address`, `summary`.
  - HV: `GET /students/:id chính mình → 200`, `người khác → 404`; `GET /students/me → 200`.
  - `deletedAt ≠ null → 404 (M cũng vậy)`; detail có `enrollments` và `summary {attendanceRate, averageScore: null, outstandingBalance: 0}` (D7).
  - `A → 403`.
- [ ] **Step 2–3:** RED → GREEN. `q` không dấu: escape regex rồi match `fullNameSearch` với `removeVietnameseTones(q).toLowerCase()`; code/phone/email bằng prefix regex đã escape.
- [ ] **Step 4:** commit `feat(admissions): student search and detail`.

### Task A-04: Students update, documents, audit (FR-STU-03, 04, FR-ADM-06)

**Files:** `apps/api/src/modules/admissions/{students.service,documents.service,documents.controller}.ts`; test `apps/api/test/e2e/admissions-students-update.e2e-spec.ts`

**Produces:** `PATCH /students/:id` (M,S) → `UpdateStudentResultDto`; `PATCH /students/me/contact` (H, `UpdateStudentContactInput`) → `UpdateStudentResultDto`; `POST /students/:id/documents` (M,S, multipart field `file`) → 201 `StudentDocumentDto`; `GET /students/:id/documents/:docId` (M,S, stream file với `Content-Disposition`); `DELETE …/:docId` → 204; `GET /students/:id/audit` (M,S, `StudentAuditQuery`) → `Paginated<AuditLogDto>`.

- [ ] **Step 1 (RED)** `describe('FR-STU-03/04 FR-ADM-06')`:
  - `PATCH fullName → audit before.fullName/after.fullName`; **`sau khi đổi tên, GET /students?q=<tên mới không dấu> tìm thấy`** (Review Focus 5).
  - `đổi SĐT trùng HV khác → 200, data.warnings.duplicates[0].kind 'STUDENT'`.
  - HV `/students/me/contact {phone}` → 200; `{fullName}` → 400; HV `PATCH /students/:id` → 403.
  - upload PDF 1KB → 201 và file tồn tại dưới `UPLOAD_DIR`; 6MB → 400 FILE_TOO_LARGE; `.exe` (`application/x-msdownload`) → 400 FILE_TYPE_NOT_ALLOWED; tải về đúng bytes; xóa → 204 và file bị xóa khỏi đĩa.
  - `T mọi route ghi/giấy tờ/audit → 403`; `GET /students/:id/audit` trả các bản ghi mới nhất trước.
  - Test đặt `process.env.UPLOAD_DIR` = thư mục tạm (`fs.mkdtempSync`) trước `createTestApp`, xóa ở `afterAll`.
- [ ] **Step 2–3:** RED → GREEN. Multer `memoryStorage` + `limits.fileSize = 5*1024*1024 + 1`; lỗi `LIMIT_FILE_SIZE` → `FILE_TOO_LARGE`; whitelist mime `image/png|image/jpeg|application/pdf` **và** đuôi file khớp; ghi file `UPLOAD_DIR/students/<studentId>/<docId><ext>` (không dùng tên gốc trong path). PATCH set lại `fullNameSearch` khi đổi `fullName`.
- [ ] **Step 4:** commit `feat(admissions): student update, documents, audit`.

### Task A-05: FE Tuyển sinh (DESIGN §4.3 trừ placement)

**Files:** `apps/web/src/features/admissions/{api.ts,hooks.ts,pages/{leads-page,lead-form-page,lead-detail-page}.tsx,components/{duplicate-dialog,convert-dialog}.tsx,__tests__/admissions.test.tsx}`

**Consumes:** `useCourses({ status: 'ACTIVE' })` từ `features/courses/hooks.ts` — **chưa có trong worktree này** (L-CATALOG song song): tạo `features/admissions/course-options.ts` gọi `apiGetPage<CourseDto>('courses', { status: 'ACTIVE', limit: 100 })`; Lead thay bằng hook catalog khi merge (ghi chú TODO có mã `W1-MERGE`).

- [ ] **Step 1 (RED):** `submit thiếu SĐT → "Vui lòng nhập số điện thoại" dưới ô SĐT, không gọi POST`; `409 DUPLICATE_PERSON → dialog "Có thể đã tồn tại" liệt kê tên/SĐT/mã HV, link "Xem hồ sơ" → /students/:id; "Vẫn lưu lead mới" → POST /leads?force=true`; `chi tiết lead → "Tạo hồ sơ học viên" → dialog hiện mã HV2026… và mật khẩu tạm, cảnh báo "chỉ hiển thị một lần"`; danh sách lọc trạng thái gửi `?status=NEW`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): admissions screens`.

### Task A-06: FE Học viên (DESIGN §4.4)

**Files:** `apps/web/src/features/students/{api.ts,hooks.ts,pages/{students-page,student-detail-page,my-profile-page}.tsx,components/{student-info-tab,student-documents-tab,student-audit-tab,student-edit-form}.tsx,__tests__/students.test.tsx}`

- [ ] **Step 1 (RED):** `gõ "ngu" nhanh → chỉ 1 request GET /students?q=ngu sau 300ms` (`vi.useFakeTimers` + `advanceTimersByTime`); `TEACHER ở /students/:id không thấy tab "Học phí", "Giấy tờ", "Lịch sử thay đổi"` (tab registry của Lead lọc theo role — test xác nhận); `sửa họ tên rồi bấm Hủy → ConfirmDialog "Bỏ thay đổi?"`; `HV /me/profile chỉ có ô SĐT, Email, Địa chỉ có thể sửa; lưu → PATCH /students/me/contact`; `PATCH trả warnings.duplicates → toast cảnh báo "Số điện thoại trùng với HV…"`; upload file > 5MB → lỗi ngay ở client, không gọi API (dùng `apiPostForm`).
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): students screens`.

---

## Lane L-CLASSES (worktree `../lc-L-CLASSES`)

### Task CL-01: Classes CRUD (FR-CLS-01..03)

**Files:** `apps/api/src/modules/classes/{classes.controller,classes.service,classes.mapper}.ts`; test `apps/api/test/e2e/classes.e2e-spec.ts`

**Produces:** `POST /classes` (M,S) → 201 `ClassDto`; `GET /classes/:id`; `PATCH /classes/:id` (M,S) `UpdateClassInput` (đổi `status` qua đây, theo `CLASS_TRANSITIONS`); event `DomainEvent.ClassFinished` payload `{ classId: string; at: Date; actorId: string }` qua `EventEmitter2.emitAsync` **sau** commit (L-ENROLL W2 nghe để chuyển ENROLLED → COMPLETED).

- [ ] **Step 1 (RED)** `describe('FR-CLS-01..03 Lớp học')`:
  - `it.each` thiếu code/name/courseId/level/teacherId/maxCapacity/startDate/endDate → 400 đúng field.
  - `code "ielts-01" khi có "IELTS-01" → 409 CLASS_CODE_EXISTS`; song song cùng code → 1×201, 1×409.
  - `level "C2" không thuộc course.levels → 400 fields.level`; `teacherId là ACADEMIC_STAFF → 400 fields.teacherId`; `assistantTeacherId không phải TEACHER → 400`; `defaultRoomId không tồn tại → 400`; `endDate < startDate → 400 fields.endDate`; course ARCHIVED → 400.
  - `PATCH maxCapacity 5 khi currentSize 8 → 422 CAPACITY_BELOW_CURRENT`; `PATCH {currentSize} → 400`.
  - `PLANNED → ONGOING → FINISHED ok`; `PLANNED → FINISHED → 422 INVALID_STATUS_TRANSITION`; `FINISHED → bất kỳ → 422`.
  - `→ FINISHED phát class.finished đúng một lần` (`jest.spyOn(t.app.get(EventEmitter2), 'emitAsync')`).
  - `T, H POST/PATCH → 403`; audit create/update `entity: 'class'`.
- [ ] **Step 2–3:** RED → GREEN. Đổi `maxCapacity` bằng `findOneAndUpdate({_id, currentSize: {$lte: max}})` (không đọc-rồi-ghi); đổi status bằng `findOneAndUpdate({_id, status: from})`. `courseName/teacherName` qua `$lookup` hoặc 2 truy vấn theo lô.
- [ ] **Step 4:** commit `feat(classes): classes CRUD and status transitions`.

### Task CL-02: Xóa / ngừng lớp (FR-CLS-04)

**Files:** `classes.service.ts`, `classes.controller.ts`; test `apps/api/test/e2e/classes-delete.e2e-spec.ts`

**Produces:** `DELETE /classes/:id` (M,S) → 204 hoặc 422 `CLASS_HAS_DEPENDENCIES` `details.reasons: ClassDependencyReason[]`; `POST /classes/:id/deactivate` (M,S) → `ClassDto` status INACTIVE (theo `CLASS_TRANSITIONS`; FINISHED → 422).

- [ ] **Step 1 (RED):** `lớp trống → 204, GET → 404`; `có enrollment ENROLLED → reasons chứa ACTIVE_STUDENTS`; `chỉ enrollment TRANSFERRED → [ENROLLMENT_HISTORY]`; `có session → SESSIONS`; `có grade (qua assessment của lớp) → GRADES`; `có invoice classId → INVOICES`; `nhiều loại → đủ lý do`; `deactivate PLANNED → INACTIVE`; `T → 403`. Dữ liệu phụ thuộc tạo bằng factory W0 (`makeSession`, `makeEnrollment`, `makeAssessment`/`makeGrade`, `makeInvoice` — xem `apps/api/test/factories/index.ts`).
- [ ] **Step 2–4:** RED → GREEN (kiểm tra phụ thuộc và xóa trong `withTransaction`; audit `delete`) → commit `feat(classes): delete with dependency check and deactivate`.

### Task CL-03: Tìm lớp & danh sách HV lớp (FR-CLS-05)

**Files:** `classes.service.ts`, `classes.controller.ts`; test `apps/api/test/e2e/classes-search.e2e-spec.ts`

**Consumes:** `ScopeService.teacherClassIds`, `studentClassIds`, `SettingsService` (threshold), `absenceRate()` (Task 0).
**Produces:** `GET /classes` (M,S,T,H; `ListClassesQuery`, `includePast` chỉ có tác dụng với H); `GET /classes/:id/students` (M,S,T) → `Paginated<ClassStudentDto>`.

- [ ] **Step 1 (RED)** `describe('FR-CLS-05 Tìm lớp')`:
  - `courseId+level+hasSeat=true loại lớp 20/20, lớp FINISHED, lớp INACTIVE`; `hasSeat=true chỉ PLANNED|ONGOING`.
  - GV: `chỉ lớp mình dạy hoặc trợ giảng`; `GET /classes/:id lớp khác → 404`.
  - HV: `mặc định chỉ lớp ENROLLED hiện tại`; `?includePast=true thêm lớp TRANSFERRED/COMPLETED`; `GET /classes/:id lớp không liên quan → 404`.
  - roster: `trả HV ENROLLED, absenceRate 0.25 & warning true khi threshold 0.2 (2 EXCUSED+UNEXCUSED / 8 bản ghi)`; `GV lớp khác → 404`; `H → 403`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(classes): class search and roster`.

### Task CL-04: FE Lớp học (DESIGN §4.5 phần lớp)

**Files:** `apps/web/src/features/classes/{api.ts,hooks.ts,pages/{classes-page,class-detail-page}.tsx,components/{class-form-dialog,class-students-tab,delete-class-dialog}.tsx,__tests__/classes.test.tsx}`

**Consumes:** teachers/courses/rooms qua `apiGet*` cục bộ trong `features/classes/api.ts` (`teachers`, `courses`, `rooms`) — Lead gộp về hook catalog khi merge (TODO `W1-MERGE`).

- [ ] **Step 1 (RED):** `CapacityBar 20/20 có màu đỏ` (role/aria `progressbar` aria-valuenow, class destructive); `dialog sửa: max 15 khi currentSize 18 → lỗi "Sĩ số tối đa không được nhỏ hơn sĩ số hiện tại (18)" ngay trên trường, không gọi PATCH`; `xóa → 422 reasons [ACTIVE_STUDENTS, SESSIONS] → hiển thị "Còn học viên đang học", "Đã có buổi học" + nút "Chuyển sang Ngừng hoạt động" → POST deactivate`; `TEACHER không thấy nút "Thêm lớp"`; tab Học viên hiện ⚠ cho dòng `warning: true`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): classes screens`.

---

## Lane L-SCHEDULE (worktree `../lc-L-SCHEDULE`)

### Task S-01: Conflict checker (FR-SCH-03, FR-PLT-02)

**Files:** `apps/api/src/modules/schedule/conflict-checker.ts`, `apps/api/src/modules/schedule/schedule.module.ts`; tests `apps/api/src/modules/schedule/conflict-checker.spec.ts` (thuần, bảng) + `apps/api/test/e2e/schedule-conflicts.e2e-spec.ts` (Mongo)

**Interfaces — Produces:**
```ts
export interface Slot { id?: string; roomId: string; teacherId: string; startAt: Date; endAt: Date }
export function overlaps(a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }): boolean; // a.start < b.end && b.start < a.end
export function findSlotConflicts(candidate: Slot, existing: Slot[]): Array<{ slot: Slot; kind: 'ROOM' | 'TEACHER' }>;
export class MongoScheduleConflictChecker implements ScheduleConflictChecker { findConflicts(q, s?) }
```
`ScheduleModule` providers + exports `{ provide: SCHEDULE_CONFLICT_CHECKER, useClass: MongoScheduleConflictChecker }`. Một bản ghi vừa trùng phòng vừa trùng GV → **hai** phần tử (`ROOM`, `TEACHER`).

- [ ] **Step 1 (RED)** bảng `it.each` (`describe('FR-SCH-03 Xung đột lịch')`): chồng hoàn toàn; chồng một phần đầu; chồng một phần cuối; nằm trong; **18:00–19:30 và 19:30–21:00 → không**; cùng phòng khác GV → ROOM; cùng GV khác phòng → TEACHER; cả hai → 2 phần tử. E2E: `buổi CANCELLED bỏ qua`; `excludeSessionId loại chính nó`; `placement test SCHEDULED cùng phòng → conflict có placementTestId`; `placement test status ≠ SCHEDULED bỏ qua` (enum `PlacementStatus`); conflict có `classCode`.
- [ ] **Step 2–4:** RED → GREEN (truy vấn `{status: SCHEDULED, startAt: {$lt: endAt}, endAt: {$gt: startAt}, $or: [{roomId},{teacherId}]}` trên sessions và placement_tests) → commit `feat(schedule): schedule conflict checker`.

### Task S-02: Tạo buổi & tạo lặp (FR-SCH-01..03)

**Files:** `apps/api/src/modules/schedule/{recurrence.ts,recurrence.spec.ts,schedule.service.ts,schedule.controller.ts,schedule.mapper.ts}`; test `apps/api/test/e2e/schedule-create.e2e-spec.ts`

**Interfaces:**
```ts
// recurrence.ts — thuần; giờ VN → instant bằng vnDateTime(day, hhmm) và lặp ngày bằng addVnDays (@lc/shared/time.ts), không tự cộng 7h
export function expandWeekly(input: { weekdays: number[]; startTime: string; endTime: string; fromDate: string; toDate: string }): Array<{ startAt: Date; endAt: Date }>;
```
Produces: `POST /sessions` → 201 `CreateSessionResultDto`; `POST /sessions/bulk` → 201 `BulkCreateSessionsResultDto` (`seriesId` chung); `POST /sessions/check-conflicts` (M,S; không ghi DB) → `CheckConflictsResultDto`. Tất cả `@Roles(MANAGER, ACADEMIC_STAFF)`.

- [ ] **Step 1 (RED):**
  - unit: `T2/T4/T6 18:00–19:30 từ 2026-01-05 đến 2026-01-30 → 12 buổi, buổi đầu 2026-01-05T11:00:00Z–12:30:00Z, buổi cuối 2026-01-30T11:00Z`; `weekdays [1,1,3] tháng 1/2026 (05–31) → 8 buổi không trùng` (Review Focus 2); `endTime ≤ startTime → throw`; `fromDate > toDate → []`.
  - e2e: bulk 12 buổi tạo đúng và có `seriesId`; `một buổi trùng phòng với buổi có sẵn → 409 SCHEDULE_CONFLICT details.conflicts (đủ danh sách) và sessions.count không đổi`; `buổi ngoài [class.startDate, class.endDate] → 422 SESSION_OUTSIDE_CLASS_RANGE` (cả single và bulk); `endTime ≤ startTime → 400`; `room.capacity 10 < class.maxCapacity 20 → 201 với warnings[0].code 'ROOM_TOO_SMALL'`; `check-conflicts không ghi DB`; `teacherId không phải TEACHER → 400 fields.teacherId`; `roomId INACTIVE → 400 fields.roomId`; `T, H → 403`; audit + `NotificationsService.notify` được gọi (chi tiết ở S-04).
- [ ] **Step 2–3:** RED → GREEN. Bulk: mở rộng → kiểm tra range tất cả → kiểm tra xung đột với DB **và giữa các buổi trong lô** → `insertMany` trong `withTransaction`; kiểm tra xung đột chạy **trong** transaction.
- [ ] **Step 4:** commit `feat(schedule): create single and recurring sessions`.

### Task S-03: Sửa & hủy (FR-SCH-04, 05)

**Files:** `schedule.service.ts`, `schedule.controller.ts`, `apps/api/src/modules/schedule/class-sessions.controller.ts` (`@Controller('classes')` cho `:id/sessions/cancel-future` — path thuộc lane schedule, module schedule); test `apps/api/test/e2e/schedule-update.e2e-spec.ts`

**Produces:** `PATCH /sessions/:id` (M,S) → `CreateSessionResultDto`; `POST /sessions/:id/cancel` (M,S) → `SessionDto`; `POST /classes/:id/sessions/cancel-future` (M,S) → `{ cancelled }`.

- [ ] **Step 1 (RED):** `đổi phòng gây xung đột → 409`; `đổi giờ không xung đột với chính nó → 200`; `id không tồn tại → 404`; `đổi giờ buổi đã điểm danh (attendanceTakenAt) → 422 SESSION_LOCKED`; `đổi giờ buổi đã qua → 422 SESSION_LOCKED`; `đổi phòng buổi đã qua → 422 SESSION_LOCKED`; `hủy lý do "" hoặc "   " → 400 REASON_REQUIRED`; `hủy buổi đã bắt đầu (clock giữa start và end) → 422 SESSION_NOT_CANCELLABLE`; `hủy buổi CANCELLED → 422 SESSION_NOT_CANCELLABLE`; `cancel-future chỉ hủy startAt > now, trả {cancelled: n}, buổi đang diễn ra giữ nguyên`; `cancel-future lý do rỗng → 400 REASON_REQUIRED`; `T → 403`.
- [ ] **Step 2–4:** RED → GREEN (cập nhật/hủy bằng `findOneAndUpdate` có điều kiện `status: SCHEDULED, startAt: {$gt: now}`) → commit `feat(schedule): update and cancel sessions`.

### Task S-04: Xem lịch & thông báo (FR-SCH-06..08)

**Files:** `schedule.service.ts`, `schedule.controller.ts`, `apps/api/src/modules/schedule/schedule-notifier.ts`; test `apps/api/test/e2e/schedule-view.e2e-spec.ts`

**Consumes:** `ScopeService.teacherClassIds`, `studentClassIds('current'|'history')`, `NotificationsService.notify(userIds, { type, title, body, refType: NotificationRefType.SESSION, refId })` (`body` bắt buộc; bulk: `refType: CLASS`, `refId: classId`).
**Produces:** `GET /sessions` (`@Roles(MANAGER, ACADEMIC_STAFF, TEACHER, STUDENT)`) → `{ data: SessionDto[] }` (không phân trang; giới hạn 92 ngày); `GET /sessions/:id` cùng phạm vi, ngoài phạm vi → 404.

- [ ] **Step 1 (RED)** `describe('FR-SCH-06..08')`:
  - `thiếu from → 400`; `to - from = 93 ngày → 400 VALIDATION_FAILED fields.to`; `to < from → 400`.
  - HV: `thấy buổi tương lai lớp ENROLLED; buổi đã qua của lớp đã TRANSFERRED; không thấy buổi tương lai của lớp đã TRANSFERRED`.
  - GV: `thấy buổi lớp mình (chính/trợ giảng) + buổi mình dạy thay ở lớp khác; GET /sessions/:id buổi lớp khác không dạy thay → 404`.
  - M/S: lọc `classId`, `teacherId`, `roomId`.
  - `completed: true khi attendanceTakenAt ≠ null và endAt < now; false khi chưa điểm danh`.
  - Thông báo: `tạo bulk → notify một lần với [teacherId, assistantTeacherId, userId của HV ENROLLED] type SESSION_CREATED`; `sửa → SESSION_UPDATED`; `hủy → SESSION_CANCELLED`; HV `WAITING_CLASS`/`TRANSFERRED` không nhận. Assert qua collection `notifications` (`userId` set).
  - `A → 403`.
- [ ] **Step 2–4:** RED → GREEN (notify sau commit transaction; bulk gửi **một** thông báo/người cho cả series) → commit `feat(schedule): schedule views and notifications`.

### Task S-05: FE Lịch (DESIGN §4.6)

**Files:** `apps/web/src/features/schedule/{api.ts,hooks.ts,pages/schedule-page.tsx,components/{schedule-calendar,session-form-dialog,session-detail-sheet,class-schedule-tab}.tsx,recurrence-preview.ts,__tests__/schedule.test.tsx}`

**Interfaces:** `countRecurrence(input): number` trong `recurrence-preview.ts` (thuần, cùng quy tắc với `expandWeekly`, chỉ đếm theo ngày — không cần UTC).

- [ ] **Step 1 (RED):** `dialog Lặp lại chọn T2,T4,T6 18:00–19:30 05/01–30/01/2026 → "Sẽ tạo 12 buổi"`; `bấm "Kiểm tra xung đột" → MSW trả 1 xung đột → ConflictList hiển thị và nút "Tạo" disabled`; `đổi giờ sau khi có xung đột → nút Tạo vẫn disabled tới khi kiểm tra lại`; `hủy buổi → ReasonDialog, lý do rỗng không cho xác nhận`; `viewport 375px (apps/web/test/media.ts) → mặc định chế độ danh sách (listWeek)`; `GET /sessions trả [] → "Chưa có lịch học"`; `TEACHER không thấy nút "Tạo lịch"`; tab Lịch học trong `/classes/:id` gọi `GET /sessions?classId=…`.
- [ ] **Step 2–4:** RED → GREEN (FullCalendar `@fullcalendar/react` + timegrid/daygrid/list; khoảng `from/to` lấy từ `datesSet`) → commit `feat(web): schedule screens`.

---

### Task M: Lead — merge Wave 1

**Files:** `apps/web/src/features/{admissions,classes}/**` chỉ để gỡ TODO `W1-MERGE` (Lead được phép khi merge), `TASK.md`, `docs/superpowers/wave1-ledger.md`

- [ ] **Step 1:** Mỗi lane: `git -C ../lc-<LANE> rebase main` → `bash scripts/merge-gate.sh <LANE>` xanh (ownership + lint + typecheck + test + e2e).
- [ ] **Step 2:** Merge tuần tự `--no-ff` theo thứ tự L-CATALOG → L-CLASSES → L-SCHEDULE → L-ADMISSIONS; sau **mỗi** merge chạy `bash scripts/merge-gate.sh` trên `main`.
- [ ] **Step 3:** Gỡ TODO `W1-MERGE`: thay `features/admissions/course-options.ts` và api cục bộ của classes bằng `useCourses`/`useTeachers`/`useRooms` của catalog; test FE vẫn xanh. Commit `refactor(web): reuse catalog hooks`.
- [ ] **Step 4:** Smoke: `pnpm --filter api seed:demo --reset`, chạy 3 dev server, Playwright (Chrome hệ thống) đăng nhập M → tạo khóa, lớp, lịch lặp, lead → convert; T → thấy lịch; H → thấy lịch lớp mình.
- [ ] **Step 5:** Full verification `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && bash scripts/__tests__/merge-gate.test.sh && bash scripts/fr-coverage.sh` → xanh; tick ô W1 trong `TASK.md`; `git tag w1`; xóa worktree lane.
