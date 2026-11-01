# ARCHITECTURE — Hệ thống Quản lý Trung tâm Ngoại ngữ

## 1. Tổng quan

```
┌──────────────────────┐   HTTPS/JSON    ┌────────────────────────┐   Mongoose   ┌──────────────┐
│ apps/web             │ ──────────────▶ │ apps/api               │ ───────────▶ │ MongoDB 7    │
│ React 18 + Vite + TS │ /api/v1/*       │ NestJS 10 + TS         │              │ (replica set │
│ TanStack Query       │ ◀────────────── │ REST, JWT, RBAC        │              │  rs0)        │
└──────────────────────┘                 └────────────────────────┘              └──────────────┘
            ▲                                       ▲
            └──────────── packages/shared ──────────┘
              (enum, zod schema, kiểu DTO, mã lỗi, quyền)
```

Client–Server, RESTful, stateless (theo SRS chương 2, 4). Hợp đồng FE↔BE nằm ở **một chỗ duy nhất**: `packages/shared`. Đây là chìa khóa để nhiều agent làm song song mà không lệch nhau.

## 2. Công nghệ (đã chốt)

| Lớp | Lựa chọn | Ghi chú |
|---|---|---|
| Runtime | Node.js 20 LTS, pnpm 9 workspaces | |
| Ngôn ngữ | TypeScript 5, `strict: true` | |
| Backend | NestJS 10, `@nestjs/mongoose`, Mongoose 8 | SRS |
| Validation | `zod` (schema dùng chung) + `ZodValidationPipe` tự viết | [Quyết định] thay class-validator để FE/BE dùng chung schema |
| Auth | `@nestjs/jwt`, `passport-jwt`, `bcrypt` | |
| DB | MongoDB 7, replica set 1 node (cần cho transaction) | SRS |
| Frontend | React 18, Vite 5, React Router 6 | SRS |
| Data fetching | TanStack Query 5, `ky` HTTP client | |
| Form | react-hook-form + `@hookform/resolvers/zod` | |
| UI | Tailwind CSS 3 + shadcn/ui (Radix), lucide-react | |
| Lịch | `@fullcalendar/react` (daygrid, timegrid, list — bản MIT) | |
| Biểu đồ | Recharts | |
| Export | `exceljs` (xlsx), `pdfmake` (PDF, font Roboto hỗ trợ tiếng Việt) | server-side |
| Ngày giờ | `date-fns` + `date-fns-tz` | TZ `Asia/Ho_Chi_Minh` |
| Test BE | Jest, `@nestjs/testing`, supertest, `mongodb-memory-server` (MongoMemoryReplSet) | |
| Test FE | Vitest, React Testing Library, `@testing-library/user-event`, MSW 2 | |
| E2E | Playwright | |
| Lint/format | ESLint (typescript-eslint), Prettier | |
| Dev infra | Docker Compose (mongo rs0, mongo-express tùy chọn) | |

## 3. Cấu trúc repo

```
language-center/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts            # import mọi module (đã đăng ký sẵn ở Wave 0)
│   │   │   ├── config/                  # env schema (zod), config module
│   │   │   ├── common/                  # KHÔNG thuộc lane nào — chỉ Lead sửa
│   │   │   │   ├── auth/                # JwtAuthGuard, RolesGuard, @Roles, @CurrentUser
│   │   │   │   ├── pipes/zod-validation.pipe.ts
│   │   │   │   ├── filters/http-exception.filter.ts
│   │   │   │   ├── errors/app-error.ts  # AppError(code, status, details)
│   │   │   │   ├── db/transaction.ts    # withTransaction(conn, fn)
│   │   │   │   ├── db/counter.service.ts# sinh mã tuần tự
│   │   │   │   ├── audit/               # AuditService.log(...)
│   │   │   │   ├── notifications/       # NotificationsService.notify(...)
│   │   │   │   ├── settings/            # SettingsService.get()
│   │   │   │   ├── clock/clock.service.ts # now() — mock được trong test
│   │   │   │   └── pagination.ts
│   │   │   ├── database/schemas/        # MỌI Mongoose schema + index — chỉ Lead sửa
│   │   │   └── modules/                 # MỖI THƯ MỤC = MỘT LANE
│   │   │       ├── auth/  users/  courses/  rooms/
│   │   │       ├── admissions/          # leads, students
│   │   │       ├── placement/           # kiểm tra đầu vào
│   │   │       ├── classes/  enrollments/
│   │   │       ├── schedule/            # sessions
│   │   │       ├── attendance/  grades/  fees/  reports/
│   │   └── test/
│   │       ├── helpers/                 # createTestApp(), loginAs(role)
│   │       ├── factories/               # factory mọi collection (Lead); lane thêm <lane>.extra.ts
│   │       └── e2e/                     # *.e2e-spec.ts theo module
│   └── web/
│       ├── src/
│       │   ├── main.tsx  App.tsx  router.tsx   # route đã đăng ký sẵn ở Wave 0
│       │   ├── lib/                     # api client, queryClient, format (tiền, ngày)
│       │   ├── components/ui/           # shadcn (generated)
│       │   ├── components/common/       # DataTable, PageHeader, EmptyState, ConfirmDialog, ...
│       │   ├── layouts/                 # AppShell, AuthLayout
│       │   ├── auth/                    # AuthProvider, RequireRole
│       │   └── features/                # MỖI THƯ MỤC = MỘT LANE
│       │       ├── admissions/ students/ placement/ classes/ enrollments/
│       │       ├── schedule/ attendance/ grades/ fees/ reports/
│       │       ├── users/ courses/ rooms/ notifications/ dashboard/ home/ settings/
│       │       └── <feature>/{api.ts, hooks.ts, pages/, components/, __tests__/}
│       └── test/                        # setup, msw handlers gốc, render helpers
├── packages/
│   └── shared/src/
│       ├── enums.ts                     # Role, các trạng thái
│       ├── errors.ts                    # ErrorCode
│       ├── permissions.ts               # ma trận quyền (dùng ở BE guard và FE ẩn/hiện)
│       ├── schemas/<module>.ts          # zod: input DTO + response
│       └── index.ts
├── e2e/                                 # Playwright
├── docker-compose.yml
├── docs/QUESTIONS.md  docs/DECISIONS.md
└── PRD.md ARCHITECTURE.md BACKEND_SCHEMA.md DESIGN.md RULES.md TASK.md
```

## 4. Backend

### 4.1 Cấu trúc một module (bắt buộc)
```
modules/classes/
├── classes.module.ts
├── classes.controller.ts       # chỉ: route, @Roles, parse input, gọi service
├── classes.service.ts          # nghiệp vụ + kiểm tra phạm vi dữ liệu
├── classes.repository.ts       # (tùy chọn) truy vấn Mongo phức tạp
├── classes.service.spec.ts     # unit test (repo/model mock hoặc in-memory)
└── ../../test/e2e/classes.e2e-spec.ts
```

### 4.2 Luồng một request
`JwtAuthGuard` → `RolesGuard` (đọc `@Roles()` và `permissions.ts`) → `ZodValidationPipe(schema từ shared)` → Controller → Service (kiểm tra phạm vi: "GV này có dạy lớp này không?") → Mongoose → `HttpExceptionFilter` chuẩn hóa lỗi.

### 4.3 Giao tiếp giữa module
- Schema Mongoose tập trung ở `src/database/schemas` (đăng ký một lần trong `DatabaseModule` global). Mỗi collection có **một module sở hữu** (TASK.md đầu file). Module **được đọc** mọi model (truy vấn, aggregation) nhưng **chỉ ghi** model mình sở hữu; muốn thay đổi dữ liệu của module khác phải gọi service đã export của module đó. Ngoại lệ được phép (ghi trực tiếp field của collection khác): `classes.currentSize` do enrollments `$inc`; `sessions.attendanceTakenAt` + `sessions.attendanceNote` do attendance ghi.
- Tài khoản học viên: admissions gọi `UsersService.createStudentAccount(studentId, code, session)` (W0-04).
- Phụ thuộc cho phép (mũi tên = "được gọi"):
  `admissions → courses, enrollments` · `placement → enrollments, rooms, schedule(ConflictChecker)` · `enrollments → classes, fees(InvoiceCreator)` · `schedule → classes, rooms, users` · `attendance → schedule, enrollments` · `grades → classes, enrollments, fees(OutstandingChecker)` · `reports → đọc trực tiếp nhiều collection qua aggregation (ngoại lệ duy nhất, chỉ đọc)`.
- Tránh phụ thuộc vòng: `fees` không import `enrollments`; `enrollments` gọi `InvoiceCreator` của fees. Nếu cần ngược chiều dùng `EventEmitter2` (`@nestjs/event-emitter`) với tên sự kiện định nghĩa trong `packages/shared/src/events.ts`.

### 4.4 Sự kiện miền (`@nestjs/event-emitter`)
| Event | Phát bởi | Nghe bởi |
|---|---|---|
| `enrollment.enrolled` | enrollments | fees (sinh hóa đơn nếu lần đầu), notifications |
| `session.created/updated/cancelled` | schedule | notifications |
| `attendance.recorded` | attendance | attendance (kiểm tra ngưỡng vắng → thông báo) |
| `grades.confirmed` | grades | notifications |
| `class.finished` | classes (khi chuyển FINISHED) | enrollments (mọi ENROLLED của lớp → COMPLETED) |
[Quyết định] Sinh hóa đơn chạy **đồng bộ trong transaction xếp lớp** (gọi `InvoiceCreator`), không qua event, để không mất hóa đơn. Event chỉ dùng cho thông báo.

### 4.5 Transaction
`withTransaction(connection, async (session) => {...})` trong `common/db`. Bắt buộc cho: xếp lớp, chuyển lớp, rút lớp, ghi nhận/hủy thanh toán, tạo hồ sơ (student + user + enrollment + lead update).
Tăng sĩ số nguyên tử:
```ts
const updated = await this.classModel.findOneAndUpdate(
  { _id: classId, status: { $in: ['PLANNED', 'ONGOING'] }, $expr: { $lt: ['$currentSize', '$maxCapacity'] } },
  { $inc: { currentSize: 1 } },
  { new: true, session },
);
if (!updated) throw new AppError('CLASS_FULL', 422);
```

### 4.6 Phạm vi dữ liệu (data scoping)
Một helper duy nhất mỗi module: `scopeFilter(user): FilterQuery`. Ví dụ attendance: STUDENT → `{ studentId: user.studentId }`; TEACHER → `{ classId: { $in: teacherClassIds } }`; staff → `{}`. Truy cập theo id ngoài phạm vi → **404** (không lộ sự tồn tại), không phải 403. Test bắt buộc cho mỗi endpoint đọc.

**Định nghĩa phạm vi dùng chung** (Lead hiện thực ở W0-03 trong `common/scope/scope.service.ts`; mọi lane PHẢI dùng, không tự định nghĩa):
- `teacherClassIds(user)` = các lớp có `teacherId == user` **hoặc** `assistantTeacherId == user` (mọi trạng thái lớp). Dùng cho: xem lớp, xem học viên, xem lịch, xem điểm danh, nhập/sửa điểm, tạo bài đánh giá, tra cứu học phí.
- `teacherCanTakeAttendance(user, session)` = `session.teacherId == user` (GV dạy thay) **hoặc** `session.classId ∈ teacherClassIds(user)`.
- `studentClassIds(user, mode)`:
  - `mode='current'` → lớp có enrollment `ENROLLED` của HV. Dùng cho: lịch học (buổi tương lai), xác nhận lớp, danh sách lớp hiện tại.
  - `mode='history'` → lớp có bất kỳ enrollment nào của HV với `classId != null` (ENROLLED, TRANSFERRED, RESERVED, COMPLETED, CANCELLED). Dùng cho: lịch sử điểm danh, kết quả học tập, phiếu điểm, hóa đơn, buổi học đã qua.
- `teacherStudentIds(user)` (D38, R7, R9) = HV có enrollment (`ENROLLED`|`COMPLETED`|`TRANSFERRED` **và** `classId ∈ teacherClassIds(user)`) **hoặc** (≠ `CANCELLED` **và** `classHistory ∩ teacherClassIds(user) ≠ ∅`). Dùng cho: hồ sơ / danh sách học viên.
- `teacherCurrentStudentIds(user)` (R9) = HV có enrollment `ENROLLED` hoặc `COMPLETED` với `classId ∈ teacherClassIds(user)`. Dùng cho: tra cứu hóa đơn của GV (FR-FEE-06).

### 4.7 Thời gian
`ClockService.now()` là nguồn thời gian duy nhất (test override). Lưu `Date` UTC. "Ngày" (dueDate, khóa điểm, "hôm nay") tính theo `Asia/Ho_Chi_Minh` qua helper `vnDay()` trong shared.

### 4.8 Cấu hình (`apps/api/.env`, validate bằng zod khi khởi động)
```
MONGODB_URI=mongodb://localhost:27017/language_center?replicaSet=rs0
JWT_ACCESS_SECRET=...   JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL=15m      JWT_REFRESH_TTL=7d
WEB_ORIGIN=http://localhost:5173
UPLOAD_DIR=./uploads    PORT=3000
SEED_ADMIN_EMAIL=admin@center.local  SEED_ADMIN_PASSWORD=Admin@123
```

## 5. Frontend

- **Routing:** `router.tsx` khai báo mọi route ở Wave 0 với component placeholder lazy-load từ `features/<x>/pages`. Lane chỉ thay nội dung page của mình. Bảo vệ route bằng `<RequireRole roles={[...]}>`.
- **Trang `/` theo role:** Lead tạo `HomeRouter` ở W0: M/S → `features/dashboard/pages/StaffDashboard` (L-REPORTS); T → `features/home/pages/TeacherHome`, H → `features/home/pages/StudentHome` (L-STUDENT-PORTAL).
- **Trang `/me/*`:** thuộc lane sở hữu dữ liệu, không có `features/me`: `/me/profile` → `features/students` (L-ADMISSIONS); `/me/attendance` → `features/attendance`; `/me/results` → `features/grades`; `/me/fees` → `features/fees`; `/me/classes` → `features/enrollments`.
- **Tab slot:** trang chi tiết `/classes/:id` và `/students/:id` do Lead dựng khung tab ở W0, mỗi tab import lazy một component từ feature của lane sở hữu (ví dụ tab "Chuyên cần" của hồ sơ HV = `features/attendance/components/StudentAttendanceTab`). Lane chỉ viết component tab của mình; ban đầu là placeholder do Lead tạo.
- **Server state:** chỉ TanStack Query. Query key: `[module, 'list', params]`, `[module, 'detail', id]`. Mutation thành công → `invalidateQueries([module])`.
- **Client state:** React context cho auth; không dùng Redux.
- **API client:** `lib/api.ts` (ky) tự gắn access token, tự gọi `/auth/refresh` khi 401 một lần rồi retry; lỗi chuẩn hóa thành `ApiError { code, message, details }`.
- **Form:** zod schema import từ `@lc/shared`; lỗi server `details.fields` map vào field tương ứng.

### 5.1 Ranh giới zod ↔ lỗi nghiệp vụ (bắt buộc, tránh lệch mã lỗi)
- Schema zod trong shared chỉ kiểm **hình dạng**: kiểu, bắt buộc/tùy chọn, định dạng (ObjectId, email, SĐT, ngày, `HH:mm`), số nguyên, độ dài chuỗi. Vi phạm → `400 VALIDATION_FAILED`.
- Quy tắc **giá trị nghiệp vụ** kiểm trong service, trả mã riêng: thang điểm 0–10 bước 0.25 → `SCORE_OUT_OF_RANGE`; lý do bắt buộc theo ngữ cảnh → `REASON_REQUIRED`; giảm giá vượt/không hợp lệ → `DISCOUNT_INVALID`; trọng số → `WEIGHT_EXCEEDS_100`.
- Shared export hàm kiểm thuần (`isValidScore`, `isValidDiscount`) để FE dùng hiển thị lỗi tức thì và BE dùng trong service — cùng một logic.
- **Quyền ở UI:** `can(user, 'classes.create')` từ `permissions.ts` để ẩn nút. UI chỉ là tiện lợi — BE vẫn là nơi chặn.
- **Định dạng:** `formatVnd`, `formatDate`, `formatDateTime` trong `lib/format.ts`.

## 6. Kiểm thử (tóm tắt — chi tiết ở RULES.md)

| Mức | Công cụ | Phạm vi |
|---|---|---|
| Unit BE | Jest | service logic: tính điểm TB, xếp loại, phát hiện xung đột, trạng thái học phí, scope filter |
| Integration/E2E API | Jest + supertest + MongoMemoryReplSet | mọi endpoint: happy path, mọi alternative flow của UC, quyền từng role, phạm vi dữ liệu |
| Unit/Component FE | Vitest + RTL + MSW | page/component: render, validation, trạng thái rỗng/lỗi/loading, ẩn nút theo quyền |
| E2E | Playwright (docker mongo + seed) | 6 hành trình chính (TASK W5) |

Mỗi file e2e API dùng DB riêng (tên DB ngẫu nhiên) → chạy song song an toàn.

## 7. Môi trường & lệnh

```
pnpm i
docker compose up -d mongo            # mongo:7 --replSet rs0, healthcheck tự rs.initiate()
pnpm --filter api seed                # admin + dữ liệu mẫu
pnpm dev                              # api :3000, web :5173 (proxy /api → 3000)
pnpm test                             # toàn bộ unit + integration
pnpm --filter api test:e2e
pnpm --filter web test
pnpm e2e                              # Playwright
pnpm lint && pnpm typecheck
```

## 8. Mô hình làm việc nhiều agent (swarm)

- **Lead agent** (1): sở hữu `packages/shared`, `apps/api/src/common`, `apps/web/src/{lib,layouts,auth,components/common,router.tsx}`, `app.module.ts`, CI, merge.
- **Lane agent** (n): mỗi lane sở hữu đúng thư mục `apps/api/src/modules/<m>`, `apps/api/test/e2e/<m>*`, `apps/web/src/features/<m>`. Làm trong git worktree riêng, nhánh `lane/<m>`.
- Hợp đồng trước, code sau: Wave 0 viết sẵn toàn bộ schema zod + enum + mã lỗi + quyền cho **mọi** module. Lane cần đổi hợp đồng → tạo `docs/contract-requests/<lane>-<n>.md`, Lead duyệt và commit vào shared; lane rebase.
- Module phụ thuộc chưa xong: dùng interface trong shared + stub (ví dụ `InvoiceCreator` stub trả về void) để test; khi merge wave thì dùng implementation thật.
- Merge gate mỗi wave: `pnpm lint && pnpm typecheck && pnpm test` xanh trên `main` sau khi merge mọi lane.
