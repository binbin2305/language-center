# Wave 3 — Báo cáo, Cổng GV/HV, Tích hợp chéo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiện thực TASK.md Wave 3 — Báo cáo & Dashboard (L-REPORTS), Trang chủ GV/HV trên điện thoại (L-STUDENT-PORTAL), và phần Lead (flow test xuyên module, seed bằng service thật, tóm tắt hồ sơ HV thật, đăng nhập HV bằng email, cột lớp hiện tại, các mục W2 để lại) — rồi merge thành `main` có tag `w3`.

**Architecture:** Lead làm Task 0 (hợp đồng, tuần tự) trên `main`. Sau đó 3 nhánh song song, mỗi nhánh một worktree: `lane/L-REPORTS`, `lane/L-STUDENT-PORTAL` (ownership gate như W2) và `lane/L-LEAD` (Lead, không giới hạn ownership nhưng **không** đụng `modules/reports`, `features/{reports,dashboard,home}` trừ `home-router.tsx`). Trong nhánh task chạy tuần tự. Task M merge theo thứ tự L-LEAD → L-REPORTS → L-STUDENT-PORTAL, xử lý contract request của P-02, full chain, smoke, final review, tag `w3`.

**Tech Stack:** như W2 — NestJS 11, Mongoose 8 (aggregation), exceljs 4, pdfmake 0.3 (`PdfService`), zod 3; React 18, TanStack Query 5, recharts 3, Vitest + RTL + MSW 2.

**Spec:** `PRD.md` §4.9 (FR-RPT-01..06), FR-ADM-04 (email login), FR-STU-02 (summary); `BACKEND_SCHEMA.md` §3.3 Reports, §4 seed; `DESIGN.md` §4.1, §4.2, §4.10; `TASK.md` Wave 3; `docs/DECISIONS.md` (Wave 2 decisions, R22, R23, lock-key protocol); `docs/QUESTIONS.md` (D8, R26); `docs/superpowers/wave2-ledger.md` (deferred minors, re-verification note).

## Global Constraints
- Mọi shell: `export PATH=/opt/homebrew/bin:$PATH`. Commit: `git -c user.name=huybin2305 -c user.email=huybin2305@gmail.com commit …`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase dùng `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env.
- RULES.md nguyên văn: TDD — **RED chạy trước code và dán output RED thô (không tóm tắt) vào báo cáo**; FE: RED là assertion hành vi thất bại, không chỉ "không tìm thấy trang". Test tên tiếng Việt có mã FR; mỗi endpoint test 403 cho **mọi** role không được phép (kể cả ADMIN) và 404 ngoài phạm vi; controller mỏng; `@Roles` tường minh từng route; `ZodValidationPipe(<schema @lc/shared>)`; `toDto`; `ClockService.now()`; ngày-only qua `fromDateOnly/toDateOnly/addVnDays/startOfVnDay/vnDay` (cấm `toISOString().slice`).
- **Reports chỉ đọc**: module reports đọc trực tiếp nhiều collection bằng aggregation (ngoại lệ ARCHITECTURE §4.3), không ghi gì, không import module nghiệp vụ. Định nghĩa trùng với nghiệp vụ phải dùng helper chung: `attendanceRate/absenceRate`, `weightedAverage/classify/isPass` (`@lc/shared`), `overdueFilter`/`isOverdue` (export từ `modules/fees/fees.mapper.ts` — được import, chỉ hàm thuần).
- Lane **không** sửa `packages/shared`, `apps/api/src/{common,database}`, `apps/api/test/{helpers,factories}` (trừ `<lane>.extra.ts`), `app.module.ts`, `apps/web/src/{router.tsx,lib,layouts,auth,components}`, `apps/web/test/msw/handlers.ts`, `package.json`, lockfile. Thiếu hợp đồng → `docs/contract-requests/<lane>-<n>.md`.
- FE: API chỉ qua `features/<m>/api.ts` + `hooks.ts`; `can(user, permission)`, không literal role; form dùng schema `@lc/shared` + `zodResolver`; badge qua `StatusBadge`; lỗi qua `lib/error-messages.ts`; mọi trang render h1 cả khi đang tải (router.test); trang lazy chờ lần đầu `findBy…(…, {}, { timeout: 10_000 })`; mặc định MSW trong `apps/web/test/msw/<lane>.handlers.ts`.
- Test mặc định `DEFAULT_NOW = 2026-01-05T02:00:00Z`; mỗi file e2e một `createTestApp()`.
- Không chạy hai full chain cùng lúc; jest đứng 0% CPU vài phút → kill rồi chạy lại.

## Review Focus
1. **Biên ngày giờ VN trong báo cáo** — payment 31/01 23:30 VN (16:30Z) thuộc tháng 1; lead tạo 00:10 VN ngày `from` được tính, 23:59 VN ngày `to` được tính, 00:00 VN ngày `to+1` không. Test: R-02 (finance), R-02a (admissions).
2. **Chia cho 0 / không dữ liệu** — 0 lead → conversionRate 0 (không NaN); lớp không có điểm → averageScore null; xuất file khi rỗng vẫn hợp lệ với dòng "Không có dữ liệu". Test: R-02a, R-04, R-06.
3. **Khớp số giữa màn hình** — tỷ lệ chuyên cần theo lớp trong báo cáo = `/attendance/summary?groupBy=class` cùng khoảng; công nợ báo cáo = Σ balance hóa đơn không VOID; dashboard "công nợ quá hạn" = `GET /invoices?overdue=true` meta.total. Test: R-03, R-05, R-01.
4. **Mobile 375px cho GV/HV** — không cuộn ngang, nút ≥ 44px trên trang chủ, điểm danh, lịch, kết quả, học phí. Test: P-02.
5. **Đăng nhập HV bằng email trùng** — hai HV dùng chung email phụ huynh: đăng nhập bằng email đó không được vào nhầm tài khoản. Test: L-03.

---

## Lead decisions (đã chốt)
- **D22 Tóm tắt hồ sơ HV (FR-STU-02, thay D7):** `summary.averageScore` = trung bình (làm tròn 2) các `ResultDto.average` khác null của HV trên mọi lớp thuộc `studentClassIds('history')`, null nếu không có; `summary.outstandingBalance` = Σ `balance` các hóa đơn của HV có status ≠ VOID. Tính bằng đọc model trực tiếp trong admissions (đọc mọi model được phép), dùng `weightedAverage` + chỉ bài đã confirm.
- **D23 Đăng nhập HV bằng email (FR-ADM-04, đóng D8):** chỉ STUDENT. Login: input chứa `@` và không khớp `users.username` → tìm `students` có `email` (lowercase) đó, `deletedAt: null`, có `userId`; đúng **một** HV → đăng nhập vào user đó với mật khẩu của user; 0 hoặc ≥ 2 → `401 INVALID_CREDENTIALS` (không lộ trùng). Staff vẫn đăng nhập bằng email username như cũ.
- **D24 Lớp hiện tại (R26):** `StudentDto.currentClasses: { classId, code }[]` (ENROLLED, sắp theo code); GV chỉ thấy các lớp thuộc `teacherClassIds`. Cột "Lớp hiện tại" trên `/students` = các code nối bằng ", ".
- **D25 Dashboard (FR-RPT-06):** `activeStudents` = số HV phân biệt có enrollment ENROLLED; `ongoingClasses` = lớp `PLANNED|ONGOING` (DESIGN "lớp đang mở"); `sessionsToday` = session SCHEDULED có `startAt` trong ngày VN hôm nay; `overdueInvoices` = số hóa đơn thỏa `overdueFilter(now)`; `waitingEnrollments` = số enrollment WAITING_CLASS. Thêm `todaySessions` và `admissionsTrend` (Task 0).
- **D26 Định nghĩa báo cáo:**
  - Tuyển sinh (FR-RPT-01): `leads` = lead có `createdAt` trong [from,to] (ngày VN); `newProfiles` = student có `createdAt` trong khoảng; `conversionRate` = (lead trong khoảng có status PROFILE_CREATED) / `leads`, 0 nếu `leads` = 0; `enrolled` = enrollment có mục history `to: ENROLLED` với `at` trong khoảng; `waiting` = số WAITING_CLASS hiện tại (ảnh chụp). Theo khóa: lead `interestedCourseId`, student/enrollment `courseId`.
  - Chuyên cần (FR-RPT-02): bản ghi điểm danh của session có `startAt` trong khoảng; tỷ lệ bằng helper shared làm tròn 4; `overThreshold` = HV-lớp có `absenceRate > attendanceWarningThreshold` trên các bản ghi trong khoảng.
  - Học tập (FR-RPT-03): chỉ assessment đã confirm có `heldOn` trong khoảng; TB một HV-lớp = `weightedAverage`; TB lớp = trung bình các TB HV (làm tròn 2); `distribution` theo `classify` của từng HV-lớp; `passRate`/`failRate` trên các HV-lớp có TB.
  - Tài chính (FR-RPT-04): `revenue` = Σ payment VALID có `paidAt` trong khoảng; các chỉ số hóa đơn trên hóa đơn ≠ VOID có `createdAt` trong khoảng: `totalDue` Σ finalAmount, `outstanding` Σ balance, `overdue` Σ balance thỏa `overdueFilter(now)`, `totalDiscount` Σ discount.amount APPROVED; `groupBy=month` theo tháng VN (`paidAt` cho revenue, `createdAt` cho hóa đơn), `course`/`class` theo invoice.courseId/classId (payment theo hóa đơn của nó).
- **D27 Cổng GV/HV đọc dữ liệu:** `features/home` dùng hook/query export từ feature sở hữu nếu có; nếu feature chưa export hook cần thiết, lane gọi endpoint trong `features/home/api.ts` (chỉ GET) — không sửa feature khác. Sửa giao diện ở feature khác (P-02) → contract request; Lead làm ở Task M.
- **D28 Seed:** `seed:demo` mới chạy qua service thật (Nest application context `NestFactory.createApplicationContext(AppModule)` + gọi service: convert lead, placement, assign, sessions bulk, attendance, grades, invoices/payments) nên có `classHistory`, history stamp, invoice qua InvoiceCreator; giữ tài khoản demo trong README; `seed:large` (NFR-02) sinh khối lượng lớn bằng insert thô **có** đủ field W2 (classHistory, stamp) — tham số qua env.

---

## File Structure

```
packages/shared/src/schemas/reports.ts    + DashboardDto.todaySessions, admissionsTrend          (Task 0)
packages/shared/src/schemas/students.ts   + StudentDto.currentClasses                            (Task 0)
packages/shared/src/schemas/grades.ts     + PendingAssessmentDto                                 (Task 0)
apps/api/src/database/schemas/enrollment.schema.ts  + index { classHistory: 1 }                 (Task 0)
apps/api/src/modules/grades/assessments.controller.ts  + GET /assessments/pending (T)           (Task 0)
apps/web/src/features/grades/hooks.ts    + usePendingAssessments                                 (Task 0)

apps/api/src/modules/reports/{reports.controller,dashboard.service,admissions-report.service,
  attendance-report.service,academic-report.service,finance-report.service,export.service,report-range}.ts
apps/api/test/e2e/reports-*.e2e-spec.ts
apps/web/src/features/{reports,dashboard}/{api.ts,hooks.ts,pages/*,components/*,__tests__/*}
apps/web/src/features/home/{api.ts,hooks.ts,pages/{teacher-home,student-home}.tsx,components/*,__tests__/*}
Lead (L-LEAD): modules/admissions (summary, currentClasses), modules/auth (email login),
  scripts/seed-demo.ts + scripts/seed-large.ts, test/e2e/flows/w3-*.e2e-spec.ts,
  features/students (cột lớp hiện tại), features/grades/pages/results-page.tsx (lọc khóa/HV),
  features/attendance/components/class-attendance-tab.tsx (hàng theo roster)
```

---

### Task 0: Lead — hợp đồng Wave 3 (trên `main`, trước khi mở nhánh)

**Files:** `packages/shared/src/schemas/{reports,students,grades}.ts` (+ tests), `apps/api/src/database/schemas/enrollment.schema.ts`, `apps/api/src/modules/grades/{assessments.controller,grades.service}.ts`, `apps/api/test/e2e/grades-pending.e2e-spec.ts`, `apps/web/src/features/grades/{api,hooks}.ts`, `apps/web/test/msw/{reports,dashboard,home}.handlers.ts` (rỗng) + `handlers.ts`, `docs/DECISIONS.md` (D22–D28), `docs/QUESTIONS.md` (đóng D8, R26).

**Interfaces — Produces:**
```ts
// reports.ts
DashboardDto += {
  todaySessions: z.array(z.object({ sessionId: zObjectId, startAt: zDateTime, endAt: zDateTime,
    classId: zObjectId, classCode: z.string(), roomCode: z.string().nullable(), teacherName: z.string().nullable(),
    attendanceTaken: z.boolean() })),
  admissionsTrend: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), leads: count, profiles: count })), // 6 tháng gần nhất, cũ → mới
}
// students.ts
StudentDto += { currentClasses: z.array(z.object({ classId: zObjectId, code: z.string() })) }   // D24
StudentBriefDto += same field (teacher view, đã lọc)
// grades.ts
export const PendingAssessmentDto = AssessmentDto.extend({ classCode: z.string(), className: z.string() });
// API: GET /assessments/pending  @Roles(TEACHER) → { data: PendingAssessmentDto[] }
//   = assessment của teacherClassIds, confirmedAt null, heldOn ≤ hôm nay VN, !isLocked; sắp heldOn tăng
// web: usePendingAssessments() trong features/grades/hooks.ts
```

- [ ] **Step 1 (RED):** shared parse tests cho 3 DTO mới (thiếu field bắt buộc → fail); e2e `grades-pending`: `GV thấy bài chưa xác nhận của lớp mình (cả trợ giảng), không thấy bài đã confirm / đã khóa / heldOn tương lai / lớp khác`; `M, S, H, A → 403`; web hook test gọi `GET /assessments/pending`.
- [ ] **Step 2:** chạy → FAIL đúng lý do (dán output).
- [ ] **Step 3 (GREEN):** hiện thực; `StudentDto.currentClasses` thêm vào mapper admissions với `[]` tạm (L-01 điền thật) để contract test cũ không vỡ; index `{ classHistory: 1 }`.
- [ ] **Step 4:** ghi D22–D28 vào `docs/DECISIONS.md`; `docs/QUESTIONS.md` đánh dấu D8 → D23, R26 → D24. `pnpm --filter @lc/shared build`.
- [ ] **Step 5:** full chain xanh; commit `chore(shared): wave 3 contracts`, `feat(grades): pending assessments for teacher home`.
- [ ] **Step 6:** controller chạy `scripts/lane-start.sh` cho L-REPORTS, L-STUDENT-PORTAL, L-LEAD (L-LEAD không có trong lane-owners.json → tạo worktree bằng `git worktree add ../lc-L-LEAD -b lane/L-LEAD main`).

---

## Lane L-REPORTS (worktree `../lc-L-REPORTS`)

`ReportsModule`: `ReportsController @Controller('reports')` với `@Roles(MANAGER, ACADEMIC_STAFF)` trên **mọi** handler (T, H, A → 403). Mỗi báo cáo một service; `report-range.ts`: `vnRange(from, to): { start: Date; end: Date }` = `[startOfVnDay(from), startOfVnDay(addVnDays(to, 1)))`, `to < from` → 400 `fields.to`.

### Task R-01: Dashboard (FR-RPT-06)

**Files:** `apps/api/src/modules/reports/{reports.controller,dashboard.service,report-range}.ts`; test `apps/api/test/e2e/reports-dashboard.e2e-spec.ts`

**Produces:** `GET /reports/dashboard` → `DashboardDto` (D25 + `todaySessions` sắp startAt, `admissionsTrend` 6 tháng VN tính tới tháng hiện tại).

- [ ] **Step 1 (RED)** `describe('FR-RPT-06 Tổng quan')` trên dữ liệu factory xác định: `3 HV ENROLLED (1 HV có 2 lớp) → activeStudents 3`; `lớp PLANNED+ONGOING đếm, FINISHED/INACTIVE không`; `session hôm nay 09:00 và 23:30 VN đếm, 00:30 VN ngày mai không, CANCELLED không`; `overdueInvoices = GET /invoices?overdue=true meta.total` (Review Focus 3); `waitingEnrollments`; `todaySessions[0]` có classCode/roomCode/teacherName/attendanceTaken; `admissionsTrend` 6 phần tử, tháng cũ → mới, lead 31/12 23:30 VN thuộc tháng 12; `T, H, A → 403`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(reports): dashboard`.

### Task R-02: Tuyển sinh + Tài chính (FR-RPT-01, FR-RPT-04)

**Files:** `admissions-report.service.ts`, `finance-report.service.ts`, controller; tests `reports-admissions.e2e-spec.ts`, `reports-finance.e2e-spec.ts`

**Produces:** `GET /reports/admissions` (`AdmissionsReportQuery`) → `AdmissionsReportDto`; `GET /reports/finance` (`FinanceReportQuery`) → `FinanceReportDto` (D26).

- [ ] **Step 1 (RED):**
  - admissions: `lead 00:10 VN ngày from được tính, 23:59 VN ngày to được tính, 00:00 VN ngày to+1 không` (Review Focus 1); `0 lead → conversionRate 0, không NaN` (Focus 2); `2 lead / 1 PROFILE_CREATED → 0.5`; `enrolled đếm mục history to ENROLLED trong khoảng`; `waiting = WAITING_CLASS hiện tại`; `rows theo khóa`, `courseId lọc`; `from > to → 400`; `thiếu from → 400`.
  - finance: `payment 31/01 23:30 VN (2026-01-31T16:30Z) thuộc tháng 2026-01 khi groupBy=month`; `payment VOIDED không tính revenue`; `outstanding = Σ balance hóa đơn ≠ VOID` (Focus 3); `overdue chỉ hóa đơn quá hạn còn nợ`; `totalDiscount chỉ APPROVED`; `groupBy=course` và `class` gom đúng; `T, H, A → 403` cho cả hai.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(reports): admissions and finance reports`.

### Task R-03: Chuyên cần + Học tập (FR-RPT-02, FR-RPT-03)

**Files:** `attendance-report.service.ts`, `academic-report.service.ts`, controller; tests `reports-attendance.e2e-spec.ts`, `reports-academic.e2e-spec.ts`

**Produces:** `GET /reports/attendance` → `AttendanceReportDto`; `GET /reports/academic` → `AcademicReportDto` (D26).

- [ ] **Step 1 (RED):**
  - attendance: `byClass[].attendanceRate khớp GET /attendance/summary?groupBy=class cùng from/to` (Focus 3); `byStudent` đúng; `overThreshold chỉ HV có absenceRate > threshold (=ngưỡng không tính)`; `buổi ngoài khoảng không tính`; `classId/courseId lọc`.
  - academic: `chỉ bài confirm có heldOn trong khoảng`; `TB lớp = trung bình TB HV, làm tròn 2`; `distribution đếm theo classify (8.0 GOOD, 6.5 FAIR, 4.99 FAIL)`; `passRate/failRate`; `lớp không có điểm → averageScore null, passRate null` (Focus 2); `teacherId lọc`; `T, H, A → 403`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(reports): attendance and academic reports`.

### Task R-04: Export xlsx/pdf (FR-RPT-05)

**Files:** `export.service.ts`, controller; test `reports-export.e2e-spec.ts`

**Produces:** `GET /reports/:type/export` (`ReportTypeParam`, `ExportReportQuery`) → xlsx (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) hoặc pdf (`application/pdf`, qua `PdfService`), `Content-Disposition: attachment; filename="bao-cao-<type>-<from>-<to>.<ext>"`. Một sheet / bảng theo `rows` (finance/admissions/academic) hoặc `byClass` (attendance), header tiếng Việt; không có dòng → một dòng "Không có dữ liệu".

- [ ] **Step 1 (RED):** `xlsx mở được bằng exceljs, header đúng, số dòng = rows.length + 1`; `pdf content-type đúng, pdfText chứa tiêu đề báo cáo`; `khoảng không dữ liệu → xlsx 2 dòng (header + "Không có dữ liệu"), pdf chứa "Không có dữ liệu"` (Focus 2); `type lạ → 400`; `format lạ → 400`; `T, H, A → 403`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(reports): xlsx and pdf export`.

### Task R-05: FE Báo cáo (DESIGN §4.10)

**Files:** `apps/web/src/features/reports/{api.ts,hooks.ts,pages/reports-page.tsx,components/*,__tests__/reports.test.tsx}`, `apps/web/test/msw/reports.handlers.ts`

- [ ] **Step 1 (RED):** `tab Tuyển sinh mặc định gọi /reports/admissions?from=<đầu tháng này>&to=<hôm nay>` (FakeTimers/Date cố định); `đổi preset "Quý này" → from = ngày đầu quý`; `tùy chọn khoảng → gửi đúng from/to`; `lọc khóa thêm courseId`; `rỗng → "Không có dữ liệu thống kê cho khoảng thời gian này"`; `Xuất Excel → apiGetBlob('reports/admissions/export?format=xlsx&from=…&to=…')`; `Xuất PDF tương tự`; `tab Tài chính hiển thị 5 thẻ + biểu đồ (recharts container có mặt)`; mỗi tab hiển thị bảng.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): reports screens`.

### Task R-06: FE Dashboard M/S (DESIGN §4.2)

**Files:** `apps/web/src/features/dashboard/{api.ts,hooks.ts,pages/staff-dashboard.tsx,components/*,__tests__/dashboard.test.tsx}`, `apps/web/test/msw/dashboard.handlers.ts`

- [ ] **Step 1 (RED):** `5 thẻ số hiển thị đúng giá trị; click "HV chờ xếp lớp" → /enrollments/waiting, "Công nợ quá hạn" → /fees?overdue=true, "Lớp đang mở" → /classes`; `bảng "Buổi học hôm nay" có cột giờ/lớp/phòng/GV/đã điểm danh`; `rỗng → "Hôm nay không có buổi học"`; `biểu đồ đường tuyển sinh có 6 điểm`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): staff dashboard`.

---

## Lane L-STUDENT-PORTAL (worktree `../lc-L-STUDENT-PORTAL`)

Sở hữu `features/home/**` trừ `home-router.tsx`. Đọc dữ liệu theo D27. `ConfirmClassBanner` đã gắn ở `student-home.tsx` (W2 Task M) — giữ nguyên.

### Task P-01: Trang chủ GV & HV (DESIGN §4.2)

**Files:** `apps/web/src/features/home/{api.ts,hooks.ts,pages/{teacher-home,student-home}.tsx,components/*,__tests__/{teacher-home,student-home}.test.tsx}`, `apps/web/test/msw/home.handlers.ts`

**Consumes:** `GET /sessions?from=<hôm nay>&to=<hôm nay>` (T scope), `usePendingAssessments` (Task 0), `GET /placement-tests?from=<now>` (T scope), `GET /sessions?from=<hôm nay>&to=<hôm nay+14>` (H), `GET /attendance/summary?groupBy=student` (H), `GET /results` (H), `GET /invoices` (H).

- [ ] **Step 1 (RED):**
  - GV: `"Buổi dạy hôm nay" thẻ lớn mỗi buổi với nút "Điểm danh" → /sessions/:id/attendance`; `buổi đã điểm danh hiện "Đã điểm danh"`; `"Bài cần nhập điểm" liệt kê pending → link /assessments/:id/grades`; `"Kiểm tra đầu vào sắp tới"`; mỗi khối rỗng có thông điệp riêng ("Hôm nay không có buổi dạy", "Không có bài cần nhập điểm", "Không có đợt kiểm tra sắp tới").
  - HV: `buổi học tiếp theo (gần nhất trong tương lai)`; `tỷ lệ chuyên cần "75%"`; `điểm TB hiện tại` (trung bình các `average` khác null; không có → "Chưa có điểm"); `còn nợ Σ balance + hạn gần nhất`, `không nợ → "Không còn nợ"`; banner xác nhận lớp vẫn hiển thị và `POST /enrollments/:id/confirm` → biến mất; 403 FEES_OUTSTANDING từ /results → khối điểm hiện cảnh báo, các khối khác vẫn hiển thị.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(web): teacher and student home`.

### Task P-02: Kiểm tra mobile 375px (NFR, Review Focus 4)

**Files:** `apps/web/src/features/home/__tests__/mobile-375.test.tsx` (RTL + `apps/web/test/media.ts` viewport 375), `docs/contract-requests/L-STUDENT-PORTAL-<n>.md` cho lỗi ở feature khác

- [ ] **Step 1:** test render ở 375px các trang: `/` (T, H), `/sessions/:id/attendance` (T), `/schedule` (T, H), `/me/results`, `/me/fees`, `/me/attendance`, `/me/classes`: không phần tử nào có `scrollWidth > clientWidth` ở container chính (bảng phải bọc `overflow-x-auto` hoặc chuyển dạng thẻ), mọi `button`/`a[role=button]` hành động chính có class `min-h-11` (hoặc kích thước ≥ 44px).
- [ ] **Step 2:** chạy; lỗi trong `features/home` → sửa tại chỗ (TDD); lỗi ở feature khác → **không sửa**, đánh dấu test `it.todo`/`it.fails` có mã contract request và ghi `docs/contract-requests/L-STUDENT-PORTAL-<n>.md` (trang, phần tử, kích thước đo được, đề xuất).
- [ ] **Step 3:** commit `test(web): mobile 375 checks for teacher and student flows`.

---

## Lane L-LEAD (worktree `../lc-L-LEAD`, Lead)

### Task L-01: Hồ sơ HV — tóm tắt thật + lớp hiện tại (D22, D24)

**Files:** `apps/api/src/modules/admissions/{students.service,admissions.mapper}.ts`; tests `apps/api/test/e2e/admissions-students-summary.e2e-spec.ts`; web `apps/web/src/features/students/pages/students-page.tsx` + test

- [ ] **Step 1 (RED):** `summary.averageScore = trung bình các TB lớp đã confirm (lớp A 8.0, lớp B 6.5 → 7.25)`; `không có điểm → null`; `bài nháp không tính`; `outstandingBalance = Σ balance ≠ VOID (VOID bỏ qua)`; `HV TRANSFERRED vẫn tính điểm lớp cũ`; `currentClasses = các lớp ENROLLED`; `GV chỉ thấy lớp của mình trong currentClasses`; web: `/students có cột "Lớp hiện tại" hiển thị "IELTS-01, JPN-N5-01"`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(admissions): real student summary and current classes`.

### Task L-02: Đăng nhập HV bằng email (D23, FR-ADM-04)

**Files:** `apps/api/src/modules/auth/auth.service.ts`; test `apps/api/test/e2e/auth-email-login.e2e-spec.ts`

- [ ] **Step 1 (RED):** `HV có email a@x.vn đăng nhập "A@X.VN" + đúng mật khẩu → 200, user là HV đó`; `sai mật khẩu → 401 INVALID_CREDENTIALS, tăng failedLoginCount của user đó`; **`hai HV cùng email → 401 INVALID_CREDENTIALS cho cả hai mật khẩu`** (Focus 5); `HV xóa mềm → 401`; `staff đăng nhập bằng email username như cũ`; `mã HV vẫn đăng nhập được`; `thông điệp lỗi không phân biệt các trường hợp`.
- [ ] **Step 2–4:** RED → GREEN → commit `feat(auth): student login by email`. Ghi README (đăng nhập HV bằng mã hoặc email).

### Task L-03: Flow test xuyên module (W3-L2)

**Files:** `apps/api/test/e2e/flows/w3-flows.e2e-spec.ts` (không lặp case đã có trong `flows/w2-*.e2e-spec.ts` — ghi trong file các case đã được W2 phủ)

- [ ] **Step 1:** viết case còn thiếu của TASK W3-L2: (4) hủy buổi → `PUT attendance` 422 SESSION_CANCELLED; HV ENROLLED nhận notification SESSION_CANCELLED; (8) kết thúc lớp → enrollment COMPLETED; HV vẫn xem `/attendance`, `/results`, transcript lớp đó; (1-mở rộng) lead → convert → placement → assign qua HTTP từ đầu, hóa đơn đúng amount/due (R23). Case (2),(3),(5),(6),(7) trỏ tới test W2 trong comment.
- [ ] **Step 2:** chạy; case fail vì lỗi thật → sửa lỗi theo TDD (ghi vào report), không chỉnh test cho khớp.
- [ ] **Step 3:** commit `test(api): wave 3 cross-module flows`.

### Task L-04: Seed bằng service thật + seed:large (W3-L3, D28)

**Files:** `apps/api/scripts/seed-demo.ts` (viết lại), `apps/api/scripts/seed-large.ts`, `apps/api/package.json` (script `seed:large`), README; test `apps/api/test/e2e/seed-demo.e2e-spec.ts` (chạy hàm seed trên DB test)

- [ ] **Step 1 (RED):** test gọi `runSeedDemo(app)` trên app test: `đủ số lượng BACKEND_SCHEMA §4 (1 ADMIN, 1 MANAGER, 2 S, 5 T, 60 HV, 3 khóa, 6 phòng, 8 lớp đủ trạng thái)`; `mọi enrollment có classId thì classHistory chứa classId và mục history to ENROLLED có classId` (lỗi smoke 2026-11-01); `hóa đơn có đủ UNPAID/PARTIAL/PAID/quá hạn và assertInvoiceInvariants xanh`; `có điểm danh 4 tuần đã qua, 2 bài đánh giá đã confirm`; `chạy lại với --reset idempotent`; `HV demo đăng nhập được (mã HV và Password1)`.
- [ ] **Step 2–3:** GREEN: dùng `NestFactory.createApplicationContext(AppModule)` + service thật, `FakeClock`/`ClockService` cố định ngày demo; `seed:large` env `SEED_STUDENTS` (mặc định 5000), `SEED_CLASSES` (200) chèn thô có đủ field W2.
- [ ] **Step 4:** chạy thật `pnpm --filter api seed:demo --reset` trên dev DB thành công; commit `feat(seed): service-driven demo seed and seed:large`.

### Task L-05: Mục W2 để lại (UI)

**Files:** `apps/web/src/features/grades/pages/results-page.tsx` (+ test), `apps/web/src/features/attendance/components/class-attendance-tab.tsx` (+ test)

- [ ] **Step 1 (RED):** `/results lọc khóa → courseId, lọc HV (ô tìm) → studentId`; `ma trận điểm danh: hàng = roster GET /classes/:id/students ∪ HV có bản ghi; HV chưa có bản ghi hiện hàng trống; lớp chưa có bản ghi vẫn hiện cột buổi`.
- [ ] **Step 2–4:** RED → GREEN → commit `fix(web): results filters and roster-based attendance matrix`.

---

### Task M: Lead — merge & hoàn tất Wave 3

**Files:** mọi đường dẫn cần cho merge; `TASK.md`; `docs/superpowers/wave3-ledger.md`

- [ ] **Step 1:** `bash scripts/merge-gate.sh L-REPORTS --ownership-only`, `… L-STUDENT-PORTAL --ownership-only`; L-LEAD kiểm tay không đụng `modules/reports`, `features/{reports,dashboard,home}` (trừ `home-router.tsx`).
- [ ] **Step 2:** merge `--no-ff` theo thứ tự L-LEAD → L-REPORTS → L-STUDENT-PORTAL; api e2e + web test sau mỗi merge.
- [ ] **Step 3:** xử lý `docs/contract-requests/L-STUDENT-PORTAL-*.md` và các W3 khác (TDD; bật lại test `it.todo/it.fails` của P-02).
- [ ] **Step 4:** full chain `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && bash scripts/__tests__/merge-gate.test.sh && bash scripts/fr-coverage.sh` — FR-RPT-01..06, FR-ADM-04, FR-STU-02 phải có trong coverage.
- [ ] **Step 5:** `pnpm --filter api seed:demo --reset` (seed mới) + smoke Playwright (Chrome hệ thống): M dashboard → báo cáo 4 tab + xuất Excel/PDF; T trang chủ → Điểm danh buổi hôm nay → bài cần nhập điểm; H trang chủ (375px) → xác nhận lớp, kết quả, học phí; HV đăng nhập bằng email; `/students` cột lớp hiện tại. Không 5xx.
- [ ] **Step 6:** final review (opus) → một fix wave → re-review → full chain → tick TASK.md W3 → `git tag w3` → push `main` + tag → xóa worktree; ghi `docs/superpowers/wave3-ledger.md` + `handoff-wave4.md`.
