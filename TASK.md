# TASK — Kế hoạch triển khai (TDD, agent swarm)

## Cách đọc
- Công việc chia **Wave**. Các lane trong cùng wave chạy **song song** (mỗi lane = 1 agent, 1 worktree, nhánh `lane/<id>`). Wave sau bắt đầu khi wave trước đã merge và **merge gate** xanh.
- Mỗi task liệt kê **Test viết trước** — đó là danh sách RED tối thiểu; agent được thêm test nhưng không bớt.
- Ký hiệu: `[ ]` chưa làm · `[~]` đang làm · `[x]` xong. Agent tự cập nhật ô của mình.
- **Lead** = agent điều phối: làm Wave 0, review, merge, sở hữu file chung (RULES §2).

```
W0  Lead: nền móng + hợp đồng + auth + khung FE            (tuần tự)
 │
W1  ┌ L-CATALOG ┬ L-ADMISSIONS ┬ L-CLASSES ┬ L-SCHEDULE ┐      (song song)
 │
W2  ┌ L-ENROLL ┬ L-ATTENDANCE ┬ L-GRADES ┬ L-FEES ┐           (song song)
 │
W3  ┌ L-REPORTS ┬ L-STUDENT-PORTAL ┬ Lead: tích hợp chéo + seed ┐
 │
W4  ┌ L-E2E ┬ L-HARDENING ┐                                   (song song)
```

[Quyết định – điều chỉnh ARCHITECTURE] Để lane chạy song song, **mọi Mongoose schema + index nằm ở `apps/api/src/database/schemas/` và test factory ở `apps/api/test/factories/` do Lead viết ở W0**. Module được **đọc** mọi model; chỉ module sở hữu được **ghi** (owner ghi ở BACKEND_SCHEMA §2: leads/students→admissions, enrollments/placement_tests→enrollments, classes→classes, sessions→schedule, attendances/attendance_warnings→attendance, assessments/grades→grades, invoices/payments→fees, courses/rooms/settings/users→catalog/auth). Ngoại lệ được phép: `classes.currentSize` chỉ do enrollments `$inc`. Lane cần factory bổ sung → tạo `apps/api/test/factories/<lane>.extra.ts`.

---

## Wave 0 — Nền móng (Lead, tuần tự)

### [ ] W0-01 Khởi tạo monorepo
- pnpm workspace: `apps/api` (Nest CLI), `apps/web` (Vite react-ts), `packages/shared` (tsup build, export ESM+CJS, alias `@lc/shared`).
- TS strict ở mọi package; ESLint + Prettier gốc; scripts gốc `dev`, `test`, `lint`, `typecheck`, `e2e`.
- `docker-compose.yml`: `mongo:7` với `--replSet rs0` + healthcheck chạy `rs.initiate()`.
- `.env.example` cho api & web; `.gitignore`; `docs/QUESTIONS.md`, `docs/DECISIONS.md`, `docs/contract-requests/`.
- **Test viết trước:** smoke test `GET /api/v1/health → 200 {status:'ok', db:'up'}`; smoke test FE render `<App/>` không lỗi.
- **Xong khi:** `pnpm i && pnpm lint && pnpm typecheck && pnpm test` xanh từ clone sạch.

### [ ] W0-02 `packages/shared` — hợp đồng cho TẤT CẢ module
- `enums.ts`, `errors.ts` (ErrorCode + HTTP status mặc định), `events.ts`, `permissions.ts` (ma trận PRD §3 dạng `permission → Role[]` + `can(user, permission)`), `time.ts` (`vnDay`, `startOfVnDay`, `addVnDays`, `isSameVnDay`), `money.ts` (`applyDiscount`, `formatVnd`), `grading.ts` (`weightedAverage`, `classify`), `text.ts` (`removeVietnameseTones`).
- `schemas/*.ts`: zod input + response cho mọi endpoint BACKEND_SCHEMA §3 (auth, users, courses, rooms, settings, leads, students, enrollments, placement, classes, sessions, attendance, assessments, grades, results, invoices, payments, reports, notifications). `zObjectId`, `zVnPhone`, `zScore`, `zMoney`, `Paginated<T>`.
- **Test viết trước:**
  - `can()` khớp từng ô ma trận PRD §3 (test bảng: mỗi permission × mỗi role).
  - `vnDay`: 2026-01-14T17:30Z → 15/01 giờ VN; ranh giới nửa đêm.
  - `applyDiscount`: 10% của 1.555.555 = 155.556 (làm tròn), AMOUNT > giá → lỗi; kết quả luôn số nguyên.
  - `weightedAverage` bỏ qua bài chưa có điểm; `classify` đúng ở mọi ngưỡng biên (4.99, 5.0, 6.49, 6.5, 7.99, 8.0, 8.99, 9.0).
  - `removeVietnameseTones('Nguyễn Đức')==='nguyen duc'`.
  - zod: `zVnPhone` chấp nhận `0912345678`, `+84912345678` (chuẩn hóa về `0912345678`), từ chối `12345`; `zMoney` từ chối 1.5, -1 (hình dạng: số nguyên ≥ 0).
  - `isValidScore`: từ chối 10.25, 7.3, -1; chấp nhận 0, 7.25, 10. Zod của điểm chỉ kiểm `number|null` (ARCHITECTURE §5.1).
  - `ENROLLMENT_TRANSITIONS`, `CLASS_TRANSITIONS` (bảng chuyển trạng thái BACKEND_SCHEMA) + `canTransition(from,to)`: test toàn bộ cặp.
- **Xong khi:** coverage shared ≥ 95%.

### [ ] W0-03 API common + database + test harness
- `config` (zod env), `AppError` + `HttpExceptionFilter` (định dạng lỗi BACKEND_SCHEMA §3.1, map lỗi zod → `VALIDATION_FAILED` + `details.fields`, lỗi duplicate key Mongo → 409), `ZodValidationPipe`, `JwtAuthGuard`, `RolesGuard` (fail-closed), `@Roles`, `@CurrentUser`, `ClockService`, `withTransaction`, `CounterService`, `AuditService`, `NotificationsService.notify(userIds, payload)`, `SettingsService` (cache + invalidate), pagination helper, **`ScopeService`** (`teacherClassIds`, `teacherCanTakeAttendance`, `studentClassIds(user,'current'|'history')`, `teacherStudentIds` — ARCHITECTURE §4.6).
- `database/schemas/*`: toàn bộ collection BACKEND_SCHEMA §2 với index.
- Test harness: `createTestApp()` (MongoMemoryReplSet, DB riêng mỗi file, `FakeClock`), `loginAs(role, overrides?)`, factories cho mọi collection (`makeCourse`, `makeClass`, `makeStudent({withUser})`, `makeEnrollment`, `makeSession`, `makeInvoice`, ...).
- **Test viết trước:** ScopeService: trợ giảng có lớp trong `teacherClassIds`; GV dạy thay một buổi được `teacherCanTakeAttendance` buổi đó nhưng không có lớp trong `teacherClassIds`; HV có enrollment TRANSFERRED thấy lớp cũ ở `history` nhưng không ở `current`; route không có `@Roles` → 403; lỗi zod → 400 với `details.fields.email`; `AppError('CLASS_FULL',422)` → đúng body; duplicate key → 409; `withTransaction` rollback khi throw; `CounterService` 50 lần gọi song song → 50 số khác nhau liên tiếp; mọi index unique tồn tại sau `syncIndexes`.

### [ ] W0-04 Auth & Users core
- FR-AUTH-01, FR-AUTH-02, model users, refresh token xoay vòng, khóa sau 5 lần sai, rate limit (`@nestjs/throttler`), seed ADMIN.
- `UsersService.createStudentAccount(studentId, code, session)` → `{ userId, tempPassword }` (username = mã HV, không lưu email) — dùng bởi admissions.
- **Test viết trước:** login đúng → access + cookie; sai mật khẩu → 401 INVALID_CREDENTIALS (thông điệp không phân biệt sai user/sai pass); lần sai thứ 5 → 423/ACCOUNT_LOCKED, sau 15 phút (FakeClock) đăng nhập được; refresh dùng lại token cũ → 401 và thu hồi cả chuỗi; logout → refresh 401; `mustChangePassword` → mọi route trừ `/auth/*` trả 403 PASSWORD_CHANGE_REQUIRED; đổi mật khẩu sai policy → 400; response không bao giờ có `passwordHash` (assert trên mọi endpoint auth/users); STUDENT đăng nhập bằng mã HV.

### [ ] W0-05 Khung module API
- Tạo module rỗng (module + controller + service, chưa route) cho: users, courses, rooms, settings, admissions, enrollments, placement, classes, schedule, attendance, grades, fees, reports, notifications; đăng ký trong `app.module.ts`.
- `enrollments`: hiện thực sẵn `EnrollmentsService.createPending(studentId, courseId, session)` (FR-ADM-05) — chặn trùng enrollment hoạt động → 409 ENROLLMENT_EXISTS.
- Token DI `INVOICE_CREATOR` (interface `createForEnrollment(enrollmentId, session)`, `voidForEnrollment(enrollmentId, reason, session)`), mặc định do fees module cung cấp bản no-op cho tới W2.
- Notifications API đầy đủ (FR-NTF-01): list, unread-count, read, read-all.
- **Test viết trước:** createPending tạo `PENDING_PLACEMENT` + history; trùng → 409; notifications chỉ trả của user hiện tại (user khác → không thấy, đánh dấu đọc của người khác → 404).

### [ ] W0-06 Khung Web
- Tailwind + shadcn/ui + theme token DESIGN §2 + font Be Vietnam Pro + dark mode.
- `lib/api.ts` (ky, refresh 1 lần khi 401), `lib/queryClient.ts`, `lib/format.ts`, `lib/status.ts`, `lib/error-messages.ts` (đủ mọi ErrorCode), `auth/AuthProvider`, `auth/RequireRole`, `layouts/AppShell` (sidebar theo role DESIGN §3, bottom nav mobile, chuông thông báo), `router.tsx` với **mọi route DESIGN §4** trỏ tới page placeholder trong `features/<m>/pages`.
- Trang: Login, Change password, Notifications (đầy đủ), 404, 403.
- `HomeRouter` cho `/` theo role; khung tab cho `/classes/:id` và `/students/:id` với component placeholder trong feature của lane sở hữu từng tab; placeholder cho mọi trang `/me/*` trong feature tương ứng (ARCHITECTURE §5).
- Component chung DESIGN §5.
- `test/`: setup Vitest + RTL + MSW server, `renderWithProviders(ui, {user, route})`.
- **Test viết trước:** login sai → hiện "Sai thông tin đăng nhập"; login đúng role TEACHER → sidebar đúng mục; `mustChangePassword` → bị chuyển tới `/change-password`; 401 → gọi refresh rồi retry đúng 1 lần, refresh fail → về `/login`; `RequireRole` chặn route; `DataTable` hiển thị EmptyState khi rỗng; `MoneyInput` gõ `1500000` hiển thị `1.500.000`, giá trị form là số nguyên; `formatVnd(1500000) === '1.500.000 ₫'`.

### [ ] W0-07 CI & quy trình swarm
- Script `scripts/lane-start.sh <lane>`: tạo worktree `../lc-<lane>` nhánh `lane/<lane>` từ `main`.
- Script `scripts/merge-gate.sh`: `pnpm i --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` + kiểm tra ownership (`git diff --name-only main...lane/x` chỉ chứa đường dẫn của lane).
- GitHub Actions (nếu có remote) chạy merge-gate.

**Merge gate W0:** mọi task W0 `[x]`; merge-gate xanh; Lead tag `w0`.

---

## Wave 1 — 4 lane song song

### L-CATALOG — Khóa học, Phòng, Tài khoản, Cài đặt
Sở hữu: `modules/{users,courses,rooms,settings}`, `features/{users,courses,rooms,settings}`.
- [ ] **C-01 Courses API** (FR-FEE-01 phần baseFee). Test trước: CRUD M/S được, T/H GET được POST 403; code trùng (khác hoa thường) → 409; levels rỗng → 400; baseFee 1.5 → 400; lưu trữ (ARCHIVED) không hiện trong lựa chọn tạo lead.
- [ ] **C-02 Rooms API.** Test trước: CRUD, code trùng 409, capacity 0 → 400, T/H → 403.
- [ ] **C-03 Users API** (FR-USR-01). Test trước: M/A tạo TEACHER có teacherProfile → trả tempPassword + mustChangePassword; S tạo user → 403; không ai tạo được ADMIN qua API; khóa user → đăng nhập 423; reset password; `GET /teachers` cho M,S.
- [ ] **C-04 Settings API** (FR-SET-01). Test trước: chỉ M PATCH; threshold ngoài [0,1] → 400; gradeLockDays số nguyên 0–365.
- [ ] **C-05 FE: Khóa học, Phòng, Tài khoản, Cài đặt** (DESIGN §4.11). Test trước: tạo khóa thành công → hàng mới xuất hiện; lỗi 409 hiện dưới ô mã; tạo GV hiện dialog mật khẩu tạm có nút sao chép; S không thấy menu Tài khoản/Cài đặt.

### L-ADMISSIONS — Tuyển sinh & Hồ sơ học viên
Sở hữu: `modules/admissions`, `features/{admissions,students}` (trừ trang placement).
- [ ] **A-01 Leads API** (FR-ADM-01, 02, 08). Test trước: tạo thiếu từng trường bắt buộc → 400 đúng field; SĐT `+849...` lưu thành `09...`; trùng SĐT với lead khác hoặc student → 409 DUPLICATE_PERSON kèm danh sách; `?force=true` vẫn lưu; trùng email (khác hoa thường) → 409; course ARCHIVED → 400; lọc status/khóa/ngày; T/H → 403; cancel lead.
- [ ] **A-02 Convert lead → student** (FR-ADM-02, 03, 04, 05). Test trước: SĐT trùng học viên khác → 409 DUPLICATE_PERSON, `?force=true` → tạo được (hai anh em cùng SĐT); tạo student mã `HV2026xxxxx` (FakeClock năm 2026) + user STUDENT mustChangePassword + enrollment PENDING_PLACEMENT, lead → PROFILE_CREATED, tất cả trong một transaction (giả lập lỗi ở bước cuối → không còn document nào); lead không tồn tại → 404 LEAD_NOT_FOUND; convert lần hai → 409 PROFILE_EXISTS; 20 convert song song → 20 mã khác nhau; audit log tạo.
- [ ] **A-03 Students search & detail** (FR-STU-01, 02). Test trước: tìm "nguyen van" khớp "Nguyễn Văn A"; tìm theo mã, SĐT, email; phân trang; GV chỉ thấy học viên có enrollment ENROLLED trong lớp mình dạy, xem học viên khác → 404, response GV không có email/address; HV xem chính mình được, người khác → 404; hồ sơ xóa mềm → 404; detail kèm enrollments.
- [ ] **A-04 Students update + documents + audit** (FR-STU-03, 04, FR-ADM-06). Test trước: PATCH ghi audit before/after; đổi SĐT trùng học viên khác → vẫn 200 kèm `warnings.duplicates`; HV `PATCH /students/me/contact` chỉ nhận phone/email/address (field khác → 400); upload 6MB → 400 FILE_TOO_LARGE; `.exe` → 400 FILE_TYPE_NOT_ALLOWED; tải/xóa giấy tờ; T → 403.
- [ ] **A-05 FE Tuyển sinh** (DESIGN §4.3 trừ placement). Test trước: submit thiếu SĐT → lỗi dưới ô; 409 → dialog "Có thể đã tồn tại" có link hồ sơ + "Vẫn lưu"; convert → dialog mã HV + mật khẩu tạm.
- [ ] **A-06 FE Học viên** (DESIGN §4.4). Test trước: gõ tìm kiếm debounce gọi API một lần; tabs theo role (GV không thấy tab Học phí/Giấy tờ/Lịch sử); sửa rồi Hủy → hỏi bỏ thay đổi; HV `/me/profile` chỉ sửa được 3 trường.

### L-CLASSES — Lớp học
Sở hữu: `modules/classes`, `features/classes` (tab Học viên/Thông tin; các tab khác là slot do lane khác lấp — Lead tạo sẵn slot ở W0-06).
- [ ] **CL-01 Classes CRUD** (FR-CLS-01, 02, 03). Test trước: tạo thiếu trường → 400; mã trùng khác hoa thường → 409 CLASS_CODE_EXISTS; level không thuộc course.levels → 400; teacherId không phải TEACHER → 400; endDate < startDate → 400; PATCH maxCapacity < currentSize → 422 CAPACITY_BELOW_CURRENT; PATCH không được sửa currentSize (field bị loại/400); chuyển chuyển trạng thái theo bảng CLASS_TRANSITIONS, sai → 422 INVALID_STATUS_TRANSITION; → FINISHED phát event `class.finished` (assert bằng spy); T/H → 403 cho ghi.
- [ ] **CL-02 Xóa / ngừng lớp** (FR-CLS-04). Test trước: lớp không dữ liệu liên quan → 204 và biến mất; có enrollment ENROLLED → 422 CLASS_HAS_DEPENDENCIES `details.reasons` chứa `ACTIVE_STUDENTS`; có session/grade/invoice → 422 với lý do tương ứng; deactivate → INACTIVE.
- [ ] **CL-03 Tìm lớp & danh sách học viên lớp** (FR-CLS-05). Test trước: lọc khóa+level+`hasSeat=true` loại lớp đầy và lớp FINISHED/INACTIVE; GV `GET /classes` chỉ `teacherClassIds`; HV mặc định `studentClassIds('current')`, `?includePast=true` → `'history'`; `/classes/:id/students` ngoài phạm vi → 404.
- [ ] **CL-04 FE Lớp học** (DESIGN §4.5 phần lớp). Test trước: CapacityBar đỏ khi 20/20; dialog sửa max < hiện tại hiện lỗi; xóa 422 → hiện lý do + nút "Chuyển sang Ngừng hoạt động".

### L-SCHEDULE — Lịch học
Sở hữu: `modules/schedule`, `features/schedule`.
- [ ] **S-01 Conflict checker** (FR-SCH-03; dùng cả bởi placement). Unit test trước (bảng): chồng hoàn toàn, chồng một phần đầu/cuối, chạm biên (18:00–19:30 và 19:30–21:00 → KHÔNG xung đột), cùng phòng khác GV, cùng GV khác phòng, buổi CANCELLED bỏ qua, loại trừ chính nó khi update, placement test SCHEDULED cũng chặn.
- [ ] **S-02 Tạo buổi & tạo lặp** (FR-SCH-01, 02, 03). Test trước: bulk T2/T4/T6 18:00–19:30 từ 05/01 đến 30/01/2026 sinh đúng 12 buổi với giờ UTC đúng (11:00Z); một buổi xung đột → 409 kèm danh sách và **không tạo buổi nào**; buổi ngoài [startDate,endDate] lớp → 422 SESSION_OUTSIDE_CLASS_RANGE; endTime ≤ startTime → 400; phòng nhỏ hơn sĩ số → 201 kèm `warnings`; `/sessions/check-conflicts` không ghi DB; T/H → 403.
- [ ] **S-03 Sửa & hủy** (FR-SCH-04, 05). Test trước: đổi phòng gây xung đột → 409; sửa buổi không tồn tại → 404; đổi giờ buổi đã điểm danh hoặc đã qua → 422 SESSION_LOCKED; hủy thiếu lý do → 400 REASON_REQUIRED; hủy buổi đã bắt đầu → 422 SESSION_NOT_CANCELLABLE; `cancel-future` chỉ hủy buổi có startAt > now.
- [ ] **S-04 Xem lịch & thông báo** (FR-SCH-06, 07, 08). Test trước: thiếu from/to → 400; khoảng > 92 ngày → 400; HV: buổi tương lai của `studentClassIds('current')` + buổi đã qua của `'history'`; GV: buổi của `teacherClassIds` + buổi mình dạy thay; M/S lọc classId/teacherId/roomId; status suy ra COMPLETED khi đã điểm danh và qua endAt; tạo/sửa/hủy gọi `NotificationsService.notify` với GV + HV ENROLLED của lớp (assert userIds).
- [ ] **S-05 FE Lịch** (DESIGN §4.6). Test trước: dialog lặp hiển thị "Sẽ tạo 12 buổi"; xung đột từ dry-run hiển thị ConflictList và nút Tạo disabled; hủy buổi yêu cầu lý do; mobile (375px) mặc định chế độ danh sách; rỗng → "Chưa có lịch học".

**Merge gate W1:** 4 lane rebase + merge-gate xanh từng lane → Lead merge tuần tự → merge-gate xanh trên `main` → tag `w1`.

---

## Wave 2 — 4 lane song song

### L-ENROLL — Kiểm tra đầu vào & Xếp lớp
Sở hữu: `modules/{enrollments,placement}`, `features/{enrollments,placement}`.
- [ ] **E-01 Đăng ký khóa học & đổi khóa** (FR-ADM-06 phần khóa, FR-ADM-07). Test trước: HV tự đăng ký khóa → PENDING_PLACEMENT; trùng hoạt động → 409; HV đổi khóa khi PENDING_PLACEMENT được, khi WAITING_CLASS → 422 ENROLLMENT_INVALID_STATE; HV đổi enrollment của người khác → 404.
- [ ] **E-02 Kiểm tra đầu vào** (FR-PLT-01..04). Test trước: tạo đợt xung đột phòng/GV với session → 409; thêm thí sinh không phải PENDING_PLACEMENT → 422; chỉ GV được phân công nhập kết quả (GV khác → 404); điểm sai thang → 400; level không thuộc khóa → 400; có kết quả → enrollment WAITING_CLASS + placementLevel + waitingSince; skip-placement cần lý do.
- [ ] **E-03 Xếp lớp** (FR-CLS-06). Test trước: enrollment không WAITING_CLASS → 422 ENROLLMENT_INVALID_STATE; khác khóa → 422 COURSE_MISMATCH; lệch level không lý do → 422 LEVEL_MISMATCH, có lý do → 201 + levelOverride; lớp FINISHED/INACTIVE → 422 CLASS_NOT_OPEN; lớp đầy → 422 CLASS_FULL; **10 request song song vào lớp còn 1 chỗ → đúng 1 thành công, currentSize = max**; thành công → ENROLLED, currentSize+1, gọi `INVOICE_CREATOR` đúng 1 lần (fake), thông báo CLASS_ASSIGNED tới HV; lỗi trong InvoiceCreator → rollback toàn bộ.
- [ ] **E-04 Chuyển lớp, rút, bảo lưu, học lại, kết thúc lớp, xác nhận, danh sách chờ** (FR-CLS-07..11). Test trước: chuyển trạng thái sai bảng → 422 INVALID_STATUS_TRANSITION; withdraw CANCELLED khi hóa đơn chưa đóng → gọi `InvoiceCreator.voidForEnrollment` (fake), đã đóng một phần → không void; resume RESERVED → WAITING_CLASS rồi assign lại → InvoiceCreator được gọi nhưng không tạo hóa đơn mới (idempotent, kiểm ở W3-L2); nghe `class.finished` → mọi ENROLLED → COMPLETED, sĩ số giữ nguyên; transfer → cũ TRANSFERRED, mới ENROLLED, sĩ số -1/+1 trong transaction, lớp đích đầy → 422 và không đổi gì; transfer khác khóa → 422; withdraw → sĩ số -1; HV confirm của mình → confirmedAt, của người khác → 404; `/enrollments/waiting` sắp theo waitingSince và có `waitingDays`.
- [ ] **E-05 FE Kiểm tra đầu vào** (DESIGN §4.3 placement). Test trước: tạo đợt hiển thị xung đột; GV chấm: điểm 11 viền đỏ.
- [ ] **E-06 FE Danh sách chờ & panel xếp lớp** (DESIGN §4.5). Test trước: chọn HV → lớp phù hợp hiển thị trước, lớp lệch level trong nhóm "Khác" và yêu cầu lý do; CLASS_FULL → thông báo và tự làm mới; chờ > 14 ngày tô cam; HV thấy banner xác nhận lớp ở trang chủ.

### L-ATTENDANCE — Điểm danh
Sở hữu: `modules/attendance`, `features/attendance`.
- [ ] **AT-01 Điểm danh lần đầu** (FR-ATT-01, 02). Test trước: GV của buổi điểm danh đủ → 200, attendanceTakenAt set; GV dạy thay (session.teacherId) và trợ giảng lớp → 200; GV khác → 404; HV → 403; thiếu 1 HV → 400 ATTENDANCE_INCOMPLETE kèm studentIds; studentId không thuộc roster → 400 STUDENT_NOT_IN_ROSTER; buổi CANCELLED → 422 SESSION_CANCELLED; trước startAt − 15' → 422 ATTENDANCE_TOO_EARLY (FakeClock); roster chỉ gồm ENROLLED tại thời điểm buổi học (HV chuyển đi trước buổi không có, HV TRANSFERRED sau buổi vẫn có trong lịch sử); PUT lần hai → 409 ATTENDANCE_ALREADY_TAKEN (dùng PATCH).
- [ ] **AT-02 Cập nhật điểm danh** (FR-ATT-03). Test trước: PATCH đổi trạng thái → history `{from,to,by,at,reason}`; GV sau 7 ngày → 422 ATTENDANCE_EDIT_WINDOW_CLOSED; S sau 30 ngày vẫn được; audit log.
- [ ] **AT-03 Lịch sử & tổng hợp** (FR-ATT-04). Test trước: tỷ lệ = (PRESENT+LATE)/tổng đã điểm danh, làm tròn 4 chữ số; buổi chưa điểm danh không tính; HV chỉ thấy của mình; GV chỉ lớp mình; lọc from/to theo ngày VN; không dữ liệu → mảng rỗng (FE hiển thị thông điệp).
- [ ] **AT-04 Cảnh báo vắng** (FR-ATT-05). Test trước: vượt ngưỡng 20% lần đầu → tạo attendance_warning + thông báo HV & mọi S; lần điểm danh tiếp vẫn vượt → không báo lại; về dưới ngưỡng rồi vượt lại → báo lại; `/classes/:id/students` có cờ `absenceWarning` (Lead nối vào CL-03 khi merge, lane cung cấp `AttendanceStatsService.warningFlags(classId)`).
- [ ] **AT-05 FE Điểm danh** (DESIGN §4.7). Test trước: "Tất cả có mặt" đặt mọi HV PRESENT; lưu khi thiếu → cảnh báo "Còn N học viên chưa điểm danh" và focus HV đầu tiên; chế độ cập nhật có ô lý do và xem lịch sử; quá cửa sổ → chỉ đọc; ở 375px nút trạng thái ≥ 44px.
- [ ] **AT-06 FE Lịch sử điểm danh** + tab Điểm danh trong lớp (ma trận) + `/me/attendance`.

### L-GRADES — Kết quả học tập
Sở hữu: `modules/grades`, `features/grades`.
- [ ] **G-01 Assessments** (FR-GRD-01). Test trước: tổng trọng số vượt 100 → 422 WEIGHT_EXCEEDS_100 (cả khi PATCH); GV lớp khác → 404; trợ giảng lớp được tạo/nhập; xóa bài đã có điểm → 422 ASSESSMENT_HAS_GRADES.
- [ ] **G-02 Nhập điểm** (FR-GRD-02, 03). Test trước: score 10.25 / 7.3 → 400 SCORE_OUT_OF_RANGE kèm studentId; `confirm:false` thiếu điểm → lưu nháp; `confirm:true` thiếu → 422 GRADES_INCOMPLETE kèm danh sách; HV không thấy điểm nháp; confirm → thông báo GRADES_PUBLISHED; chỉ T (`teacherClassIds`) nhập, S/M → 403; HV đã chuyển lớp vẫn xem được điểm lớp cũ (`history`).
- [ ] **G-03 Sửa điểm & khóa** (FR-GRD-04). Test trước: sửa sau confirm thiếu lý do → 400 REASON_REQUIRED; có lý do → history + audit; ngày heldOn + 15 (FakeClock) → 422 GRADEBOOK_LOCKED; M unlock until → sửa được tới until; sau until → khóa lại.
- [ ] **G-04 Kết quả & phiếu điểm** (FR-GRD-05..08). Test trước: TB trọng số chỉ trên bài đã confirm; xếp loại đúng; HV chỉ của mình; setting `resultViewRequiresPaidFees=true` + hóa đơn quá hạn còn nợ → 403 FEES_OUTSTANDING (dùng `OutstandingChecker` interface, test bằng dữ liệu invoice từ factory); false → xem được; PDF trả `application/pdf`, chứa tên HV (parse text).
- [ ] **G-05 FE Nhập điểm** (DESIGN §4.8). Test trước: Tab/Enter di chuyển ô; ô sai viền đỏ; xác nhận thiếu → dialog lưu nháp; khóa → banner và input disabled; sửa sau xác nhận → ReasonDialog.
- [ ] **G-06 FE Kết quả** (`/results`, `/me/results`, tab lớp). Test trước: bị chặn học phí → khối cảnh báo; tải PDF gọi đúng URL.

### L-FEES — Học phí
Sở hữu: `modules/fees`, `features/fees`.
- [ ] **F-01 InvoiceCreator** (FR-FEE-02, BACKEND_SCHEMA §2.16). Interface gồm `createForEnrollment` và `voidForEnrollment`. Test trước: hóa đơn `kind=TUITION`; tạo SURCHARGE thủ công cho cùng enrollment không bị unique chặn; `voidForEnrollment` khi amountPaid = 0 → VOID, khi > 0 → không đổi; tạo hóa đơn amountDue = baseFee snapshot, dueDate = startDate lớp + 7 ngày (ngày VN), mã `HD202601xxxx`; enrollment chuyển lớp (transferredFromId có invoice) → không tạo mới; gọi hai lần cùng enrollment → không trùng (idempotent).
- [ ] **F-02 Giảm giá** (FR-FEE-03). Test trước: S đề xuất 10% → PENDING_APPROVAL, finalAmount chưa đổi; M duyệt → finalAmount giảm đúng làm tròn; M từ chối → không đổi; decision khi không pending → 422; giảm > amountDue → 400 DISCOUNT_INVALID; S gọi decision → 403; thông báo DISCOUNT_DECIDED.
- [ ] **F-03 Thanh toán** (FR-FEE-04, 05). Test trước: payment > balance → 422 PAYMENT_EXCEEDS_BALANCE; amount 0/âm/thập phân → 400; trả một phần → PARTIAL, đủ → PAID; **2 payment song song tổng vượt balance → chỉ một thành công**; void payment (M, lý do) → amountPaid giảm, trạng thái tính lại; S void → 403; invoice VOID nhận payment → 422 INVOICE_VOID; overdue = dueDate < hôm nay VN và balance > 0 (biên: đúng ngày hạn → chưa quá hạn); bất biến BACKEND_SCHEMA §2.16 kiểm sau mỗi test (helper `assertInvoiceInvariants`).
- [ ] **F-04 Tra cứu & phiếu thu** (FR-FEE-06, 07). Test trước: HV chỉ hóa đơn mình; GV chỉ HV lớp mình và response không có `payments`; lọc overdue/status/thời gian; receipt PDF.
- [ ] **F-05 `OutstandingChecker`** cho grades: `hasOverdueBalance(studentId)`.
- [ ] **F-06 FE Học phí** (DESIGN §4.9). Test trước: dialog thanh toán mặc định = còn nợ, nhập vượt → lỗi tại chỗ; badge "Quá hạn"; M thấy nút duyệt giảm giá, S không; `/me/fees` hiển thị còn nợ + hạn.

**Merge gate W2:** như W1. Sau merge Lead thay no-op `INVOICE_CREATOR`/`OutstandingChecker` bằng implementation thật và nối `warningFlags` vào CL-03 (task W3-L1).

---

## Wave 3

### Lead — Tích hợp chéo
- [ ] **W3-L1 Nối dây** implementation thật cho các interface; xóa stub.
- [ ] **W3-L2 Integration test xuyên module** (`apps/api/test/e2e/flows/*.e2e-spec.ts`). Test trước:
  1. Lead → convert → placement → xếp lớp → invoice được tạo đúng.
  2. Xếp lớp khi InvoiceCreator lỗi → không có enrollment ENROLLED, sĩ số không đổi.
  3. Chuyển lớp → không có invoice mới; điểm danh lớp cũ vẫn xem được.
  4. Hủy buổi → không điểm danh được; HV nhận thông báo.
  5. Quá ngưỡng vắng → cờ trong danh sách lớp.
  6. `resultViewRequiresPaidFees` chặn rồi thanh toán đủ → xem được.
  7. Bảo lưu → học lại → xếp lớp mới → vẫn đúng 1 hóa đơn TUITION; rút khi chưa đóng → hóa đơn VOID.
  8. Kết thúc lớp → enrollment COMPLETED; HV vẫn xem điểm danh/kết quả/phiếu điểm lớp đó.
- [ ] **W3-L3 Seed đầy đủ** (BACKEND_SCHEMA §4) dùng service thật (không insert thô) + `seed:large`.

### L-REPORTS — Báo cáo & Dashboard
Sở hữu: `modules/reports`, `features/{reports,dashboard}` (dashboard chỉ cho M/S).
- [ ] **R-01 Dashboard** (FR-RPT-06). Test trước: số liệu đúng trên dữ liệu factory xác định; T/H → 403.
- [ ] **R-02 Tuyển sinh** (FR-RPT-01). Test trước: đếm lead/hồ sơ/xếp lớp theo khoảng ngày VN (biên đầu/cuối ngày); tỷ lệ chuyển đổi khi 0 lead → 0 (không NaN).
- [ ] **R-03 Chuyên cần** (FR-RPT-02). Test trước: tỷ lệ theo lớp khớp `/attendance/summary`.
- [ ] **R-04 Học tập** (FR-RPT-03). Test trước: phân bố xếp loại, tỷ lệ đạt, theo GV; chỉ dùng điểm confirmed.
- [ ] **R-05 Tài chính** (FR-RPT-04). Test trước: doanh thu theo ngày thanh toán, loại payment VOIDED; công nợ = Σ balance hóa đơn không VOID; groupBy month đúng múi giờ VN (payment 31/01 23:30 giờ VN thuộc tháng 1).
- [ ] **R-06 Export** (FR-RPT-05). Test trước: xlsx mở được bằng exceljs và có header + số dòng đúng; pdf content-type đúng; không dữ liệu → file vẫn hợp lệ với dòng "Không có dữ liệu".
- [ ] **R-07 FE Báo cáo + Dashboard** (DESIGN §4.2, 4.10). Test trước: đổi preset thời gian gọi lại API với from/to đúng; rỗng → thông điệp; nút xuất tải file; dashboard GV/HV hiển thị đúng khối.

### L-STUDENT-PORTAL — Trải nghiệm GV & HV trên điện thoại
Sở hữu: `features/home` (trang chủ GV & HV). Các trang `/me/*` thuộc lane dữ liệu tương ứng (ARCHITECTURE §5); lane này chỉ đọc qua hook export của các feature đó.
- [ ] **P-01** Trang chủ GV (buổi hôm nay + nút Điểm danh, bài cần nhập điểm, kiểm tra sắp tới) và HV (buổi tiếp theo, chuyên cần, TB, còn nợ, banner xác nhận lớp). Test trước: mỗi khối có trạng thái rỗng; banner xác nhận gọi `/enrollments/:id/confirm` và biến mất.
- [ ] **P-02** Kiểm tra (chỉ test, sửa lỗi bằng contract request tới lane sở hữu) toàn bộ luồng T/H ở 375px (Playwright component/visual hoặc RTL + viewport): không cuộn ngang, nút ≥ 44px.

**Merge gate W3:** như trên + seed chạy thành công trên DB sạch.

---

## Wave 4 — Hoàn thiện (song song)

### L-E2E — Playwright
Sở hữu: `e2e/**`. Chạy với docker mongo + seed + build thật.
- [ ] **X-01** NVHV: tiếp nhận → phát hiện trùng → tạo hồ sơ → HV đăng nhập lần đầu đổi mật khẩu.
- [ ] **X-02** NVHV: tạo đợt kiểm tra → GV chấm → NVHV xếp lớp từ danh sách chờ → HV xác nhận lớp.
- [ ] **X-03** NVHV: tạo lớp → tạo lịch lặp (gặp xung đột, sửa giờ) → GV thấy lịch dạy.
- [ ] **X-04** GV (viewport 375): điểm danh buổi hôm nay → sửa một HV → HV thấy lịch sử.
- [ ] **X-05** GV: tạo bài, nhập nháp, xác nhận → HV xem kết quả + tải phiếu điểm.
- [ ] **X-06** NVHV: đề xuất giảm giá → QL duyệt → NVHV thu tiền 2 lần → PAID → QL xem báo cáo tài chính và xuất Excel.

### L-HARDENING
Sở hữu: `apps/api/test/security/**`, `apps/api/test/perf/**`, `docs/`.
- [ ] **H-01 Bảo mật:** test tự động duyệt mọi route đã đăng ký (`DiscoveryService`) và khẳng định: không có route thiếu `@Roles`; gọi không token → 401; HV gọi mọi route GET có `:id` với id của HV khác → 404/403 (không 200). Rate limit login. Header helmet.
- [ ] **H-02 Hiệu năng (NFR-02):** `seed:large` + script đo p95 cho 10 endpoint danh sách chính; `explain()` xác nhận dùng index (không COLLSCAN).
- [ ] **H-03 Accessibility:** `@axe-core/playwright` trên 10 màn hình chính, 0 lỗi serious/critical.
- [ ] **H-04 Tài liệu:** `README.md` (cài đặt, chạy, tài khoản seed), cập nhật `docs/DECISIONS.md`, Postman/OpenAPI (`@nestjs/swagger` sinh từ zod qua `zod-to-openapi`) tại `/api/docs`.

**Merge gate cuối:** toàn bộ test (unit, integration, FE, E2E, security) xanh; coverage đạt NFR-07; mọi FR trong PRD có ít nhất một test chứa mã FR (script `scripts/fr-coverage.sh` grep mã FR trong PRD và trong `**/*.spec.ts|*.test.tsx|e2e` → liệt kê FR thiếu = 0).

---

## Gợi ý điều phối swarm (cho Lead)
1. Wave 0 một mình (không song song — mọi thứ phụ thuộc vào nó).
2. Mỗi lane: `scripts/lane-start.sh <lane>` → giao agent prompt: "Bạn là lane `<lane>`. Đọc RULES.md, rồi các task của lane trong TASK.md. Làm từng task theo TDD. Chỉ sửa file thuộc lane. Báo cáo theo RULES §7."
3. Lead xử lý `docs/contract-requests/` liên tục; khi đổi shared, thông báo các lane rebase.
4. Merge lane theo thứ tự ít phụ thuộc trước; chạy merge-gate sau mỗi lần merge.
5. Cuối wave: review chéo — mỗi lane được một agent review khác đối chiếu với PRD (FR) và RULES.
