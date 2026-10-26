# Wave 0 — Nền móng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng monorepo, hợp đồng dùng chung, hạ tầng API (guard, lỗi, DB, test harness), auth, khung module và khung Web để các lane Wave 1 chạy song song được.

**Architecture:** pnpm monorepo `apps/api` (NestJS + Mongoose), `apps/web` (React + Vite), `packages/shared` (zod + enum + helper thuần, build bằng tsup). Mọi schema Mongoose và factory test do Wave 0 tạo; module nghiệp vụ chỉ là vỏ rỗng trừ auth, users core, notifications, enrollments.createPending.

**Tech Stack:** Node 26 (Homebrew, `/opt/homebrew/bin`), pnpm 9, TypeScript 5 strict, NestJS 11, Mongoose 8, zod 3, Jest 29 + supertest + mongodb-memory-server 10 (MongoMemoryReplSet), React 18, Vite 5, Tailwind 3, shadcn/ui, TanStack Query 5, ky, react-hook-form, Vitest 2 + RTL + MSW 2.

**Spec:** `/Users/huybin2305/language-center/{PRD,ARCHITECTURE,BACKEND_SCHEMA,DESIGN,RULES,TASK}.md` — plan này hiện thực TASK.md W0-01..W0-07.

## Global Constraints
- Mọi shell: `export PATH=/opt/homebrew/bin:$PATH` (node không có trong PATH mặc định).
- Không có Docker trên máy: test **không** phụ thuộc Docker; `docker-compose.yml` vẫn tạo cho máy khác. Dev local dùng script `apps/api/scripts/dev-mongo.ts` khởi động MongoMemoryReplSet bền (dbPath `.mongo-data/`) in ra URI.
- [Quyết định khi lập plan] NestJS 11 thay vì 10 (tương thích Node 26); phần còn lại giữ phiên bản ARCHITECTURE §2.
- TS `strict: true`, cấm `any` (ESLint `@typescript-eslint/no-explicit-any: error`).
- Package shared tên `@lc/shared`; API prefix `/api/v1`; tiền là số nguyên VND; thời gian qua `ClockService`; TZ hiển thị `Asia/Ho_Chi_Minh`.
- Định dạng lỗi: `{ error: { code, message, details? } }`; thành công `{ data, meta? }` (BACKEND_SCHEMA §3.1).
- Conventional commits; mỗi task kết thúc bằng commit với test xanh.
- Test tên tiếng Việt có mã FR khi có FR tương ứng.

## Review Focus
1. **Chuỗi thời gian quanh nửa đêm VN** (17:00Z) — `vnDay` phải trả ngày hôm sau; test ở Task 3.
2. **Hai request tạo mã đồng thời** — `CounterService` không được trùng; test 50 lời gọi song song ở Task 7.
3. **Route quên `@Roles`** — phải bị chặn (fail-closed), không mở; test Task 8.
4. **Refresh token bị dùng lại** (bị đánh cắp) — thu hồi cả chuỗi; test Task 9.
5. **Lỗi mạng/401 lặp ở FE** — client chỉ refresh một lần, không vòng lặp vô hạn; test Task 12.

---

## File Structure

```
language-center/
├── package.json, pnpm-workspace.yaml, tsconfig.base.json, .eslintrc.cjs, .prettierrc, .gitignore, .nvmrc
├── docker-compose.yml
├── scripts/{lane-start.sh, merge-gate.sh, fr-coverage.sh}
├── docs/{QUESTIONS.md, DECISIONS.md, contract-requests/.gitkeep}
├── packages/shared/
│   ├── package.json, tsconfig.json, tsup.config.ts, vitest.config.ts
│   └── src/
│       ├── index.ts
│       ├── enums.ts            # mọi enum BACKEND_SCHEMA §1 (const object + type)
│       ├── errors.ts           # ErrorCode, ERROR_HTTP_STATUS
│       ├── events.ts           # tên event domain
│       ├── permissions.ts      # Permission, PERMISSIONS, can()
│       ├── transitions.ts      # ENROLLMENT_TRANSITIONS, CLASS_TRANSITIONS, canTransition
│       ├── time.ts  money.ts  grading.ts  text.ts
│       └── schemas/
│           ├── common.ts       # zObjectId, zVnPhone, zMoney, zScoreShape, zDateOnly, zTimeHHmm, Paginated
│           └── auth.ts users.ts courses.ts rooms.ts settings.ts leads.ts students.ts
│               enrollments.ts placement.ts classes.ts sessions.ts attendance.ts
│               assessments.ts grades.ts invoices.ts payments.ts reports.ts notifications.ts
├── apps/api/
│   ├── package.json, tsconfig.json, nest-cli.json, jest.config.ts, jest-e2e.config.ts
│   ├── scripts/{dev-mongo.ts, seed.ts}
│   ├── src/
│   │   ├── main.ts, app.module.ts, setup-app.ts       # setupApp(app) dùng chung main + test
│   │   ├── health/health.controller.ts
│   │   ├── config/env.ts
│   │   ├── common/
│   │   │   ├── errors/app-error.ts, filters/http-exception.filter.ts
│   │   │   ├── pipes/zod-validation.pipe.ts
│   │   │   ├── auth/{roles.decorator.ts, current-user.decorator.ts, jwt-auth.guard.ts, roles.guard.ts, auth-user.ts}
│   │   │   ├── clock/clock.service.ts
│   │   │   ├── db/{transaction.ts, counter.service.ts}
│   │   │   ├── audit/audit.service.ts
│   │   │   ├── notifications/notifications.service.ts
│   │   │   ├── settings/settings.service.ts
│   │   │   ├── scope/scope.service.ts
│   │   │   ├── pagination.ts
│   │   │   └── common.module.ts                        # @Global, export mọi service trên
│   │   ├── database/{database.module.ts, schemas/*.schema.ts}
│   │   └── modules/
│   │       ├── auth/ users/ notifications/ enrollments/   # có nội dung ở W0
│   │       └── courses/ rooms/ settings/ admissions/ placement/ classes/ schedule/
│   │           attendance/ grades/ fees/ reports/        # vỏ rỗng
│   └── test/
│       ├── helpers/{test-app.ts, auth.ts, fake-clock.ts}
│       ├── factories/{index.ts, *.factory.ts}
│       └── e2e/*.e2e-spec.ts
└── apps/web/
    ├── package.json, vite.config.ts, tailwind.config.ts, postcss.config.js, components.json, index.html
    ├── src/
    │   ├── main.tsx, App.tsx, router.tsx, index.css
    │   ├── lib/{api.ts, query-client.ts, format.ts, status.ts, error-messages.ts, utils.ts}
    │   ├── auth/{auth-context.tsx, require-role.tsx, use-auth.ts}
    │   ├── layouts/{app-shell.tsx, nav-config.ts, auth-layout.tsx}
    │   ├── components/ui/*            # shadcn generated
    │   ├── components/common/*        # DESIGN §5
    │   └── features/<m>/pages/*.tsx   # placeholder; auth, notifications, home-router đầy đủ
    └── test/{setup.ts, render.tsx, msw/server.ts, msw/handlers.ts}
```

---

### Task 1: Monorepo + health check (W0-01)

**Files:**
- Create: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc`, `.gitignore`, `.nvmrc` (`26`), `docker-compose.yml`, `docs/QUESTIONS.md`, `docs/DECISIONS.md`, `docs/contract-requests/.gitkeep`
- Create: `apps/api` (Nest CLI skeleton, xóa app.controller mặc định), `apps/api/src/{main.ts,setup-app.ts,app.module.ts,health/health.controller.ts}`, `apps/api/test/e2e/health.e2e-spec.ts`
- Create: `apps/web` (Vite react-ts), `apps/web/src/App.test.tsx`
- Create: `packages/shared` (tsup, vitest), `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `setupApp(app: INestApplication): void` (prefix `/api/v1`, helmet, cookie-parser, CORS `WEB_ORIGIN`, global filter/pipe được thêm ở Task 5); root scripts `dev`, `build`, `test`, `test:e2e`, `lint`, `typecheck`.

- [ ] **Step 1:** `git init`, cài pnpm: `npm i -g pnpm@9`; tạo workspace `apps/*`, `packages/*`; scaffold 3 package. `docs/DECISIONS.md` ghi: NestJS 11, Node 26, không Docker.
- [ ] **Step 2: Test fail** `apps/api/test/e2e/health.e2e-spec.ts`:
```ts
it('GET /api/v1/health → 200 {status:"ok", db:"up"}', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ data: { status: 'ok', db: 'up' } });
});
```
(app tạm tạo bằng `MongooseModule.forRoot(memoryUri)`; Task 6 thay bằng `createTestApp`.) Và `apps/web/src/App.test.tsx`: `render(<App/>)` không throw.
- [ ] **Step 3:** Chạy `pnpm --filter api test:e2e` → FAIL (404).
- [ ] **Step 4:** `HealthController` `GET /health` trả `{ data: { status:'ok', db: connection.readyState===1 ? 'up':'down' } }`.
- [ ] **Step 5:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` → PASS.
- [ ] **Step 6:** Commit `chore: scaffold monorepo with health check`.

### Task 2: Shared — enums, errors, events, permissions (W0-02)

**Files:**
- Create: `packages/shared/src/{enums.ts,errors.ts,events.ts,permissions.ts}`, `packages/shared/src/__tests__/permissions.test.ts`

**Interfaces:**
- Produces:
  - Enum dạng `export const Role = { ADMIN:'ADMIN', ... } as const; export type Role = typeof Role[keyof typeof Role]; export const ALL_ROLES: Role[]` — tương tự cho mọi enum BACKEND_SCHEMA §1, thêm `InvoiceKind = TUITION|SURCHARGE`.
  - `ErrorCode` (mọi mã BACKEND_SCHEMA §3.2), `ERROR_HTTP_STATUS: Record<ErrorCode, number>`.
  - `DomainEvent = { EnrollmentEnrolled:'enrollment.enrolled', SessionCreated:'session.created', SessionUpdated:'session.updated', SessionCancelled:'session.cancelled', AttendanceRecorded:'attendance.recorded', GradesConfirmed:'grades.confirmed', ClassFinished:'class.finished' }`.
  - `type Permission` (chuỗi dạng `'<module>.<action>'`, một permission cho mỗi dòng PRD §3), `PERMISSIONS: Record<Permission, readonly Role[]>`, `can(user: { role: Role } | null, p: Permission): boolean`.

- [ ] **Step 1: Test fail** — test bảng sinh từ ma trận PRD §3 (✓ và S đều là "có quyền" ở mức role; ADMIN chỉ có `users.*`):
```ts
const MATRIX: [Permission, Role[]][] = [
  ['leads.create', ['MANAGER','ACADEMIC_STAFF']],
  ['enrollments.updateCourse', ['MANAGER','ACADEMIC_STAFF','STUDENT']],
  ['attendance.take', ['TEACHER','ACADEMIC_STAFF']],
  ['grades.enter', ['TEACHER']],
  ['discounts.decide', ['MANAGER']],
  ['reports.view', ['MANAGER','ACADEMIC_STAFF']],
  ['users.manage', ['ADMIN','MANAGER']],
  // ... một dòng cho mọi Permission
];
it.each(MATRIX)('%s', (p, allowed) => {
  for (const r of ALL_ROLES) expect(can({ role: r }, p)).toBe(allowed.includes(r));
});
it('can(null, x) === false', ...);
it('mỗi ErrorCode có HTTP status', () => Object.values(ErrorCode).forEach(c => expect(ERROR_HTTP_STATUS[c]).toBeGreaterThanOrEqual(400)));
it('MATRIX phủ mọi Permission', () => expect(new Set(MATRIX.map(m=>m[0]))).toEqual(new Set(Object.keys(PERMISSIONS))));
```
- [ ] **Step 2:** `pnpm --filter @lc/shared test` → FAIL.
- [ ] **Step 3:** Hiện thực các file.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(shared): enums, error codes, permissions matrix`.

### Task 3: Shared — helper thuần (W0-02)

**Files:**
- Create: `packages/shared/src/{time.ts,money.ts,grading.ts,text.ts,transitions.ts}` + test tương ứng trong `__tests__/`

**Interfaces:**
- Produces:
  - `VN_TZ = 'Asia/Ho_Chi_Minh'`; `vnDay(d: Date): string` (`'YYYY-MM-DD'`); `startOfVnDay(day: string): Date`; `addVnDays(day: string, n: number): string`; `isSameVnDay(a: Date, b: Date): boolean`; `vnDateTime(day: string, hhmm: string): Date`.
  - `applyDiscount(amount: number, d: { kind:'PERCENT'|'AMOUNT'; value: number }): number` (throw `RangeError` khi không hợp lệ); `isValidDiscount(amount, d): boolean`; `formatVnd(n: number): string`.
  - `isValidScore(x: number): boolean`; `weightedAverage(items: { score: number|null; weight: number }[]): number|null`; `classify(avg: number): GradeClass`; `isPass(avg: number): boolean`.
  - `removeVietnameseTones(s: string): string`.
  - `ENROLLMENT_TRANSITIONS`, `CLASS_TRANSITIONS: Record<S, readonly S[]>`; `canTransition<S>(table, from: S, to: S): boolean`.

- [ ] **Step 1: Test fail** (giá trị cố định):
```ts
expect(vnDay(new Date('2026-01-14T17:30:00Z'))).toBe('2026-01-15');
expect(vnDay(new Date('2026-01-14T16:59:59Z'))).toBe('2026-01-14');
expect(vnDateTime('2026-01-05','18:00').toISOString()).toBe('2026-01-05T11:00:00.000Z');
expect(addVnDays('2026-01-31', 1)).toBe('2026-02-01');
expect(applyDiscount(1_555_555, {kind:'PERCENT', value:10})).toBe(1_400_000); // 1_555_555 - 155_556
expect(() => applyDiscount(1_000_000, {kind:'AMOUNT', value:1_000_001})).toThrow(RangeError);
expect(formatVnd(1_500_000)).toBe('1.500.000 ₫');
[0, 7.25, 10].forEach(s => expect(isValidScore(s)).toBe(true));
[10.25, 7.3, -1, NaN].forEach(s => expect(isValidScore(s)).toBe(false));
expect(weightedAverage([{score:8,weight:30},{score:null,weight:30},{score:6,weight:40}])).toBe(6.86);
expect(weightedAverage([{score:null,weight:100}])).toBeNull();
[[4.99,'FAIL'],[5,'AVERAGE'],[6.49,'AVERAGE'],[6.5,'FAIR'],[7.99,'FAIR'],[8,'GOOD'],[8.99,'GOOD'],[9,'EXCELLENT']]
  .forEach(([a,c]) => expect(classify(a as number)).toBe(c));
expect(removeVietnameseTones('Nguyễn Đức Ánh')).toBe('nguyen duc anh');
expect(canTransition(ENROLLMENT_TRANSITIONS,'RESERVED','WAITING_CLASS')).toBe(true);
expect(canTransition(ENROLLMENT_TRANSITIONS,'COMPLETED','ENROLLED')).toBe(false);
expect(canTransition(CLASS_TRANSITIONS,'FINISHED','PLANNED')).toBe(false);
```
Thêm test duyệt mọi cặp `(from,to)` so với bảng BACKEND_SCHEMA §2.8 và §2.10.
- [ ] **Step 2:** FAIL. **Step 3:** Hiện thực (`date-fns-tz` cho time; `normalize('NFD')` + xử lý `đ/Đ` cho text; làm tròn `Math.round(x*100)/100` cho TB). **Step 4:** PASS, coverage shared ≥ 95%.
- [ ] **Step 5:** Commit `feat(shared): time, money, grading, text, transitions helpers`.

### Task 4: Shared — zod schemas cho mọi endpoint (W0-02)

**Files:**
- Create: `packages/shared/src/schemas/*.ts` (danh sách ở File Structure), `__tests__/schemas.test.ts`

**Interfaces:**
- Produces: với mỗi endpoint ghi ở BACKEND_SCHEMA §3.3, một schema input tên `<Action><Entity>Input` (ví dụ `CreateLeadInput`, `ConvertLeadQuery`, `AssignClassInput`, `BulkCreateSessionsInput`, `TakeAttendanceInput`, `UpsertGradesInput`, `RecordPaymentInput`, `ListStudentsQuery`) và response `<Entity>Dto`; export cả `type X = z.infer<typeof X>`. Primitive trong `common.ts`: `zObjectId`, `zVnPhone` (transform về `0xxxxxxxxx`), `zMoney` (int ≥ 0), `zScoreShape` (`z.number().nullable()` — **không** kiểm thang, ARCHITECTURE §5.1), `zDateOnly` (`YYYY-MM-DD`), `zTimeHHmm`, `zPagination` (`page` ≥1 mặc định 1, `limit` 1–100 mặc định 20, `sort?`), `Paginated<T>`.
- Quy tắc: schema chỉ kiểm hình dạng; field nghiệp vụ theo BACKEND_SCHEMA §2. Weekday: `1=Thứ 2 … 7=Chủ nhật` (ISO) [Quyết định].

- [ ] **Step 1: Test fail:**
```ts
expect(zVnPhone.parse('+84912345678')).toBe('0912345678');
expect(zVnPhone.safeParse('12345').success).toBe(false);
expect(zMoney.safeParse(1.5).success).toBe(false);
expect(zMoney.safeParse(-1).success).toBe(false);
expect(zScoreShape.safeParse(10.25).success).toBe(true); // range là việc của service
expect(CreateLeadInput.safeParse({}).error!.flatten().fieldErrors).toHaveProperty('phone');
expect(BulkCreateSessionsInput.safeParse({...valid, weekdays:[0]}).success).toBe(false);
expect(zPagination.parse({})).toEqual({ page: 1, limit: 20 });
expect(zPagination.safeParse({ limit: 101 }).success).toBe(false);
```
Một test "smoke" cho mỗi file schema: parse một payload hợp lệ mẫu thành công.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. `pnpm --filter @lc/shared build` tạo `dist/` (ESM+CJS+d.ts).
- [ ] **Step 5:** Commit `feat(shared): zod contracts for all endpoints`.

### Task 5: API — lỗi, validation, clock, config (W0-03)

**Files:**
- Create: `apps/api/src/config/env.ts`, `common/errors/app-error.ts`, `common/filters/http-exception.filter.ts`, `common/pipes/zod-validation.pipe.ts`, `common/clock/clock.service.ts`, `test/helpers/fake-clock.ts`, `test/e2e/errors.e2e-spec.ts` (dùng controller test-only đăng ký trong spec)
- Modify: `setup-app.ts` (đăng ký filter)

**Interfaces:**
- Produces: `class AppError extends Error { constructor(code: ErrorCode, status?: number, details?: Record<string, unknown>) }` (status mặc định `ERROR_HTTP_STATUS[code]`); `new ZodValidationPipe(schema: ZodTypeAny)` dùng `@Body(new ZodValidationPipe(X))`; `abstract class ClockService { abstract now(): Date }` + `SystemClock`; `FakeClock implements ClockService { set(d: Date); advance(ms: number) }`; `loadEnv(): Env`.
- Filter mapping: `AppError` → status + `{error:{code,message,details}}`; `ZodError` → 400 `VALIDATION_FAILED` + `details.fields` (`flatten().fieldErrors`, mỗi field lấy message đầu); Mongo `code 11000` → 409 `DUPLICATE_KEY`… [Quyết định] dùng code `CONFLICT` thêm vào ErrorCode; `HttpException` Nest → giữ status, code `UNAUTHENTICATED`/`FORBIDDEN`/`NOT_FOUND`/`RATE_LIMITED`; khác → 500 `INTERNAL` (thêm vào ErrorCode), không lộ stack.

- [ ] **Step 1: Test fail:** POST body `{}` vào route test có pipe `CreateLeadInput` → 400, `body.error.code==='VALIDATION_FAILED'`, `body.error.details.fields.phone` là string; route throw `new AppError('CLASS_FULL')` → 422 `{error:{code:'CLASS_FULL', message: expect.any(String)}}`; insert trùng unique → 409 `CONFLICT`; throw `new Error('x')` → 500 và body không chứa `'x'`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. `loadEnv` throw khi thiếu `JWT_ACCESS_SECRET`.
- [ ] **Step 5:** Commit `feat(api): error envelope, zod pipe, clock, env`.

### Task 6: API — database schemas, test harness, factories (W0-03)

**Files:**
- Create: `apps/api/src/database/database.module.ts`, `database/schemas/{user,refresh-token,course,room,lead,student,counter,enrollment,placement-test,class,session,attendance,attendance-warning,assessment,grade,invoice,payment,notification,audit-log,settings}.schema.ts`, `database/models.ts` (hằng tên model)
- Create: `test/helpers/test-app.ts`, `test/factories/*.factory.ts`, `test/factories/index.ts`, `test/e2e/indexes.e2e-spec.ts`
- Modify: `test/e2e/health.e2e-spec.ts` (chuyển sang `createTestApp`)

**Interfaces:**
- Produces:
  - `DatabaseModule` (`@Global`) đăng ký mọi model qua `MongooseModule.forFeature`; inject bằng `@InjectModel(Models.Class)`.
  - `createTestApp(opts?: { overrides?: Array<{ provide: unknown; useValue: unknown }> }): Promise<TestApp>` với `TestApp = { app: INestApplication; http: () => supertest.Agent; clock: FakeClock; conn: Connection; close(): Promise<void> }`. Một `MongoMemoryReplSet` dùng chung per Jest worker (globalSetup), mỗi `createTestApp` dùng DB tên ngẫu nhiên; `clock` mặc định `2026-01-05T02:00:00Z`.
  - Factories: `makeUser(conn, p?)`, `makeCourse`, `makeRoom`, `makeLead`, `makeStudent(conn, p?: {...; withUser?: boolean})`, `makeEnrollment`, `makePlacementTest`, `makeClass`, `makeSession`, `makeAttendance`, `makeAssessment`, `makeGrade`, `makeInvoice`, `makePayment` — mỗi hàm `(conn: Connection, partial?: Partial<Doc>) => Promise<Doc>`, tự tạo phụ thuộc thiếu (ví dụ `makeClass` tự tạo course + teacher), dữ liệu hợp lệ theo BACKEND_SCHEMA.

- [ ] **Step 1: Test fail** `indexes.e2e-spec.ts`: sau `syncIndexes()`, tồn tại các index unique: `users.username`, `users.email (sparse)`, `courses.code`, `rooms.code`, `students.code`, `classes.code`, `attendances.{sessionId,studentId}`, `grades.{assessmentId,studentId}`, `invoices.code`, `invoices.enrollmentId (partial kind=TUITION)`, `payments.code`; và **không** có unique trên `students.phone`. Test factory: `makeClass(conn)` tạo đủ course + teacher role TEACHER; `makeStudent(conn,{withUser:true})` tạo user STUDENT có `studentId`, không có email.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS (cũng chạy lại health test).
- [ ] **Step 5:** Commit `feat(api): mongoose schemas, test harness, factories`.

### Task 7: API — common services (W0-03)

**Files:**
- Create: `common/db/{transaction.ts,counter.service.ts}`, `common/audit/audit.service.ts`, `common/notifications/notifications.service.ts`, `common/settings/settings.service.ts`, `common/scope/scope.service.ts`, `common/pagination.ts`, `common/common.module.ts`; test `test/e2e/common-services.e2e-spec.ts`

**Interfaces:**
- Consumes: models (Task 6), `ClockService` (Task 5).
- Produces:
  - `withTransaction<T>(conn: Connection, fn: (s: ClientSession) => Promise<T>): Promise<T>`
  - `CounterService.next(key: string, s?: ClientSession): Promise<number>`; `CounterService.formatCode(prefix: string, period: string, seq: number, pad: number): string`
  - `AuditService.log(e: { actor: AuthUser; action: 'create'|'update'|'delete'|'status'; entity: string; entityId: Types.ObjectId; before?: unknown; after?: unknown }, s?: ClientSession): Promise<void>`
  - `NotificationsService.notify(userIds: Types.ObjectId[], n: { type: NotificationType; title: string; body: string; refType?: string; refId?: Types.ObjectId }): Promise<void>` (bỏ trùng userId)
  - `SettingsService.get(): Promise<Settings>` (tạo mặc định BACKEND_SCHEMA §2.20 nếu chưa có), `SettingsService.update(patch, actor)`
  - `ScopeService.teacherClassIds(userId): Promise<Types.ObjectId[]>`, `teacherCanTakeAttendance(userId, session: {teacherId; classId}): Promise<boolean>`, `studentClassIds(studentId, mode: 'current'|'history')`, `teacherStudentIds(userId)`
  - `paginate<T>(model, filter, q: Pagination, projection?): Promise<{ data: T[]; meta: { page; limit; total } }>`
  - `AuthUser = { id: Types.ObjectId; role: Role; studentId?: Types.ObjectId }` (file `common/auth/auth-user.ts`)

- [ ] **Step 1: Test fail:** `withTransaction` throw sau khi insert → không còn document; `Promise.all` 50 × `counter.next('student:2026')` → tập 50 số = `{1..50}`; `formatCode('HV','2026',42,5)==='HV202600042'`; settings lần đầu trả `{attendanceWarningThreshold:0.2, gradeLockDays:14, resultViewRequiresPaidFees:false, teacherAttendanceEditDays:7, invoiceDueDaysAfterStart:7}`; notify `[u1,u1,u2]` → 2 notifications; ScopeService: trợ giảng có lớp trong `teacherClassIds`; GV dạy thay (session.teacherId) → `teacherCanTakeAttendance` true nhưng lớp không trong `teacherClassIds`; HV có enrollment TRANSFERRED: lớp có trong `history`, không trong `current`; `paginate` trả `meta.total` đúng.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5:** Commit `feat(api): transaction, counter, audit, notifications, settings, scope services`.

### Task 8: API — guards & decorators (W0-03/04)

**Files:**
- Create: `common/auth/{roles.decorator.ts,current-user.decorator.ts,jwt-auth.guard.ts,roles.guard.ts,public.decorator.ts}`, test `test/e2e/guards.e2e-spec.ts` (controller test-only)
- Modify: `setup-app.ts` / `app.module.ts` (APP_GUARD: JwtAuthGuard rồi RolesGuard)

**Interfaces:**
- Produces: `@Public()`, `@Roles(...roles: Role[])`, `@CurrentUser(): AuthUser`. Guard toàn cục: `@Public` → bỏ qua; thiếu/invalid token → 401 `UNAUTHENTICATED`; user `mustChangePassword` và route không thuộc `/auth/*` → 403 `PASSWORD_CHANGE_REQUIRED`; route không có `@Roles` → 403 `FORBIDDEN` (fail-closed); role không có trong `@Roles` → 403. JWT payload `{ sub, role, studentId?, mcp?: boolean }`.

- [ ] **Step 1: Test fail:** route không `@Roles` với token MANAGER → 403; route `@Roles('MANAGER')` với TEACHER → 403, với MANAGER → 200; không token → 401; token hết hạn (clock + 16 phút) → 401; `@Public` không token → 200; token `mcp:true` vào route thường → 403 `PASSWORD_CHANGE_REQUIRED`.
- [ ] **Step 2–4:** FAIL → hiện thực (`@nestjs/jwt` verify với `clockTimestamp` từ ClockService) → PASS.
- [ ] **Step 5:** Commit `feat(api): fail-closed auth and roles guards`.

### Task 9: API — Auth & Users core (W0-04)

**Files:**
- Create: `modules/auth/{auth.module.ts,auth.controller.ts,auth.service.ts,token.service.ts,password.ts}`, `modules/users/{users.module.ts,users.service.ts}`, `scripts/seed.ts` (chỉ ADMIN ở W0), `test/helpers/auth.ts`, `test/e2e/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: guards (Task 8), schemas `LoginInput`, `ChangePasswordInput` (Task 4).
- Produces:
  - Endpoints `/auth/login|refresh|logout|me|change-password` (BACKEND_SCHEMA §3.3).
  - `UsersService.createStudentAccount(studentId: Types.ObjectId, code: string, s?: ClientSession): Promise<{ userId: Types.ObjectId; tempPassword: string }>`; `UsersService.createStaff(input, actor)` (dùng ở L-CATALOG); `generateTempPassword(): string` (10 ký tự, có chữ + số).
  - `loginAs(t: TestApp, role: Role, overrides?): Promise<{ token: string; user: UserDoc }>`.
- Giá trị: bcrypt cost 12 (test dùng env `BCRYPT_COST=4`); access 15m; refresh 7d cookie `lc_rt` httpOnly sameSite=lax path `/api/v1/auth`; khóa 15 phút sau 5 lần sai trong 15 phút → 423 `ACCOUNT_LOCKED`; throttler 10 req/phút/IP cho `/auth/login`.

- [ ] **Step 1: Test fail** (đặt tên `FR-AUTH-01`/`FR-AUTH-02`): login đúng → 200 `{data:{accessToken, user}}` + `set-cookie lc_rt`; sai pass và sai username → cùng 401 `INVALID_CREDENTIALS` cùng message; 5 lần sai → lần 5 trả 423; `clock.advance(15*60e3+1)` → login được; refresh → token mới, refresh lại bằng cookie cũ → 401 và cookie mới cũng bị thu hồi; logout → refresh 401; STUDENT login bằng mã HV; `mustChangePassword` → `/auth/me` vẫn 200 (`mustChangePassword:true`), đổi mật khẩu `abc` → 400, `Password1` → 200 và cờ tắt; mọi response JSON không chứa chuỗi `passwordHash` (`JSON.stringify(res.body)`); `createStudentAccount` → user `username=code`, `email` không có, `mustChangePassword=true`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. `pnpm --filter api seed` tạo ADMIN từ env (idempotent).
- [ ] **Step 5:** Commit `feat(auth): login, refresh rotation, lockout, change password`.

### Task 10: API — khung module, enrollments.createPending, notifications API (W0-05)

**Files:**
- Create: vỏ `modules/{courses,rooms,settings,admissions,placement,classes,schedule,attendance,grades,fees,reports}/<m>.module.ts` (+ controller/service rỗng có `@Controller('<route>')`)
- Create: `modules/enrollments/{enrollments.module.ts,enrollments.service.ts,invoice-creator.ts}`, `modules/fees/noop-invoice-creator.ts`, `modules/notifications/{notifications.module.ts,notifications.controller.ts}`
- Modify: `app.module.ts` (import tất cả + `EventEmitterModule.forRoot()`)
- Test: `test/e2e/enrollments-core.e2e-spec.ts`, `test/e2e/notifications.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `EnrollmentsService.createPending(studentId: Types.ObjectId, courseId: Types.ObjectId, actor: AuthUser, s?: ClientSession): Promise<EnrollmentDoc>`
  - `export const INVOICE_CREATOR = Symbol('INVOICE_CREATOR'); interface InvoiceCreator { createForEnrollment(enrollmentId: Types.ObjectId, s: ClientSession): Promise<void>; voidForEnrollment(enrollmentId: Types.ObjectId, reason: string, s: ClientSession): Promise<void> }` — FeesModule cung cấp `NoopInvoiceCreator` tới W2.
  - `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all` — `@Roles(...ALL_ROLES)`.

- [ ] **Step 1: Test fail:** `FR-ADM-05` createPending → status `PENDING_PLACEMENT`, `history[0]` = `{from:null,to:'PENDING_PLACEMENT'}`; gọi lần hai cùng HV+khóa → `AppError ENROLLMENT_EXISTS` (409); enrollment cũ CANCELLED → tạo được. `FR-NTF-01`: user A thấy 2 thông báo của mình, không thấy của B; unread-count = 2 → read một cái → 1; read thông báo của B → 404; read-all → 0.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. App boot với mọi module (health test vẫn xanh).
- [ ] **Step 5:** Commit `feat(api): module skeletons, enrollment createPending, notifications api`.

### Task 11: Web — nền (Tailwind, shadcn, lib) (W0-06)

**Files:**
- Create: `apps/web/{tailwind.config.ts,postcss.config.js,components.json}`, `src/index.css` (token DESIGN §2, font Be Vietnam Pro qua Google Fonts trong `index.html`, dark mode `class`), `src/lib/{utils.ts,format.ts,status.ts,error-messages.ts,api.ts,query-client.ts}`, `test/{setup.ts,render.tsx,msw/server.ts,msw/handlers.ts}`, tests `src/lib/__tests__/*.test.ts`
- shadcn add: button, input, label, form, select, dialog, sheet, dropdown-menu, table, badge, tabs, popover, command, calendar, checkbox, radio-group, textarea, toast(sonner), skeleton, tooltip, separator, avatar, scroll-area.

**Interfaces:**
- Produces:
  - `formatVnd` (re-export shared), `formatDate(d: Date|string): string` (`dd/MM/yyyy` giờ VN), `formatDateTime` (`HH:mm dd/MM/yyyy`), `formatTime`.
  - `STATUS_LABELS: Record<StatusGroup, Record<string, { label: string; tone: 'success'|'warning'|'info'|'destructive'|'muted'|'primary' }>>` theo DESIGN §2.
  - `errorMessage(e: ApiError): string` — `ERROR_MESSAGES: Record<ErrorCode, string>` (đủ mọi mã, tiếng Việt, DESIGN §6).
  - `class ApiError extends Error { code: ErrorCode; status: number; details?: { fields?: Record<string,string>; [k: string]: unknown } }`; `api` (ky instance, prefix `/api/v1`, gắn `Authorization` từ `tokenStore`, `credentials:'include'`); `tokenStore = { get(), set(t), clear(), onChange(cb) }`; `setOnAuthFailure(cb: () => void)`.
  - `renderWithProviders(ui, { user?: MeDto|null; route?: string })`.

- [ ] **Step 1: Test fail:** `formatVnd(1500000)==='1.500.000 ₫'`; `formatDate('2026-01-14T17:30:00Z')==='15/01/2026'`; mọi `ErrorCode` có message không rỗng; **api**: 401 lần đầu → gọi `POST /auth/refresh` đúng 1 lần → retry thành công; refresh trả 401 → `onAuthFailure` gọi 1 lần, không retry thêm (MSW đếm số request); lỗi `{error:{code:'CLASS_FULL'}}` → throw `ApiError` code `CLASS_FULL`.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5:** Commit `feat(web): tailwind theme, shadcn, api client, format and error maps`.

### Task 12: Web — auth, layout, router, trang chung (W0-06)

**Files:**
- Create: `src/auth/{auth-context.tsx,use-auth.ts,require-role.tsx}`, `src/layouts/{app-shell.tsx,nav-config.ts,auth-layout.tsx}`, `src/router.tsx`, `src/features/auth/pages/{login-page.tsx,change-password-page.tsx}`, `src/features/notifications/{api.ts,hooks.ts,pages/notifications-page.tsx,components/notification-bell.tsx}`, `src/features/home/home-router.tsx`, `src/features/errors/{not-found-page.tsx,forbidden-page.tsx}`
- Create placeholder (component `<PlaceholderPage title="..."/>`) cho **mọi route DESIGN §4** trong feature của lane sở hữu (ARCHITECTURE §5), gồm tab component của `/classes/:id` và `/students/:id`, các trang `/me/*`, `features/dashboard/pages/staff-dashboard.tsx`, `features/home/pages/{teacher-home,student-home}.tsx`.
- Test: `src/auth/__tests__/*.test.tsx`, `src/layouts/__tests__/app-shell.test.tsx`

**Interfaces:**
- Produces: `useAuth(): { user: MeDto|null; status: 'loading'|'authenticated'|'anonymous'; login(i: LoginInput): Promise<void>; logout(): Promise<void>; refreshMe(): Promise<void> }`; `<RequireRole roles={Role[]}>`; `NAV_ITEMS: NavItem[]` với `{ to, label, icon, roles: Role[], mobile?: boolean }` theo bảng DESIGN §3; `<TabSlot>` pattern: `CLASS_TABS`, `STUDENT_TABS: { key, label, roles, component: LazyExoticComponent }[]`.

- [ ] **Step 1: Test fail:** login sai (MSW 401 INVALID_CREDENTIALS) → hiện "Sai thông tin đăng nhập"; login TEACHER → sidebar có "Lịch dạy", "Điểm danh", không có "Báo cáo", "Xếp lớp"; user `mustChangePassword` truy cập `/classes` → chuyển `/change-password`; STUDENT vào `/reports` → trang 403; `/` với STUDENT render StudentHome placeholder, với MANAGER render StaffDashboard placeholder; chuông hiển thị số chưa đọc từ `/notifications/unread-count`; viewport 375 → bottom nav thay sidebar (kiểm `matchMedia` mock).
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5:** Commit `feat(web): auth flow, app shell, role navigation, route placeholders`.

### Task 13: Web — component dùng chung (W0-06)

**Files:**
- Create: `src/components/common/{page-header,data-table,filter-bar,search-input,status-badge,money-input,money-text,date-picker,date-range-picker,time-input,entity-select,confirm-dialog,reason-dialog,empty-state,error-state,form-field,capacity-bar,conflict-list,placeholder-page}.tsx` + `__tests__/`

**Interfaces:**
- Produces (props chính):
  - `DataTable<T>({ columns: ColumnDef<T>[]; data: T[]; total: number; page: number; limit: number; onPageChange(p); isLoading; isError; onRetry; empty: { title; description?; action? } })`
  - `StatusBadge({ group: StatusGroup; value: string; overdue?: boolean })`
  - `MoneyInput` (controlled, `value: number|null`, `onChange(n: number|null)`), `MoneyText({ value })`
  - `SearchInput({ value, onChange, delayMs = 300 })`
  - `EntitySelect({ entity: 'student'|'class'|'teacher'|'room'|'course'; value; onChange; filter? })` (gọi `GET /<entity>s?q=`)
  - `ConfirmDialog({ title; description; confirmLabel; destructive?; onConfirm })`, `ReasonDialog({ title; minLength = 5; onSubmit(reason) })`
  - `CapacityBar({ current; max })` (đỏ khi `current >= max`), `ConflictList({ conflicts: SessionConflictDto[] })`

- [ ] **Step 1: Test fail:** DataTable `data=[]` → hiện `empty.title`; `isError` → nút "Thử lại" gọi `onRetry`; MoneyInput gõ `1500000` → hiển thị `1.500.000`, `onChange` nhận `1500000` (number); SearchInput gõ 5 ký tự nhanh → `onChange` gọi 1 lần sau 300ms (fake timers); ReasonDialog lý do 3 ký tự → nút gửi disabled; CapacityBar `20/20` có class tone destructive; StatusBadge `('invoice','PARTIAL')` → "Thanh toán một phần".
- [ ] **Step 2–4:** FAIL → hiện thực → PASS.
- [ ] **Step 5:** Commit `feat(web): shared components`.

### Task 14: Quy trình swarm & merge gate (W0-07)

**Files:**
- Create: `scripts/lane-start.sh`, `scripts/merge-gate.sh`, `scripts/lane-owners.json`, `scripts/fr-coverage.sh`, `.github/workflows/ci.yml`, `README.md` (cài đặt, lệnh, tài khoản seed)
- Test: `scripts/__tests__/merge-gate.test.sh` (bats-free: shell script tự assert)

**Interfaces:**
- Produces: `scripts/lane-start.sh <lane>` → `git worktree add ../lc-<lane> -b lane/<lane> main`; `scripts/merge-gate.sh [lane]` → chạy `pnpm i --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`, và nếu có `lane`: so `git diff --name-only main...lane/<lane>` với glob trong `lane-owners.json` (cộng `TASK.md`, `docs/DECISIONS.md`, `docs/QUESTIONS.md`, `docs/contract-requests/**`), in file vi phạm và exit 1; `scripts/fr-coverage.sh` in các mã `FR-[A-Z]+-[0-9]+` có trong PRD.md nhưng không xuất hiện trong file test nào, exit 1 nếu `--strict`.
- `lane-owners.json`: map lane → globs theo TASK.md (L-CATALOG, L-ADMISSIONS, L-CLASSES, L-SCHEDULE, L-ENROLL, L-ATTENDANCE, L-GRADES, L-FEES, L-REPORTS, L-STUDENT-PORTAL, L-E2E, L-HARDENING).

- [ ] **Step 1: Test fail** `merge-gate.test.sh`: tạo repo tạm, nhánh `lane/L-CLASSES` sửa `packages/shared/src/enums.ts` → `merge-gate.sh L-CLASSES --ownership-only` exit 1 và in đường dẫn; sửa `apps/api/src/modules/classes/x.ts` → exit 0.
- [ ] **Step 2–4:** FAIL → hiện thực → PASS. Chạy `scripts/merge-gate.sh` trên `main` → xanh.
- [ ] **Step 5:** Cập nhật `TASK.md` đánh dấu W0-01..W0-07 `[x]`; commit `chore: swarm scripts, merge gate, CI`; `git tag w0`.

---

## Self-review (đã chạy)
- Phủ spec: W0-01→T1, W0-02→T2–T4, W0-03→T5–T7, W0-04→T8–T9, W0-05→T10, W0-06→T11–T13, W0-07→T14. ScopeService, createStudentAccount, HomeRouter/tab slot, `INVOICE_CREATOR.voidForEnrollment` (các sửa sau builder check) đều có task.
- Mã lỗi mới phát sinh khi lập plan: `CONFLICT` (409), `INTERNAL` (500) — thêm vào `errors.ts` ở Task 2 và ghi `docs/DECISIONS.md`.
- Kiểu nhất quán: `AuthUser` định nghĩa Task 7, dùng Task 8–10; `ClockService` Task 5 dùng Task 7–9; `MeDto`, `LoginInput` từ Task 4 dùng Task 12.
