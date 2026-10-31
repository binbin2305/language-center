# Wave 2 — Xếp lớp, Điểm danh, Kết quả, Học phí Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiện thực TASK.md Wave 2 — Kiểm tra đầu vào & Xếp lớp (L-ENROLL), Điểm danh (L-ATTENDANCE), Kết quả học tập (L-GRADES), Học phí (L-FEES) — API + màn hình, nối hợp đồng chéo, rồi merge thành `main` có tag `w2`.

**Architecture:** Lead làm Task 0 (hợp đồng + hạ tầng dùng chung, tuần tự) trên `main`. Sau đó 4 lane song song, mỗi lane một worktree `../lc-<LANE>` nhánh `lane/<LANE>` (`scripts/lane-start.sh`), chỉ sửa file trong `scripts/lane-owners.json`. Trong lane task chạy tuần tự (API trước, FE sau). Hợp đồng chéo đi qua token DI (`INVOICE_CREATOR`, `OUTSTANDING_CHECKER`): lane tiêu thụ test bằng fake (`createTestApp({ overrides })`), lane L-FEES cung cấp bản thật; Task M nối dây và chạy toàn chuỗi.

**Tech Stack:** như W1 — NestJS 11, Mongoose 8, zod 3, `@nestjs/event-emitter@3`, pdfmake 0.3, Jest + supertest + MongoMemoryReplSet; React 18, TanStack Query 5, react-hook-form, shadcn/ui, Vitest + RTL + MSW 2.

**Spec:** `PRD.md` §3, §4.1–4.3 (FR-ADM-06/07, FR-PLT-*, FR-CLS-06..12), §4.6–4.8; `BACKEND_SCHEMA.md` §2.8–2.9, §2.12–2.17, §3.3 (Enrollments & Placement, Attendance, Grades, Fees); `DESIGN.md` §4.3 (placement), §4.5, §4.7–4.9; `ARCHITECTURE.md` §4.3–4.6; `RULES.md`; `TASK.md` (Wave 2); `docs/DECISIONS.md` (đặc biệt **Lock-key protocol**); `docs/superpowers/wave1-ledger.md`.

## Global Constraints
- Mọi shell: `export PATH=/opt/homebrew/bin:$PATH`. Commit: `git -c user.name=huybin2305 -c user.email=huybin2305@gmail.com commit …`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RULES.md nguyên văn: TDD (**RED phải chạy và fail đúng lý do trước GREEN — dán output RED vào báo cáo**), test tên tiếng Việt có mã FR, mỗi endpoint có test quyền (**mỗi** role không được phép → 403, kể cả ADMIN; ngoài phạm vi → 404), controller mỏng, `@Roles` tường minh trên mọi route (handler `@Roles` **thay thế** class `@Roles`), input qua `ZodValidationPipe(<schema @lc/shared>)`, `toDto` (không trả document), `withTransaction` cho ghi nhiều document, `ClockService.now()`, `AuditService.log` trong cùng transaction với thao tác ghi.
- Lane **không** sửa `packages/shared`, `apps/api/src/{common,database}`, `apps/api/test/{helpers,factories}` (trừ `<lane>.extra.ts`), `app.module.ts`, `apps/web/src/{router.tsx,lib,layouts,auth,components}`, `apps/web/test/msw/handlers.ts`, `package.json`, lockfile. Thiếu hợp đồng → `docs/contract-requests/<lane>-<n>.md` và làm phần khác.
- Ngày-only: lưu `fromDateOnly(day)`, trả `toDateOnly(d)`, cộng ngày bằng `addVnDays`; **cấm** `toISOString().slice(0,10)`.
- **Lock-key protocol** (`docs/DECISIONS.md`): bump `CounterService.next('lock:…', s)` trong transaction **trước** khi đọc bất biến. Trong transaction không chạy song song trên cùng `ClientSession` (`Promise.all` với `s` bị cấm).
- `clockHolder` global theo process: mỗi file e2e một `createTestApp()` (`beforeAll`) + `t.close()` (`afterAll`). Test cần override provider khác → file riêng. `DEFAULT_NOW = 2026-01-05T02:00:00Z` (09:00 T2 05/01/2026 VN).
- Factory sinh mã ngoài không gian dịch vụ (`HD199901…`, `PT199901…`, `F-…`); test kiểm mã thật (`HD2026…`) phải đi qua service.
- Malformed ObjectId → 404 (CastError, DECISIONS). Lỗi theo `ErrorCode`/HTTP status trong `packages/shared/src/errors.ts`.
- Mỗi task kết thúc: `pnpm --filter api test:e2e -- <file>` (hoặc `pnpm --filter web test -- <dir>`) xanh, `pnpm lint && pnpm typecheck` xanh, commit conventional (`feat(<module>): …`).
- FE: gọi API chỉ qua `features/<m>/api.ts` + `features/<m>/hooks.ts`; test ở `features/<m>/__tests__/`, mock bằng `server.use(...)`; mặc định MSW của lane đặt trong `apps/web/test/msw/<lane-file>.handlers.ts` (Task 0 đã nối sẵn vào `handlers.ts`); render bằng `renderApp({ user: makeUser(Role.X), route })`; ẩn/hiện bằng `can(user, permission)`; lỗi qua `lib/error-messages.ts`; badge qua `StatusBadge` (`lib/status.ts`); trang lazy: chờ lần render đầu bằng `findBy…(…, {}, { timeout: 10_000 })`.
- Dùng lại, không khai báo lại: `escapeRegex`, `isDuplicateKey` (`common/util`), `absenceRate`/`attendanceRate`, `weightedAverage`/`classify`/`isPass`/`isValidScore`, `applyDiscount`/`isValidDiscount`, `canTransition` + `ENROLLMENT_TRANSITIONS` (`@lc/shared`).

## Review Focus
1. **Hai thao tác đồng thời cùng tài nguyên hữu hạn** — 10 xếp lớp vào lớp còn 1 chỗ, 2 thanh toán song song vượt nợ, chuyển lớp song song vào lớp đích còn 1 chỗ, 2 lần PUT điểm danh lần đầu song song. Chỉ một thành công, sĩ số/tiền không bao giờ vượt. Test: E-03 (10 song song), E-04 (2 transfer song song vào lớp đích 1 chỗ → 1×200, 1×422 CLASS_FULL, sĩ số lớp nguồn chỉ giảm 1), F-03 (2 payment song song), AT-01 (2 PUT song song → 1×200, 1×409 ATTENDANCE_ALREADY_TAKEN, không trùng bản ghi).
2. **Học viên rời lớp giữa chừng vẫn thấy lịch sử, không thấy hiện tại** (FR-CLS-12) — HV TRANSFERRED/RESERVED vẫn xem điểm danh, điểm (đã confirm), hóa đơn lớp cũ; không có mặt trong roster điểm danh buổi sau ngày rời; không bị bắt buộc có điểm khi confirm bài mới. Test: AT-01 (roster theo thời điểm), AT-03 (HV TRANSFERRED xem được lịch sử lớp cũ), G-02 (HV TRANSFERRED không nằm trong danh sách bắt buộc của `confirm:true`, vẫn xem điểm cũ), F-04 (HV TRANSFERRED vẫn thấy hóa đơn).
3. **Ranh giới ngày giờ VN** — hạn hóa đơn đúng ngày hôm nay chưa quá hạn; khóa bảng điểm đúng biên `heldOn + gradeLockDays`; cửa sổ sửa điểm danh GV 7 ngày; điểm danh sớm hơn 15'. Test: F-03 (overdue biên), G-03 (biên 23:59 VN ngày cuối → sửa được, 00:00 VN ngày kế → 422), AT-02 (endAt + 7 ngày − 1 phút → 200, +1 phút → 422), AT-01 (startAt − 15' đúng → 200, −16' → 422).
4. **Vòng đời hóa đơn qua chuyển lớp / bảo lưu / học lại / rút** — luôn đúng một hóa đơn TUITION cho một chuỗi enrollment; rút khi chưa đóng → VOID; đã đóng một phần → giữ. Test: F-01 (idempotent + chuỗi `transferredFromId`), E-04 (resume → assign gọi InvoiceCreator, `invoiceId` giữ nguyên), Task M flow test thật.
5. **Giáo viên trợ giảng và dạy thay** — trợ giảng tạo bài/nhập điểm/điểm danh như GV chính; GV dạy thay điểm danh được buổi mình dạy nhưng `GET /attendance?classId=<lớp đó>` → `data []` (không thuộc `teacherClassIds`); GV không phân công chấm đợt kiểm tra → 404. Test: AT-01, AT-03, G-01, E-02.

---

## Lead decisions (đã chốt, lane không tranh luận lại)
- **D11 InvoiceCreator trả id:** `createForEnrollment(enrollmentId, s): Promise<Types.ObjectId | null>` (id hóa đơn TUITION hiện có hoặc mới tạo; no-op trả `null`). L-ENROLL ghi `enrollment.invoiceId` từ giá trị trả về (fees không ghi enrollments). Hóa đơn của một chuỗi enrollment xác định bằng `enrollment.invoiceId` → nếu null thì `invoices{enrollmentId, kind: TUITION}` → nếu null thì đi ngược `transferredFromId`. Chuyển lớp **không** gọi InvoiceCreator; enrollment mới sao chép `invoiceId` của enrollment cũ. `invoice.classId` giữ lớp gốc (không đổi khi chuyển lớp).
- **D12 FEES_OUTSTANDING = 403** (PRD FR-GRD-07 thắng `errors.ts` W0 đang để 422). Task 0 sửa.
- **D13 Roster điểm danh theo thời điểm:** HV thuộc roster buổi `s` khi tồn tại enrollment `e` có `e.classId = s.classId` và `s.startAt` nằm trong một **đoạn ENROLLED** của `e`: từ `at` của mục history `to: ENROLLED` tới `at` của mục history kế tiếp có `from: ENROLLED` sang `TRANSFERRED|RESERVED|CANCELLED` (mở nếu chưa có; `COMPLETED` **không** đóng đoạn). Hàm thuần `enrolledAt(history, instant): boolean` trong `modules/attendance/roster.ts`.
- **D14 Roster điểm (grades):** HV bắt buộc có điểm khi `confirm:true` = enrollment của lớp có status `ENROLLED|COMPLETED` tại lúc ghi. Điểm của HV đã rời lớp được giữ, vẫn trả trong `GET /assessments/:id/grades` (cờ `left: true`), không bắt buộc.
- **D15 Kết quả kiểm tra đầu vào:** `PUT /placement-tests/:id/results` ghi đè theo từng thí sinh (idempotent). Thí sinh có `score` **và** `level` khác null → enrollment `PENDING_PLACEMENT → WAITING_CLASS` (`placementLevel`, `waitingSince = now`, history); enrollment đã `WAITING_CLASS` do chính đợt này → chỉ cập nhật `placementLevel`; enrollment ở trạng thái khác → cả request 422 `ENROLLMENT_INVALID_STATE` `details.enrollmentIds`. Mọi thí sinh đã có kết quả → đợt `COMPLETED`. Một enrollment không được là thí sinh của hai đợt `SCHEDULED` cùng lúc (422 `ENROLLMENT_INVALID_STATE`); thêm lại thí sinh đã có trong đợt = bỏ qua.
- **D16 Cửa sổ & khóa:** GV sửa điểm danh khi `now < session.endAt + settings.teacherAttendanceEditDays × 24h`; S không giới hạn; M không có quyền ghi điểm danh (BACKEND_SCHEMA: PUT/PATCH = T, S). Bảng điểm: `lockedAt = startOfVnDay(addVnDays(heldOn, gradeLockDays))`; `isLocked = now ≥ lockedAt && !(unlockedUntil > now)`; khóa chặn **mọi** ghi điểm (PUT nháp, PUT confirm, PATCH sửa).
- **D17 Cảnh báo vắng:** sau mỗi PUT/PATCH điểm danh (sau commit), với từng HV của buổi tính `absenceRate` trên mọi bản ghi của HV **trong lớp đó**; `> threshold` và chưa có `attendance_warnings{studentId,classId}` → insert (unique index chặn trùng khi đua) + `notify([userId HV, mọi user ACADEMIC_STAFF ACTIVE], ATTENDANCE_WARNING, refType STUDENT)`; `≤ threshold` và có warning → xóa. `AttendanceStatsService.warningFlags(classId): Promise<Map<string, { absenceRate: number; warning: boolean }>>` (key = studentId string) export từ `AttendanceModule`.
- **D18 Contract test trong lane:** lane tiêu thụ token chỉ test bằng fake qua `createTestApp({ overrides: [{ provide: INVOICE_CREATOR | OUTSTANDING_CHECKER, useValue }] })`; dữ liệu invoice thật được kiểm ở Task M (flow test). L-FEES test implementation thật trực tiếp qua `t.app.get(INVOICE_CREATOR)` sau khi FeesModule provide nó.
- **D19 Banner xác nhận lớp** (E-06): component `ConfirmClassBanner` export từ `features/enrollments`, hiển thị trên `/me/classes`; Task M gắn vào trang chủ HV (`features/home/pages/student-home.tsx`, Lead khi merge).
- **D20 Tổng chân bảng `/fees`** = tổng các dòng của trang hiện tại (không thêm endpoint).
- **D21 Thông báo W2:** assign/transfer → `CLASS_ASSIGNED` tới user HV (refType `CLASS`, refId lớp); confirm điểm → `GRADES_PUBLISHED` tới HV của roster (refType `ASSESSMENT`); quyết định giảm giá → `DISCOUNT_DECIDED` tới người đề xuất (refType `INVOICE`); thanh toán → `PAYMENT_RECORDED` tới user HV (refType `INVOICE`). Gửi **sau** commit; lỗi notify chỉ log.

---

## File Structure

```
packages/shared/src/                               (Task 0, Lead)
  events.ts               + ClassFinishedPayload
  errors.ts               FEES_OUTSTANDING → 403 (D12)
  schemas/invoices.ts     + InvoiceTeacherViewDto
  schemas/attendance.ts   SessionAttendanceDto += takenAt, takenByName, editable, roster[].history, roster[].absenceRate
  schemas/grades.ts       + AssessmentGradesDto
  schemas/placement.ts    PlacementTestDto += courseName?, roomCode?, teacherName?
apps/api/src/common/contracts/invoice-creator.ts   D11 (+ spec)
apps/api/src/common/pdf/{pdf.service.ts,pdf.service.spec.ts}   PdfService (CommonModule export)
apps/api/test/helpers/pdf-text.ts                  pdfText(buf) (dev dep pdf-parse)
apps/web/src/lib/status.ts                         + placement, assessment, payment, discount
apps/web/src/features/notifications/notification-target.ts  + ENROLLMENT, PLACEMENT_TEST
apps/web/test/msw/{enrollments,placement,attendance,grades,fees}.handlers.ts (rỗng) + handlers.ts

apps/api/src/modules/enrollments/{enrollments.controller,enrollments.service,assignment.service,enrollments.mapper,class-finished.listener}.ts
apps/api/src/modules/placement/{placement.controller,placement.service,placement.mapper}.ts
apps/api/src/modules/attendance/{attendance.controller,session-attendance.controller,attendance.service,attendance-stats.service,roster.ts,roster.spec.ts,attendance.mapper}.ts
apps/api/src/modules/grades/{assessments.controller,grades.controller,results.controller,grades.service,results.service,transcript.ts,grades.mapper}.ts
apps/api/src/modules/fees/{invoices.controller,payments.controller,invoice-creator.service,outstanding-checker.service,invoices.service,payments.service,receipt.ts,fees.mapper}.ts
apps/api/test/e2e/<lane-prefix>-<topic>.e2e-spec.ts   (glob lane-owners: enrollments*, placement*, attendance*, grades*, fees*)
apps/web/src/features/{enrollments,placement,attendance,grades,fees}/{api.ts,hooks.ts,pages/*,components/*,__tests__/*}
apps/web/src/features/admissions/pages/placement-{page,detail-page,grade-page}.tsx  (L-ENROLL)
```

---

### Task 0: Lead — chuẩn bị Wave 2 (tuần tự, trước khi mở lane)

**Files:**
- Modify: `packages/shared/src/{events,errors}.ts`, `packages/shared/src/schemas/{invoices,attendance,grades,placement}.ts`, tests `packages/shared/src/__tests__/*`
- Modify: `apps/api/src/common/contracts/{invoice-creator.ts,contracts.module.spec.ts}`, `apps/api/src/common/common.module.ts`
- Create: `apps/api/src/common/pdf/pdf.service.ts` (+ `.spec.ts`), `apps/api/test/helpers/pdf-text.ts`
- Modify: `apps/api/package.json` + lockfile (devDependency `pdf-parse` hoặc tương đương chạy được dưới ts-jest CJS)
- Modify: `apps/web/src/lib/status.ts`, `apps/web/src/features/notifications/notification-target.ts` (+ test), `apps/web/test/msw/handlers.ts`; Create `apps/web/test/msw/{enrollments,placement,attendance,grades,fees}.handlers.ts`
- Modify: `docs/DECISIONS.md` (D11–D21), `TASK.md` (đánh dấu `[~]`)

**Interfaces — Produces:**
```ts
// events.ts
export interface ClassFinishedPayload { classId: string; at: Date; actorId: string }
// invoices.ts — FR-FEE-06 view của GV (không có payments, discount, amountDue)
export const InvoiceTeacherViewDto = InvoiceDto.pick({ id: true, code: true, kind: true, studentId: true,
  studentName: true, studentCode: true, classId: true, balance: true, dueDate: true, status: true, overdue: true });
// attendance.ts
SessionAttendanceDto // += takenAt: zDateTime.nullable(), takenByName: z.string().nullable(), editable: z.boolean(),
                     //    roster[].history: z.array(AttendanceHistoryEntry), roster[].absenceRate: z.number().min(0).max(1)
// grades.ts
export const AssessmentGradesDto = z.object({ assessment: AssessmentDto, rows: z.array(z.object({
  studentId: zObjectId, enrollmentId: zObjectId, studentCode: z.string(), studentName: z.string(),
  score: zScoreShape, comment: z.string().nullish(), isDraft: z.boolean(), left: z.boolean(),
  history: z.array(GradeHistoryEntry) })) });
// placement.ts
PlacementTestDto // += courseName: z.string().optional(), roomCode: z.string().optional(), teacherName: z.string().optional()
// common/contracts/invoice-creator.ts (D11)
createForEnrollment(enrollmentId: Types.ObjectId, s: ClientSession): Promise<Types.ObjectId | null>;
// common/pdf/pdf.service.ts — font Roboto (có glyph tiếng Việt) từ pdfmake
@Injectable() export class PdfService { render(def: TDocumentDefinitions): Promise<Buffer> }
// test/helpers/pdf-text.ts
export function pdfText(buf: Buffer): Promise<string>;
// web lib/status.ts
StatusGroup += 'placement' (SCHEDULED Đã lên lịch/info, COMPLETED Đã chấm/success, CANCELLED Đã hủy/muted)
            | 'assessment' (DRAFT Nháp/muted, CONFIRMED Đã xác nhận/success, LOCKED Đã khóa/muted)
            | 'payment' (VALID Hợp lệ/success, VOIDED Đã hủy/muted strike)
            | 'discount' (PENDING_APPROVAL Chờ duyệt/warning, APPROVED Đã duyệt/success, REJECTED Từ chối/destructive)
// notification-target.ts
ENROLLMENT → STUDENT '/me/classes', khác null; PLACEMENT_TEST → TEACHER `/admissions/placement/${id}/grade`, M/S `/admissions/placement/${id}`
// msw: export const enrollmentsHandlers / placementHandlers / attendanceHandlers / gradesHandlers / feesHandlers: RequestHandler[] = [];
```

- [ ] **Step 1 (RED):** shared: `ErrorHttpStatus.FEES_OUTSTANDING === 403`; parse `InvoiceTeacherViewDto` loại bỏ `payments`/`amountPaid` (strip), `AssessmentGradesDto` với `left`, `SessionAttendanceDto` có `editable`. API: `contracts.module.spec` no-op `createForEnrollment` → `null`; `pdf.service.spec`: `render({ content: 'Nguyễn Văn Ánh' })` → Buffer bắt đầu `%PDF`, `pdfText(buf)` chứa `Nguyễn Văn Ánh`. Web: `notificationTarget(ENROLLMENT, id, STUDENT) === '/me/classes'`, `(PLACEMENT_TEST, id, TEACHER) === '/admissions/placement/<id>/grade'`; `statusLabel('discount','PENDING_APPROVAL') === 'Chờ duyệt'`.
- [ ] **Step 2:** `pnpm --filter @lc/shared test`, `pnpm --filter api test -- contracts pdf`, `pnpm --filter web test -- notification lib/status` → FAIL đúng lý do.
- [ ] **Step 3 (GREEN):** hiện thực các mục Interfaces; `PdfService` thêm vào `CommonModule` providers + exports; các file MSW rỗng spread vào `handlers.ts`.
- [ ] **Step 4:** ghi D11–D21 vào `docs/DECISIONS.md`. `pnpm --filter @lc/shared build`.
- [ ] **Step 5:** full verification `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && bash scripts/__tests__/merge-gate.test.sh` → xanh. Commit `chore(shared): wave 2 contracts`, `feat(api): pdf service and invoice-creator returns id`, `chore(web): wave 2 status groups, notification targets, msw slots`.
- [ ] **Step 6:** `bash scripts/lane-start.sh L-ENROLL` (và L-ATTENDANCE, L-GRADES, L-FEES); mỗi worktree `pnpm install --frozen-lockfile` xanh (build shared dist).

---

## Lane L-ENROLL (worktree `../lc-L-ENROLL`)

`EnrollmentsModule` thêm `controllers: [EnrollmentsController]`; `PlacementModule` `imports: [ScheduleModule, EnrollmentsModule]` (ScheduleModule bắt buộc import tường minh để có `SCHEDULE_CONFLICT_CHECKER` thật). Không import FeesModule (Task M làm).

### Task E-01: Đăng ký khóa & đổi khóa (FR-ADM-06 phần khóa, FR-ADM-07)

**Files:** `apps/api/src/modules/enrollments/{enrollments.controller,enrollments.service,enrollments.mapper}.ts`; test `apps/api/test/e2e/enrollments-register.e2e-spec.ts`

**Interfaces — Produces:**
- `toEnrollmentDto(doc, labels?)` trong `enrollments.mapper.ts` (labels: studentName/studentCode/courseName/className).
- `POST /enrollments` (M,S,H; `CreateEnrollmentInput`; H dùng `user.studentId` (gửi `studentId` khác của mình → 400 `fields.studentId`); M/S thiếu `studentId` → 400 `fields.studentId`) → 201 `EnrollmentDto`. Course phải ACTIVE (ARCHIVED → 400 `fields.courseId`).
- `GET /enrollments` (M,S; `ListEnrollmentsQuery`) → `Paginated<EnrollmentDto>` có labels; `GET /enrollments/me` (H) → `{ data: EnrollmentDto[] }` có `className`, `courseName`. Route `me`, `waiting` khai báo **trước** `:id`.
- `PATCH /enrollments/:id/course` (M,S,H; `ChangeEnrollmentCourseInput`) → `EnrollmentDto`: chỉ `PENDING_PLACEMENT` (khác → 422 `ENROLLMENT_INVALID_STATE`); trùng enrollment hoạt động ở khóa mới → 409 `ENROLLMENT_EXISTS` (map E11000); H chỉ enrollment của mình (khác → 404). Ghi history (`from = to = PENDING_PLACEMENT`, reason `COURSE_CHANGED`) + audit.

- [ ] **Step 1 (RED)** `describe('FR-ADM-06/07 Đăng ký khóa học')`: `HV tự đăng ký khóa → 201 PENDING_PLACEMENT, studentId = của mình`; `HV gửi studentId người khác → 400 VALIDATION_FAILED fields.studentId`; `trùng hoạt động → 409 ENROLLMENT_EXISTS`; `S tạo cho HV → 201`; `S thiếu studentId → 400`; `course ARCHIVED → 400`; `HV đổi khóa khi PENDING_PLACEMENT → 200 courseId mới`; `khi WAITING_CLASS → 422 ENROLLMENT_INVALID_STATE`; `HV đổi enrollment của người khác → 404`; `đổi sang khóa đã có enrollment hoạt động → 409`; `GET /enrollments/me chỉ của mình`; `GET /enrollments?status=… lọc`; `T, A mọi route → 403`; `H GET /enrollments → 403`.
- [ ] **Step 2:** `pnpm --filter api test:e2e -- enrollments-register` → FAIL (404 route).
- [ ] **Step 3 (GREEN):** tạo dùng lại `createPending`; đổi khóa bằng `findOneAndUpdate({_id, status: PENDING_PLACEMENT, ...scope})`, null → phân biệt 404/422.
- [ ] **Step 4:** xanh → commit `feat(enrollments): self-registration and course change`.

### Task E-02: Kiểm tra đầu vào (FR-PLT-01..04)

**Files:** `apps/api/src/modules/placement/{placement.controller,placement.service,placement.mapper}.ts`, `enrollments.service.ts` (+ `markPlaced`, `skipPlacement`), `enrollments.controller.ts` (skip-placement); test `apps/api/test/e2e/placement.e2e-spec.ts`

**Interfaces:**
- Consumes: `@Inject(SCHEDULE_CONFLICT_CHECKER) findConflicts({ roomId, teacherId, startAt, endAt, excludePlacementTestId }, s)`; `CounterService.next('lock:room:<id>')` rồi `'lock:teacher:<id>'` trước khi kiểm xung đột (create + update đổi giờ/phòng/GV).
- Produces (EnrollmentsService, dùng trong transaction của placement): `markPlaced(enrollmentId, level: string, actor, s): Promise<void>` (D15), `skipPlacement(id, { level, reason }, actor): Promise<EnrollmentDoc>`.
- Routes: `GET /placement-tests` (M,S; T chỉ đợt `teacherId = user`) `ListPlacementTestsQuery` → `Paginated<PlacementTestDto>` có labels; `POST` (M,S) → 201; `GET/PATCH /placement-tests/:id` (GET: M,S,T scope; PATCH: M,S; đổi status CANCELLED được, đợt COMPLETED/CANCELLED không sửa → 422 `INVALID_STATUS_TRANSITION`); `POST /:id/candidates` (M,S) → `PlacementTestDto`; `PUT /:id/results` (T được phân công; GV khác → 404; M,S → 403) → `PlacementTestDto`; `POST /enrollments/:id/skip-placement` (M,S) → `EnrollmentDto`.

- [ ] **Step 1 (RED)** `describe('FR-PLT-01..04 Kiểm tra đầu vào')`:
  - `tạo đợt trùng phòng với session SCHEDULED → 409 SCHEDULE_CONFLICT details.conflicts`; `trùng GV với đợt khác → 409`; `endAt ≤ startAt → 400`; `teacherId không phải TEACHER → 400 fields.teacherId`; `room INACTIVE → 400 fields.roomId`; `PATCH đổi giờ gây xung đột → 409`, `đổi giờ không xung đột với chính nó → 200`; sau tạo có counter `lock:room:<roomId>`.
  - `thêm thí sinh enrollment WAITING_CLASS → 422 ENROLLMENT_INVALID_STATE`; `enrollment khác khóa của đợt → 422 COURSE_MISMATCH`; `thêm lại thí sinh đã có → bỏ qua (candidates.length không đổi)`; `enrollment đang là thí sinh của đợt SCHEDULED khác → 422`.
  - `GV được phân công PUT results → 200`; `GV khác → 404`; `S → 403`; `score 10.25 → 400 SCORE_OUT_OF_RANGE details.enrollmentIds`; `score 11 → 400`; `level "Z9" không thuộc course.levels → 400 fields.level`; `enrollmentId không phải thí sinh → 400 VALIDATION_FAILED`.
  - `có score+level → enrollment WAITING_CLASS, placementLevel, waitingSince = now, history PENDING_PLACEMENT→WAITING_CLASS`; `PUT lại đổi level → placementLevel mới, history không thêm mục`; `chỉ có score, level null → enrollment giữ PENDING_PLACEMENT`; `đủ mọi thí sinh → đợt COMPLETED`; `enrollment đã skip-placement trước → PUT results 422`.
  - `skip-placement lý do rỗng → 400 REASON_REQUIRED`; `có lý do → WAITING_CLASS + placementSkipped {reason,by,at} + placementLevel`; `enrollment không PENDING_PLACEMENT → 422`; `level không thuộc khóa → 400`.
  - `GET /placement-tests` GV chỉ đợt của mình; `GET /:id` GV khác → 404; `H, A → 403` mọi route.
- [ ] **Step 2:** RED → FAIL.
- [ ] **Step 3 (GREEN):** điểm hợp lệ bằng `isValidScore`; results + chuyển enrollment trong một `withTransaction`.
- [ ] **Step 4:** commit `feat(placement): placement tests, results and skip`.

### Task E-03: Xếp lớp (FR-CLS-06, FR-FEE-02 phía enrollment)

**Files:** `apps/api/src/modules/enrollments/{assignment.service,enrollments.controller}.ts`; tests `apps/api/test/e2e/enrollments-assign.e2e-spec.ts`, `apps/api/test/e2e/enrollments-assign-rollback.e2e-spec.ts`

**Interfaces:**
- Consumes: `@Inject(INVOICE_CREATOR) createForEnrollment(id, s): Promise<ObjectId|null>` (D11), `NotificationsService.notify`.
- Produces: `POST /enrollments/:id/assign` (M,S; `AssignClassInput`) → 201 `EnrollmentDto`; `AssignmentService.seat(enrollment, classId, actor, s)` dùng lại ở E-04 (bump `lock:class:<classId>`, `$inc` nguyên tử theo ARCHITECTURE §4.5, trả `ClassDoc`).

- [ ] **Step 1 (RED)** `describe('FR-CLS-06 Xếp lớp')` (file chính override `INVOICE_CREATOR` bằng fake `{ createForEnrollment: jest.fn().mockResolvedValue(new ObjectId()), voidForEnrollment: jest.fn() }`):
  - `enrollment PENDING_PLACEMENT → 422 ENROLLMENT_INVALID_STATE`; `lớp khác khóa → 422 COURSE_MISMATCH`; `lệch level không lý do → 422 LEVEL_MISMATCH`; `lý do < 5 ký tự → 400`; `có lý do → 201 + levelOverride {reason,by,at}`; `lớp FINISHED / INACTIVE → 422 CLASS_NOT_OPEN`; `lớp đầy → 422 CLASS_FULL`; `lớp không tồn tại → 404`.
  - **`10 request song song (10 enrollment khác nhau) vào lớp còn 1 chỗ → đúng 1×201, 9×422 CLASS_FULL, currentSize = maxCapacity`**; `2 request song song cùng enrollment → 1×201, 1×422`.
  - `thành công → ENROLLED, classId, enrolledAt, history WAITING_CLASS→ENROLLED, currentSize+1, createForEnrollment gọi đúng 1 lần với enrollmentId, invoiceId = giá trị fake trả về, notifications CLASS_ASSIGNED tới user HV`; counter `lock:class:<id>` tồn tại; audit `enrollment`.
  - `T, H, A → 403`.
  - File rollback: fake `createForEnrollment` throw → 500, enrollment vẫn WAITING_CLASS, currentSize không đổi, không có notification.
- [ ] **Step 2:** RED → FAIL.
- [ ] **Step 3 (GREEN):** thứ tự trong transaction: claim enrollment `{_id, status: WAITING_CLASS}` → kiểm tra course/level/open (đọc lớp sau bump lock) → `seat` → `createForEnrollment` → set `invoiceId` → audit; notify sau commit. Lỗi phân biệt bằng đọc lại sau khi update có điều kiện trả null.
- [ ] **Step 4:** commit `feat(enrollments): assign to class`.

### Task E-04: Chuyển lớp, rút, bảo lưu, học lại, kết thúc lớp, xác nhận, danh sách chờ (FR-CLS-07..11)

**Files:** `enrollments.service.ts`, `assignment.service.ts`, `enrollments.controller.ts`, `apps/api/src/modules/enrollments/class-finished.listener.ts`; tests `apps/api/test/e2e/enrollments-lifecycle.e2e-spec.ts`, `apps/api/test/e2e/enrollments-waiting.e2e-spec.ts`

**Interfaces — Produces:**
- `POST /enrollments/:id/transfer` (M,S; `TransferEnrollmentInput`) → 201 `EnrollmentDto` (enrollment **mới**); lock cả hai lớp theo id tăng dần; lớp đích cùng khóa (khác → 422 `COURSE_MISMATCH`), open, còn chỗ; cũ `TRANSFERRED` + `transferredToId`, mới `ENROLLED` + `transferredFromId` + `invoiceId` cũ (D11); sĩ số −1/+1; **không** gọi InvoiceCreator. Ghi chú: unique index enrollment hoạt động → chuyển cũ sang TRANSFERRED **trước** khi tạo mới.
- `POST /enrollments/:id/withdraw` (M,S; `WithdrawEnrollmentInput`) → `EnrollmentDto`; từ ENROLLED: sĩ số −1 (lock lớp); `CANCELLED` → `voidForEnrollment(id, reason, s)`; `RESERVED` → không gọi. Từ PENDING_PLACEMENT/WAITING_CLASS chỉ được `CANCELLED` (không đụng sĩ số, không void). Bảng chuyển theo `canTransition` (sai → 422 `INVALID_STATUS_TRANSITION`).
- `POST /enrollments/:id/resume` (M,S) → RESERVED → WAITING_CLASS (`classId = null`, `waitingSince = now`).
- `POST /enrollments/:id/confirm` (H, chỉ của mình, chỉ ENROLLED) → `confirmedAt`; người khác → 404; không ENROLLED → 422.
- `GET /enrollments/waiting` (M,S; `ListWaitingEnrollmentsQuery`) → `Paginated<WaitingEnrollmentDto>` sắp `waitingSince` tăng dần, `waitingDays` = số ngày VN giữa `vnDay(waitingSince)` và `vnDay(now)`.
- `ClassFinishedListener` `@OnEvent(DomainEvent.ClassFinished)` (`ClassFinishedPayload`): mọi ENROLLED của lớp → COMPLETED (history `by = actorId`), sĩ số giữ nguyên.

- [ ] **Step 1 (RED)** `describe('FR-CLS-07..11 Vòng đời enrollment')` (override `INVOICE_CREATOR` bằng fake):
  - `withdraw COMPLETED → 422 INVALID_STATUS_TRANSITION`; `resume ENROLLED → 422`; `transfer WAITING_CLASS → 422 ENROLLMENT_INVALID_STATE`.
  - `withdraw CANCELLED từ ENROLLED → voidForEnrollment gọi 1 lần (id, reason), currentSize −1`; `withdraw RESERVED → không gọi void, currentSize −1`; `withdraw CANCELLED từ WAITING_CLASS → không đổi sĩ số`; lý do rỗng → 400 `REASON_REQUIRED`.
  - `resume RESERVED → WAITING_CLASS, classId null, waitingSince mới; assign lại → createForEnrollment được gọi, invoiceId giữ giá trị fake trả` (không tạo enrollment mới; Task M kiểm không có hóa đơn thứ hai với fees thật).
  - `class.finished: PATCH /classes/:id {status: FINISHED} (lớp ONGOING) → mọi ENROLLED → COMPLETED, TRANSFERRED giữ nguyên, currentSize giữ nguyên`.
  - `transfer → cũ TRANSFERRED + transferredToId, mới ENROLLED + transferredFromId + invoiceId cũ, nguồn −1, đích +1, createForEnrollment KHÔNG được gọi, CLASS_ASSIGNED tới HV`; `lớp đích đầy → 422 CLASS_FULL và không đổi gì (enrollment cũ vẫn ENROLLED, sĩ số hai lớp như cũ)`; `transfer khác khóa → 422 COURSE_MISMATCH`; `transfer vào chính lớp đang học → 422 VALIDATION_FAILED fields.toClassId`; **`2 transfer song song (2 HV khác lớp nguồn) vào lớp đích còn 1 chỗ → 1×201, 1×422 CLASS_FULL`** (Review Focus 1); lý do rỗng → 400.
  - `HV confirm của mình → confirmedAt`; `của người khác → 404`; `M/S confirm → 403`.
  - waiting: `sắp theo waitingSince tăng dần, waitingDays = 16 khi chờ từ 2025-12-20 (FakeClock 2026-01-05)`; `lọc courseId`; `T,H,A → 403`.
  - Mọi route ghi: `T, H, A → 403` (trừ confirm).
- [ ] **Step 2:** RED → FAIL.
- [ ] **Step 3 (GREEN):** sĩ số giảm bằng `$inc: -1` có điều kiện `currentSize > 0`; mọi chuyển trạng thái bằng `findOneAndUpdate({_id, status: from})`.
- [ ] **Step 4:** commit `feat(enrollments): transfer, withdraw, resume, confirm, waiting list, class finished`.

### Task E-05: FE Kiểm tra đầu vào (DESIGN §4.3 placement)

**Files:** `apps/web/src/features/placement/{api.ts,hooks.ts,components/{placement-form-dialog,candidates-dialog}.tsx,__tests__/placement.test.tsx}`, `apps/web/src/features/admissions/pages/{placement-page,placement-detail-page,placement-grade-page}.tsx`, `apps/web/test/msw/placement.handlers.ts`

**Consumes:** `useCourses`, `useRooms`, `useTeachers` (catalog hooks). Placement không có endpoint dry-run: form hiển thị 409 `SCHEDULE_CONFLICT` bằng cách render `details.conflicts` (`SessionConflictDto[]`) thành danh sách đỏ trong `features/placement/components/placement-form-dialog.tsx` (không import component nội bộ của `features/schedule`).

- [ ] **Step 1 (RED):** `tạo đợt → 409 SCHEDULE_CONFLICT → danh sách xung đột hiển thị trong dialog (ngày giờ, phòng/GV, lớp đang chiếm), dialog không đóng`; `chi tiết đợt: "Thêm thí sinh" liệt kê GET /enrollments?status=PENDING_PLACEMENT&courseId=…, chọn 2 → POST candidates với 2 id`; `GV chấm: nhập 11 → ô viền đỏ (aria-invalid) và nút Lưu disabled`; `nhập 7.3 → đỏ`; `nhập 7.25 + chọn level → PUT results đúng body (mảng trần)`; `TEACHER không thấy nút "Tạo đợt"`; `danh sách rỗng → EmptyState`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): placement screens`.

### Task E-06: FE Danh sách chờ, panel xếp lớp, tab Khóa học & lớp, Lớp của tôi (DESIGN §4.5, §4.4)

**Files:** `apps/web/src/features/enrollments/{api.ts,hooks.ts,pages/{waiting-list-page,my-classes-page}.tsx,components/{assign-panel,transfer-dialog,withdraw-dialog,student-enrollments-tab,confirm-class-banner}.tsx,__tests__/*.test.tsx}`, `apps/web/test/msw/enrollments.handlers.ts`

**Consumes:** `GET /classes?courseId=&open=true` (classes API qua hook của `features/classes` nếu export, nếu không gọi `apiGetPage` trong `features/enrollments/api.ts`).
**Produces:** `ConfirmClassBanner` (export default không cần; named export) — D19.

- [ ] **Step 1 (RED):** `chọn HV (placementLevel B1) → panel: lớp cùng khóa level B1 còn chỗ ở nhóm "Phù hợp" trước, lớp level B2 ở nhóm "Khác"`; `chọn lớp nhóm "Khác" → bắt buộc nhập lý do (≥5 ký tự) mới bật "Xếp vào lớp", POST assign có overrideReason`; `422 CLASS_FULL → toast "Lớp vừa đầy" và GET /classes được gọi lại`; `HV chờ 15 ngày → dòng có class cam (data-overdue="true")`, `14 ngày → không`; `tab Khóa học & lớp: enrollment ENROLLED có nút Chuyển lớp/Bảo lưu/Rút; Rút → dialog lý do bắt buộc → POST withdraw {status: CANCELLED}`; `HV /me/classes: enrollment ENROLLED chưa confirmedAt → banner "Xác nhận lớp" → POST /enrollments/:id/confirm → banner biến mất`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): waiting list, assignment panel, enrollments tab, my classes`.

---

## Lane L-ATTENDANCE (worktree `../lc-L-ATTENDANCE`)

`AttendanceModule` thêm `SessionAttendanceController @Controller('sessions')` (chỉ path `:id/attendance`) và `AttendanceController @Controller('attendance')`; provides + exports `AttendanceStatsService`. Không import ClassesModule (tránh vòng; Task M cho ClassesModule import AttendanceModule).

### Task AT-01: Điểm danh lần đầu (FR-ATT-01, 02)

**Files:** `apps/api/src/modules/attendance/{roster.ts,roster.spec.ts,session-attendance.controller,attendance.service,attendance.mapper}.ts`; test `apps/api/test/e2e/attendance-take.e2e-spec.ts`

**Interfaces — Produces:**
```ts
// roster.ts (D13)
export function enrolledAt(history: { from: EnrollmentStatus | null; to: EnrollmentStatus; at: Date }[], instant: Date): boolean;
```
- `AttendanceService.roster(session): Promise<EnrollmentDoc[]>` (enrollment của lớp có `enrolledAt(history, session.startAt)`).
- `GET /sessions/:id/attendance` (M,S,T scope qua `ScopeService.teacherCanTakeAttendance`; ngoài phạm vi → 404) → `SessionAttendanceDto` (roster + trạng thái hiện tại; HV có bản ghi nhưng không còn trong roster vẫn hiện).
- `PUT /sessions/:id/attendance` (T scope, S; M → 403) `TakeAttendanceInput` → `SessionAttendanceDto`; một `withTransaction`: claim `sessions.findOneAndUpdate({_id, attendanceTakenAt: null, status: SCHEDULED}, {attendanceTakenAt: now, attendanceNote})` → `bulkWrite` upsert `(sessionId, studentId)`; emit `DomainEvent.AttendanceRecorded` `{ sessionId, classId, studentIds }` sau commit.

- [ ] **Step 1 (RED):** unit `roster.spec.ts`: `ENROLLED từ 01/01, buổi 05/01 → true`; `TRANSFERRED 03/01, buổi 05/01 → false`; `TRANSFERRED 10/01, buổi 05/01 → true`; `enrolled 06/01, buổi 05/01 → false`; `ENROLLED→RESERVED→WAITING_CLASS→ENROLLED: buổi giữa hai đoạn → false, trong đoạn hai → true`; `COMPLETED không đóng đoạn`. E2E `describe('FR-ATT-01/02 Điểm danh')`:
  - `GV lớp điểm danh đủ → 200, attendanceTakenAt set, 4 trạng thái lưu đúng`; `GV dạy thay (session.teacherId) → 200`; `trợ giảng → 200`; `S → 200`; `GV khác → 404`; `H, M, A → 403`.
  - `thiếu 1 HV → 400 ATTENDANCE_INCOMPLETE details.studentIds = [id thiếu]`; `studentId lạ → 400 STUDENT_NOT_IN_ROSTER details.studentIds`; `buổi CANCELLED → 422 SESSION_CANCELLED`; `clock = startAt − 16' → 422 ATTENDANCE_TOO_EARLY`, `= startAt − 15' → 200` (file dùng `t.clock.set`).
  - `HV chuyển đi trước buổi không có trong roster; HV TRANSFERRED sau buổi vẫn có (GET roster buổi cũ)`.
  - `PUT lần hai → 409 ATTENDANCE_ALREADY_TAKEN`; **`2 PUT song song → 1×200, 1×409, đúng N bản ghi`**.
  - `buổi không tồn tại → 404`.
- [ ] **Step 2–3:** RED → GREEN.
- [ ] **Step 4:** commit `feat(attendance): take attendance with point-in-time roster`.

### Task AT-02: Cập nhật điểm danh (FR-ATT-03)

**Files:** `attendance.service.ts`, `session-attendance.controller.ts`; test `apps/api/test/e2e/attendance-update.e2e-spec.ts`

**Produces:** `PATCH /sessions/:id/attendance` (T scope, S) `UpdateAttendanceInput` → `SessionAttendanceDto`; buổi chưa điểm danh lần đầu → 422 `INVALID_STATUS_TRANSITION` (dùng PUT trước). Mỗi bản ghi đổi trạng thái append history `{from,to,by,at,reason}`; trạng thái không đổi → bỏ qua; HV thuộc roster chưa có bản ghi → tạo với history `from: null`. Audit `entity: 'attendance'` mỗi bản ghi đổi (before/after status). `editable` trong DTO theo D16.

- [ ] **Step 1 (RED):** `PATCH đổi PRESENT→LATE → history[0] {from PRESENT, to LATE, by, at, reason}`; `trạng thái không đổi → history không thêm`; `GV khi now = endAt + 7d − 1' → 200`, `+ 7d + 1' → 422 ATTENDANCE_EDIT_WINDOW_CLOSED`; `S sau 30 ngày → 200`; `teacherAttendanceEditDays = 3 (PATCH /settings) → GV sau 4 ngày 422`; `chưa điểm danh → 422 INVALID_STATUS_TRANSITION`; `studentId lạ → 400 STUDENT_NOT_IN_ROSTER`; `audit_logs có entity attendance`; `GET roster → editable false cho GV khi quá cửa sổ, true cho S`; `M, H, A → 403`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(attendance): edit attendance with history and window`.

### Task AT-03: Lịch sử & tổng hợp (FR-ATT-04)

**Files:** `attendance.controller.ts`, `attendance.service.ts`; test `apps/api/test/e2e/attendance-history.e2e-spec.ts`

**Produces:** `GET /attendance` (M,S,T,H scope: H `studentId = mình` + lớp `studentClassIds('history')`; T `classId ∈ teacherClassIds`; M,S `{}`) `ListAttendanceQuery` → `Paginated<AttendanceDto>` (sessionStartAt, studentName, classCode; sắp sessionStartAt giảm dần); `GET /attendance/summary` (cùng phạm vi) `AttendanceSummaryQuery` → `{ data: AttendanceSummaryRowDto[] }`; from/to lọc theo ngày VN của `session.startAt` (`startOfVnDay(from)` ≤ startAt < `startOfVnDay(addVnDays(to,1))`).

- [ ] **Step 1 (RED):** `tỷ lệ = (PRESENT+LATE)/tổng: 2 PRESENT + 1 LATE + 1 UNEXCUSED → attendanceRate 0.75, absenceRate 0.25`; `3 trên 7 → 0.4286 (làm tròn 4 chữ số)`; `buổi chưa điểm danh không tính`; `HV chỉ thấy của mình (studentId người khác trong query → bị ghi đè, không lộ)`; `HV TRANSFERRED vẫn thấy bản ghi lớp cũ`; `GV chỉ lớp mình (trợ giảng cũng vậy); GV dạy thay không thấy lớp đó`; `from=to=2026-01-14 gồm buổi 14/01 18:00 VN (11:00Z) và loại buổi 15/01 00:30 VN (14/01 17:30Z)`; `groupBy=class → một dòng/lớp`; `không dữ liệu → data []`; `thiếu groupBy → 400`; `A → 403`.
- [ ] **Step 2–4:** RED → GREEN (aggregation `$group` theo `studentId|classId`, label bằng `$lookup`; tỷ lệ bằng `attendanceRate`/`absenceRate` của shared rồi `Math.round(x*1e4)/1e4`) → commit `feat(attendance): history and summary`.

### Task AT-04: Cảnh báo vắng (FR-ATT-05)

**Files:** `apps/api/src/modules/attendance/attendance-stats.service.ts`, `attendance.module.ts`; test `apps/api/test/e2e/attendance-warnings.e2e-spec.ts`

**Interfaces — Produces:** `AttendanceStatsService.warningFlags(classId: Types.ObjectId): Promise<Map<string, { absenceRate: number; warning: boolean }>>`; `AttendanceStatsService.evaluate(classId, studentIds): Promise<void>` (D17) gọi bởi listener `@OnEvent(DomainEvent.AttendanceRecorded)`; `SessionAttendanceDto.roster[].absenceRate` lấy từ `warningFlags`.

- [ ] **Step 1 (RED):** `threshold 0.2: HV vắng 1/4 buổi lần đầu → 1 attendance_warning + notification ATTENDANCE_WARNING tới user HV và mọi ACADEMIC_STAFF ACTIVE (không tới MANAGER, không tới S DISABLED)`; `buổi tiếp vẫn vượt → không thông báo lại (count notifications không đổi)`; `PATCH sửa về có mặt → về ≤ ngưỡng → warning bị xóa`; `vượt lại → thông báo lần nữa`; `đúng bằng ngưỡng (1/5 = 0.2) → không cảnh báo (> chứ không ≥)`; `warningFlags(classId) trả absenceRate và warning đúng cho từng HV`; `GET /sessions/:id/attendance roster[].absenceRate đúng`.
- [ ] **Step 2–4:** RED → GREEN (listener bắt lỗi và log, không làm hỏng request; insert warning bắt `isDuplicateKey` = đã có) → commit `feat(attendance): absence warnings`.

### Task AT-05: FE Điểm danh (DESIGN §4.7)

**Files:** `apps/web/src/features/attendance/{api.ts,hooks.ts,pages/take-attendance-page.tsx,components/{status-segmented,attendance-history-popover}.tsx,__tests__/take-attendance.test.tsx}`, `apps/web/test/msw/attendance.handlers.ts`

- [ ] **Step 1 (RED):** `"Tất cả có mặt" → mọi HV PRESENT, đếm "Đã chọn 20/20"`; `lưu khi thiếu 3 → cảnh báo "Còn 3 học viên chưa điểm danh", không gọi PUT, focus nút trạng thái HV thiếu đầu tiên (document.activeElement)`; `đủ → PUT body đúng records + sessionNote`; `taken=true → chế độ cập nhật: dòng "Đã điểm danh lúc 18:05 14/01 bởi Cô Lan", đổi trạng thái hiện ô lý do, lưu → PATCH chỉ bản ghi đã đổi`; `xem lịch sử một HV → popover liệt kê history`; `editable=false → mọi nút disabled + thông báo "Đã quá thời hạn chỉnh sửa"`; `viewport 375 (test/media.ts) → nút trạng thái có class min-h-11 (≥44px)`; `absenceRate > 0 hiện "⚠ vắng 3/10 buổi"` khi warning; `422 ATTENDANCE_TOO_EARLY → thông điệp từ error-messages`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): take attendance screen`.

### Task AT-06: FE Lịch sử điểm danh, tab Điểm danh lớp (ma trận), tab Chuyên cần HV, `/me/attendance`

**Files:** `apps/web/src/features/attendance/{pages/{attendance-history-page,my-attendance-page}.tsx,components/{class-attendance-tab,student-attendance-tab,attendance-matrix}.tsx,__tests__/attendance-history.test.tsx}`

- [ ] **Step 1 (RED):** `/attendance lọc lớp + khoảng ngày → GET /attendance/summary?groupBy=student&classId=…&from=…&to=…`; `bảng tổng hợp hiển thị Có mặt/Muộn/Vắng CP/Vắng KP/Tỷ lệ "75%"`; `click dòng → danh sách buổi của HV (GET /attendance?studentId=…)`; `ma trận lớp: hàng HV × cột buổi, ô có data-status theo trạng thái, buổi chưa điểm danh ô trống`; `/me/attendance: thẻ tỷ lệ + danh sách buổi`; `rỗng → "Chưa có dữ liệu điểm danh"`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): attendance history, class matrix and my attendance`.

---

## Lane L-GRADES (worktree `../lc-L-GRADES`)

`GradesModule`: `AssessmentsController` (paths `classes/:id/assessments` + `assessments/:id`, khai báo bằng `@Controller()` với path đầy đủ trên handler), `GradesController @Controller('assessments')` (`:id/grades…`, `:id/unlock`), `ResultsController @Controller('results')`. Không import FeesModule (Task M).

### Task G-01: Assessments (FR-GRD-01)

**Files:** `apps/api/src/modules/grades/{assessments.controller,grades.service,grades.mapper}.ts`; test `apps/api/test/e2e/grades-assessments.e2e-spec.ts`

**Produces:** `GET /classes/:id/assessments` (M,S,T scope,H scope `studentClassIds('history')`) → `{ data: AssessmentDto[] }` sắp `heldOn`; `POST /classes/:id/assessments` (T scope, S; M → 403) → 201; `PATCH /assessments/:id`, `DELETE /assessments/:id` (T scope, S) → 200 / 204. `toAssessmentDto(doc, settings, now)` tính `lockedAt`, `isLocked` (D16). Trọng số: `0 < weight ≤ 100` (sai → 400 `fields.weight`), tổng lớp ≤ 100 (kể cả PATCH; tính trừ chính nó) → 422 `WEIGHT_EXCEEDS_100`; serialise bằng `lock:class:<classId>` (protocol) để 2 POST song song không cùng vượt.

- [ ] **Step 1 (RED):** `tạo 60 + 40 → ok; thêm 1 → 422 WEIGHT_EXCEEDS_100`; `PATCH 40 → 50 khi tổng còn lại 60 → 422`; `PATCH chính nó giữ nguyên weight → 200`; **`2 POST song song 60 + 60 vào lớp trống → 1×201, 1×422`**; `weight 0 / 101 / -5 → 400`; `GV lớp khác → 404`; `trợ giảng tạo được`; `M POST → 403`, `H POST → 403`; `xóa bài đã có grade → 422 ASSESSMENT_HAS_GRADES`; `xóa bài trống → 204`; `HV GET lớp mình → 200, lớp khác → 404`; `isLocked đúng theo gradeLockDays`; `A → 403`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(grades): assessments`.

### Task G-02: Nhập điểm (FR-GRD-02, 03)

**Files:** `apps/api/src/modules/grades/{grades.controller,grades.service}.ts`; test `apps/api/test/e2e/grades-entry.e2e-spec.ts`

**Produces:** `GET /assessments/:id/grades` (M,S,T scope) → `AssessmentGradesDto` (D14: roster ENROLLED|COMPLETED + HV đã có điểm nhưng rời lớp `left: true`); `PUT /assessments/:id/grades` (chỉ T, `teacherClassIds`; S/M → 403) `UpsertGradesInput` → `AssessmentGradesDto`. Upsert `(assessmentId, studentId)` trong transaction; `confirm:true` đủ roster → `assessment.confirmedAt = now`, mọi grade `isDraft=false`, notify `GRADES_PUBLISHED` sau commit; bài đã confirm → PUT bị chặn với điểm đã có (dùng PATCH) → 422 `INVALID_STATUS_TRANSITION`; khóa (D16) → 422 `GRADEBOOK_LOCKED`.

- [ ] **Step 1 (RED)** `describe('FR-GRD-02/03 Nhập điểm')`: `score 10.25 → 400 SCORE_OUT_OF_RANGE details.studentIds [id]`; `7.3 → 400`; `-1 → 400`; `0, 7.25, 10 → 200`; `studentId ngoài roster → 400 STUDENT_NOT_IN_ROSTER`; `confirm:false thiếu điểm → 200 lưu nháp (isDraft true)`; `confirm:true thiếu → 422 GRADES_INCOMPLETE details.studentIds`; `confirm:true đủ → confirmedAt, isDraft false, notification GRADES_PUBLISHED tới user HV roster`; `HV TRANSFERRED khỏi lớp trước khi confirm không bắt buộc, điểm cũ của HV vẫn trả với left true` (Review Focus 2); `S/M PUT → 403`, `GV lớp khác → 404`, `trợ giảng PUT → 200`; `H GET /assessments/:id/grades → 403`; `PUT sau confirm → 422`.
- [ ] **Step 2–4:** RED → GREEN (`isValidScore`; mọi lỗi điểm gom một lần) → commit `feat(grades): grade entry with drafts and confirm`.

### Task G-03: Sửa điểm & khóa (FR-GRD-04)

**Files:** `grades.service.ts`, `grades.controller.ts`; test `apps/api/test/e2e/grades-amend.e2e-spec.ts`

**Produces:** `PATCH /assessments/:id/grades/:studentId` (T scope) `AmendGradeInput` → `GradeDto`; chỉ sau confirm (chưa confirm → 422 `INVALID_STATUS_TRANSITION`); lý do rỗng → 400 `REASON_REQUIRED`; history `{fromScore,toScore,fromComment,toComment,reason,by,at}` + audit `entity: 'grade'` cùng transaction. `POST /assessments/:id/unlock` (M) `UnlockAssessmentInput` → `AssessmentDto` (`until` phải > now → 400 `fields.until`).

- [ ] **Step 1 (RED):** `sửa thiếu lý do → 400 REASON_REQUIRED`; `có lý do → history + audit`; `heldOn 2026-01-05, gradeLockDays 14: clock 2026-01-18T16:59Z (23:59 VN 18/01) → 200; 2026-01-18T17:00Z (00:00 VN 19/01) → 422 GRADEBOOK_LOCKED` (Review Focus 3); `PUT nháp khi khóa → 422`; `M unlock until 2026-01-25 → sửa được; clock qua until → 422`; `S/T unlock → 403`; `until quá khứ → 400`; `S/M PATCH grade → 403`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(grades): amend grades, gradebook lock and unlock`.

### Task G-04: Kết quả & phiếu điểm (FR-GRD-05..08)

**Files:** `apps/api/src/modules/grades/{results.controller,results.service,transcript.ts}.ts`; tests `apps/api/test/e2e/grades-results.e2e-spec.ts`, `apps/api/test/e2e/grades-results-blocked.e2e-spec.ts`

**Interfaces:**
- Consumes: `@Inject(OUTSTANDING_CHECKER) hasOverdueBalance(studentId)`, `SettingsService.get().resultViewRequiresPaidFees`, `PdfService.render` (Task 0), `weightedAverage`/`classify`/`isPass`.
- Produces: `GET /results` (M,S lọc courseId/classId/studentId; T `teacherClassIds`; H `studentId = mình`, lớp `studentClassIds('history')`) `ListResultsQuery` → `Paginated<ResultDto>` (một dòng / (HV, lớp); chỉ bài **đã confirm**; `average` làm tròn 2 chữ số); `GET /results/transcript.pdf?studentId&classId` (M,S,H mình; T → 403) → `application/pdf`, `Content-Disposition: attachment; filename="phieu-diem-<code>-<classCode>.pdf"`. Gate FR-GRD-07 chỉ áp cho H, cho cả `/results` và transcript → 403 `FEES_OUTSTANDING` (D12).

- [ ] **Step 1 (RED):** `TB trọng số: QUIZ 20% 8, MIDTERM 30% 6, FINAL 50% chưa confirm → average = (8·20+6·30)/50 = 6.8, gradeClass FAIR (≥6.5 Khá), passed true`; `bài nháp không tính`; `không bài confirm → average null, gradeClass null`; `HV chỉ của mình (query studentId khác → bị ghi đè)`; `HV TRANSFERRED xem kết quả lớp cũ`; `GV lớp khác không thấy`; `transcript → 200 application/pdf, pdfText chứa họ tên HV và mã lớp`; `T transcript → 403`; `HV transcript của người khác → 404`. File blocked (override `OUTSTANDING_CHECKER` fake `hasOverdueBalance: jest.fn().mockResolvedValue(true)`): `setting resultViewRequiresPaidFees=true → H /results 403 FEES_OUTSTANDING, transcript 403`; `S vẫn xem được`; `setting false → H xem được`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(grades): results, classification and transcript pdf`.

### Task G-05: FE Nhập điểm & tab Bài đánh giá (DESIGN §4.8)

**Files:** `apps/web/src/features/grades/{api.ts,hooks.ts,pages/grade-entry-page.tsx,components/{class-assessments-tab,assessment-form-dialog,grade-grid}.tsx,__tests__/grade-entry.test.tsx}`, `apps/web/test/msw/grades.handlers.ts`

- [ ] **Step 1 (RED):** `Tab và Enter chuyển focus sang ô điểm HV kế tiếp`; `nhập 10.5 → ô aria-invalid + tooltip "Điểm từ 0 đến 10, bước 0.25"`; `Xác nhận khi thiếu 2 → dialog "Còn 2 học viên chưa có điểm. Lưu nháp?" → đồng ý gửi PUT confirm:false`; `đủ → PUT confirm:true`; `isLocked → banner "Bảng điểm đã đóng, không thể chỉnh sửa", input disabled`; `sau confirm sửa một ô → ReasonDialog → PATCH /assessments/:id/grades/:studentId có reason`; `tab Bài đánh giá hiển thị "85/100%" và badge Nháp/Đã xác nhận/Đã khóa`; `tạo bài vượt 100 → 422 → lỗi dưới ô Trọng số`; `S không thấy ô nhập (chỉ xem)`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): grade entry and class assessments tab`.

### Task G-06: FE Kết quả (`/results`, `/me/results`, tab Kết quả HV)

**Files:** `apps/web/src/features/grades/{pages/{results-page,my-results-page}.tsx,components/student-results-tab.tsx,__tests__/results.test.tsx}`

- [ ] **Step 1 (RED):** `/results lọc lớp → GET /results?classId=…, bảng HV × bài + TB + badge xếp loại`; `/me/results: thẻ theo lớp, nút "Tải phiếu điểm PDF" gọi apiGetBlob('results/transcript.pdf?studentId=…&classId=…')`; `403 FEES_OUTSTANDING → khối cảnh báo "Bạn còn học phí quá hạn…" + hướng dẫn liên hệ, không có bảng`; `rỗng → "Chưa có kết quả học tập"`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): results screens`.

---

## Lane L-FEES (worktree `../lc-L-FEES`)

`FeesModule`: `InvoicesController @Controller('invoices')`, `PaymentsController @Controller('payments')`; providers + exports `{ provide: INVOICE_CREATOR, useClass: InvoiceCreatorService }`, `{ provide: OUTSTANDING_CHECKER, useClass: OutstandingCheckerService }`. Không import EnrollmentsModule (đọc model enrollments/classes/courses trực tiếp).

### Task F-01: InvoiceCreator (FR-FEE-02, BACKEND_SCHEMA §2.16)

**Files:** `apps/api/src/modules/fees/{invoice-creator.service,fees.module}.ts`; test `apps/api/test/e2e/fees-invoice-creator.e2e-spec.ts`; helper `apps/api/test/factories/fees.extra.ts` (`assertInvoiceInvariants(conn)`)

**Interfaces — Produces:** `InvoiceCreatorService implements InvoiceCreator` (D11):
- `createForEnrollment(id, s)`: tìm hóa đơn chuỗi (D11) → có thì trả id; không thì tạo `kind TUITION`, `code = HD{YYYYMM}{4 số}` (`CounterService.next('invoice:<YYYYMM>', s)`, tháng VN của `now`), `amountDue = finalAmount = balance = course.baseFee`, `amountPaid 0`, `status UNPAID` (baseFee 0 → `PAID`), `dueDate = fromDateOnly(addVnDays(toDateOnly(class.startDate), settings.invoiceDueDaysAfterStart))`, `classId`, `courseId`, `enrollmentId`; trả id. E11000 từ index partial `{enrollmentId, kind TUITION}` → đọc lại và trả id cũ.
- `voidForEnrollment(id, reason, s)`: hóa đơn chuỗi `amountPaid = 0` và không VOID → `VOID` (`voidReason` lưu reason); `> 0` → không đổi.
- `assertInvoiceInvariants(conn)`: mọi invoice: `amountPaid ≤ finalAmount`, `balance = finalAmount − amountPaid`, `amountPaid = Σ payments VALID`, `status` khớp quy tắc §2.16 (VOID bỏ qua).

- [ ] **Step 1 (RED)** `describe('FR-FEE-02 Hóa đơn học phí')` (gọi `t.app.get(INVOICE_CREATOR)` trong `withTransaction`): `tạo → kind TUITION, amountDue = baseFee 3_000_000 snapshot (đổi baseFee sau đó không đổi hóa đơn), dueDate = startDate lớp 2026-01-10 + 7 = "2026-01-17", code /^HD202601\d{4}$/`; `gọi hai lần → cùng id, 1 hóa đơn`; `enrollment mới có transferredFromId → enrollment cũ có invoice → trả id cũ, không tạo`; `tạo SURCHARGE thủ công cùng enrollmentId (factory) → không bị unique chặn`; `void khi amountPaid 0 → VOID`; `void khi amountPaid > 0 → không đổi`; `baseFee 0 → status PAID`; `module-level: t.app.get(INVOICE_CREATOR) instanceof InvoiceCreatorService` khi resolve từ FeesModule (`t.app.select(FeesModule)`); `assertInvoiceInvariants` sau mỗi test.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(fees): tuition invoice creator`.

### Task F-02: Giảm giá (FR-FEE-03)

**Files:** `apps/api/src/modules/fees/{invoices.controller,invoices.service,fees.mapper}.ts`; test `apps/api/test/e2e/fees-discounts.e2e-spec.ts`

**Produces:** `POST /invoices/:id/discount` (M,S) `ApplyDiscountInput` → `InvoiceDto`: S → `PENDING_APPROVAL` (finalAmount chưa đổi); M → `APPROVED` ngay (finalAmount = `amountDue − applyDiscount(...)`); `isValidDiscount` sai hoặc finalAmount mới < amountPaid → 400 `DISCOUNT_INVALID`; đề xuất mới chỉ khi chưa có discount hoặc discount REJECTED (thay thế); đang PENDING hoặc APPROVED → 422 `DISCOUNT_NOT_PENDING`; hóa đơn VOID → 422 `INVOICE_VOID`. `POST /invoices/:id/discount/decision` (M) `DecideDiscountInput` → `InvoiceDto`; không PENDING → 422 `DISCOUNT_NOT_PENDING`; notify `DISCOUNT_DECIDED` tới `requestedBy`. Trang duyệt dùng `GET /invoices/discounts/pending` (M; `ListInvoicesQuery` không có lọc discount) → `Paginated<InvoiceDto>` (route khai báo trước `:id`). Audit `entity: 'invoice'`.

- [ ] **Step 1 (RED):** `S đề xuất 10% trên 1_555_555 → PENDING_APPROVAL, discount.amount 155_556, finalAmount 1_555_555`; `M duyệt → APPROVED, finalAmount 1_399_999, balance cập nhật`; `M từ chối → REJECTED, finalAmount không đổi`; `decision khi không pending → 422 DISCOUNT_NOT_PENDING`; `AMOUNT > amountDue → 400 DISCOUNT_INVALID`; `PERCENT 120 → 400`; `giảm làm finalAmount < amountPaid → 400 DISCOUNT_INVALID`; `M tự áp → APPROVED ngay`; `S gọi decision → 403`; `T, H, A → 403`; `DISCOUNT_DECIDED tới người đề xuất`; `/invoices/discounts/pending chỉ PENDING`; invariants.
- [ ] **Step 2–4:** RED → GREEN (cập nhật bằng `findOneAndUpdate` có điều kiện `discount.status`) → commit `feat(fees): discounts with approval`.

### Task F-03: Thanh toán (FR-FEE-04, 05)

**Files:** `apps/api/src/modules/fees/{payments.controller,payments.service,invoices.controller}.ts`; test `apps/api/test/e2e/fees-payments.e2e-spec.ts`

**Produces:** `POST /invoices/:id/payments` (M,S) `RecordPaymentInput` → 201 `PaymentDto` (`code PT{YYYYMM}{4}`, `paidAt` mặc định now); trong transaction: `invoices.findOneAndUpdate({_id, status ≠ VOID, $expr: amountPaid + amount ≤ finalAmount}, {$inc amountPaid, balance −})` + set status → null: VOID → 422 `INVOICE_VOID`, còn lại → 422 `PAYMENT_EXCEEDS_BALANCE`; notify `PAYMENT_RECORDED`. `POST /payments/:id/void` (M) `VoidPaymentInput` → `PaymentDto` (lý do rỗng → 400 `REASON_REQUIRED`; đã VOIDED → 422 `INVALID_STATUS_TRANSITION`); hoàn amountPaid + tính lại status. `POST /invoices/:id/void` (M) → `InvoiceDto` chỉ khi không có payment VALID (có → 422 `INVALID_STATUS_TRANSITION`). Hàm thuần `invoiceStatus({finalAmount, amountPaid})` + `isOverdue(invoice, now)` (`toDateOnly(dueDate) < vnDay(now) && balance > 0 && status ≠ VOID`) trong `fees.mapper.ts`.

- [ ] **Step 1 (RED):** `payment > balance → 422 PAYMENT_EXCEEDS_BALANCE`; `amount 0 / -1 / 1.5 → 400`; `một phần → PARTIAL, đủ → PAID`; **`2 payment song song 600k + 600k trên balance 1M → 1×201, 1×422, amountPaid 600k`**; `void payment (M, lý do) → amountPaid giảm, PAID → PARTIAL`; `S void → 403`; `void lý do rỗng → 400`; `invoice VOID nhận payment → 422 INVOICE_VOID`; `overdue: dueDate 2026-01-05, clock 2026-01-05T16:59Z (23:59 VN) → overdue false; 2026-01-05T17:00Z → true`; `PAID không overdue`; `void invoice có payment VALID → 422`; `code PT2026…`; `T, H, A ghi → 403`; `assertInvoiceInvariants` trong `afterEach`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(fees): payments, voids and overdue`.

### Task F-04: Tra cứu, tạo phụ thu, phiếu thu, OutstandingChecker (FR-FEE-06, 07; F-05)

**Files:** `invoices.controller.ts`, `invoices.service.ts`, `apps/api/src/modules/fees/{receipt.ts,outstanding-checker.service.ts}`; tests `apps/api/test/e2e/fees-lookup.e2e-spec.ts`, `apps/api/test/e2e/fees-outstanding.e2e-spec.ts`

**Produces:**
- `GET /invoices` (M,S lọc; T: `studentId ∈ teacherStudentIds` → `Paginated<InvoiceTeacherViewDto>`; H: `studentId = mình`) `ListInvoicesQuery` (`overdue=true` → `dueDate < startOfVnDay(vnDay(now))`, `balance > 0`, `status ≠ VOID`; `from/to` theo `dueDate`); `GET /invoices/:id` (M,S → `InvoiceDetailDto`; H mình → `InvoiceDetailDto`; T scope → `InvoiceTeacherViewDto`; ngoài phạm vi → 404).
- `POST /invoices` (M,S) `CreateInvoiceInput` → 201 `InvoiceDto` `kind SURCHARGE`.
- `GET /payments/:id/receipt.pdf` (M,S,H mình; T → 403) → `application/pdf` (mã PT, HV, số tiền `formatVnd`, hình thức, ngày, người thu).
- `OutstandingCheckerService.hasOverdueBalance(studentId, s?)` = tồn tại invoice của HV `overdue` (cùng định nghĩa F-03).

- [ ] **Step 1 (RED):** `HV chỉ thấy hóa đơn mình; GET /invoices/:id người khác → 404`; `HV TRANSFERRED vẫn thấy hóa đơn`; `GV thấy HV lớp mình, response không có payments/amountPaid/discount`; `GV xem hóa đơn HV ngoài lớp → 404`; `lọc overdue=true / status / from-to / classId / studentId`; `POST SURCHARGE → 201 code HD2026…, kind SURCHARGE`; `SURCHARGE thiếu description → 400`; `receipt → application/pdf, pdfText chứa mã PT và "1.500.000"`; `T receipt → 403`; `A mọi route → 403`. File outstanding: `hasOverdueBalance true khi một hóa đơn quá hạn còn nợ; false khi PAID, VOID, hoặc dueDate hôm nay`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(fees): invoice lookup, surcharge, receipt pdf, outstanding checker`.

### Task F-06: FE Học phí (DESIGN §4.9)

**Files:** `apps/web/src/features/fees/{api.ts,hooks.ts,pages/{fees-page,invoice-detail-page,discounts-page,my-fees-page}.tsx,components/{payment-dialog,discount-dialog,class-fees-tab,student-fees-tab}.tsx,__tests__/*.test.tsx}`, `apps/web/test/msw/fees.handlers.ts`

- [ ] **Step 1 (RED):** `dialog thanh toán: số tiền mặc định = balance hiển thị "1.000.000"; nhập 1.200.000 → lỗi "Số tiền vượt quá số còn nợ" tại chỗ, không gọi POST`; `overdue=true → badge "Quá hạn"`; `M thấy nút Duyệt/Từ chối giảm giá, S không thấy`; `M thấy nút Hủy phiếu thu, S không`; `in phiếu → apiGetBlob('payments/:id/receipt.pdf')`; `/me/fees: mỗi hóa đơn một thẻ hiển thị còn nợ + hạn dd/MM/yyyy + trạng thái`; `/fees chân bảng tổng các dòng trang hiện tại (D20)`; `/fees/discounts liệt kê GET /invoices/discounts/pending`; `GV ở /fees: chỉ cột trạng thái + còn nợ`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): fees screens`.

---

### Task M: Lead — merge & tích hợp Wave 2

**Files:** module files của consumer (Lead được phép khi merge): `apps/api/src/modules/{enrollments,grades,classes}/*.module.ts`, `classes.service.ts` (roster dùng `warningFlags`); `apps/web/src/features/home/pages/student-home.tsx` (D19); `apps/api/test/e2e/flows/w2-*.e2e-spec.ts`; `TASK.md`; `docs/superpowers/wave2-ledger.md`

- [ ] **Step 1:** Mỗi lane: `git -C ../lc-<LANE> rebase main` → `bash scripts/merge-gate.sh <LANE> --ownership-only` xanh.
- [ ] **Step 2:** Merge `--no-ff` theo thứ tự **L-FEES → L-ATTENDANCE → L-GRADES → L-ENROLL** (bên cung cấp token trước); sau mỗi merge `pnpm --filter api test:e2e` xanh.
- [ ] **Step 3 (RED → GREEN, nối dây):** `EnrollmentsModule.imports += FeesModule`, `GradesModule.imports += FeesModule`, `ClassesModule.imports += AttendanceModule` (roster `/classes/:id/students` lấy `absenceWarning` từ `warningFlags`, xóa tính tại chỗ). Flow test viết trước `apps/api/test/e2e/flows/w2-wiring.e2e-spec.ts`: (1) placement → WAITING_CLASS → assign → đúng 1 invoice TUITION `HD2026…`, `enrollment.invoiceId` = id đó; (2) reserve → resume → assign lại → vẫn 1 invoice; (3) transfer → không invoice mới, enrollment mới cùng invoiceId; (4) withdraw CANCELLED khi chưa đóng → invoice VOID; (5) `resultViewRequiresPaidFees=true` + invoice quá hạn → H `/results` 403, thanh toán đủ → 200; (6) điểm danh vượt ngưỡng → `/classes/:id/students` có `absenceWarning: true`. Phải FAIL trước khi nối (no-op), xanh sau.
- [ ] **Step 4:** Gắn `ConfirmClassBanner` vào trang chủ HV; xử lý `docs/contract-requests/*` của W2; ghi Task M notes vào ledger.
- [ ] **Step 5:** Full chain `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && bash scripts/__tests__/merge-gate.test.sh && bash scripts/fr-coverage.sh` → xanh (không chạy hai chain cùng lúc).
- [ ] **Step 6:** Smoke: `pnpm --filter api seed:demo --reset`, chạy 3 dev server, Playwright (Chrome hệ thống): S tạo đợt kiểm tra → T chấm → S xếp lớp từ danh sách chờ → H xác nhận lớp; T điểm danh buổi hôm nay; T tạo bài, nhập, xác nhận → H xem kết quả + tải PDF; S đề xuất giảm giá → M duyệt → S thu tiền 2 lần → PAID. Không 5xx.
- [ ] **Step 7:** Tick ô W2 trong `TASK.md`; final review (opus) → một fix wave → re-review → full chain → `git tag w2` → push `main` + tag; xóa worktree lane.
