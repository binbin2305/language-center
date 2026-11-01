# Wave 4 — Hoàn thiện: E2E, Hardening, mục để lại Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiện thực TASK.md Wave 4 — Playwright E2E X-01..X-06 (L-E2E), bảo mật / hiệu năng / accessibility / tài liệu H-01..H-04 (L-HARDENING), các mục W2/W3 để lại + FR coverage + coverage NFR-07 (L-LEAD) — rồi qua **merge gate cuối** và tag `w4`.

**Architecture:** Lead làm Task 0 (hợp đồng, dependency, đồng hồ, route inventory, ownership) và Task 0b (harness E2E) tuần tự trên `main`. Sau đó 3 nhánh song song, mỗi nhánh một worktree: `lane/L-E2E`, `lane/L-HARDENING` (ownership gate theo `scripts/lane-owners.json` mới) và `lane/L-LEAD` (Lead; không đụng file thuộc hai lane kia). Lỗi sản phẩm do E2E/hardening phát hiện → contract request → Lead sửa trên `lane/L-LEAD` (L-07). Task M merge L-LEAD → L-HARDENING → L-E2E, bật lại test `test.fail`/`it.failing`, chạy merge gate cuối (unit, integration, FE, E2E, security, coverage, fr-coverage `--strict`), smoke, final review, tag `w4`.

**Tech Stack:** như W3 — NestJS 11, Mongoose 8, zod 3.25, React 18, Vitest 2.1.9, MSW 2; thêm: `@playwright/test` 1.64.1 (đã có, Chrome hệ thống), `@axe-core/playwright` 4.10.x, `@nestjs/swagger` 11.4.7 (đã có) + `@asteasolutions/zod-to-openapi` 7.3.x, `@vitest/coverage-v8` 2.1.9 (đã có trong lockfile cho shared), jest coverage (istanbul, sẵn có).

**Spec:** `TASK.md` "Wave 4 — Hoàn thiện" (X-01..X-06, H-01..H-04, "Merge gate cuối"); `PRD.md` NFR-01 (bảo mật), NFR-02 (p95 < 300ms với 10.000 HV / 500 lớp / 50.000 buổi), NFR-05 (375px), NFR-06 (a11y), NFR-07 (coverage dòng ≥ 85% `apps/api/src/modules/**`, ≥ 75% `apps/web/src/features/**`; mọi FR có test), FR-AUD-01; `RULES.md`; `docs/DECISIONS.md` (D1–D28); `docs/superpowers/handoff-wave4.md`; `docs/superpowers/wave3-ledger.md` (deferred minors, triage "W4"); `docs/superpowers/wave2-ledger.md` (final fix wave: classHistory backfill, teacherStudentIds).

## Global Constraints
- Mọi shell: `export PATH=/opt/homebrew/bin:$PATH` (Node 26, pnpm 9, **không có Docker**). Commit: `git -c user.name=huybin2305 -c user.email=huybin2305@gmail.com commit …`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase dùng `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env.
- RULES.md nguyên văn: TDD — **RED chạy trước code và dán output RED thô (không tóm tắt) từ lệnh test của chính task**; reviewer kiểm tên file test trong khối RED. Test tên tiếng Việt có mã FR **viết rời từng mã** (`FR-CLS-02 FR-CLS-03`, cấm `FR-CLS-01..03` / `FR-ADM-01/02/08` — `fr-coverage.sh` chỉ đếm mã nguyên văn, D37). Không `it.skip/only`, `test.skip/only`.
- Test đặc tả hành vi đã có (E2E, security sweep, a11y): nếu xanh ngay lần đầu, chứng minh assertion có hiệu lực bằng cách đảo **một** assertion then chốt, chạy thấy FAIL, dán output thô, hoàn nguyên. Lỗi sản phẩm thật → **không sửa ngoài lane**: đánh dấu `test.fail(true, 'CR <lane>-<n>')` (Playwright) / `it.failing` (jest) và ghi `docs/contract-requests/<lane>-<n>.md` (route/trang, bước tái hiện, kỳ vọng, thực tế, đề xuất).
- Backend: controller mỏng, `@Roles` tường minh, `ZodValidationPipe(<schema @lc/shared>)`, `toDto`, `ClockService.now()`, ngày-only qua helper VN (cấm `toISOString().slice`), `AuditService.log` cho mọi ghi.
- FE: API qua `features/<m>/api.ts` + `hooks.ts`; `can()`; màu qua token CSS (DESIGN §1, có dark mode); lỗi qua `lib/error-messages.ts`; trang lazy chờ `findBy…(…, {}, { timeout: 10_000 })`.
- E2E: Playwright `channel: 'chrome'` (không tải browser), click thật (cấm `dispatchEvent`, `force: true` — bài học T2a W3), `workers: 1`, mỗi spec tự tạo dữ liệu với hậu tố `runId` (trừ buổi hôm nay của seed ở X-04).
- **Trước mọi build để chạy thật: `rm -rf apps/api/dist apps/web/dist`** (tsbuildinfo cũ gây 500 ở W3) — `e2e/run.sh` tự làm.
- Test API mặc định `DEFAULT_NOW = 2026-01-05T02:00:00Z`; mỗi file e2e/security một `createTestApp()`.
- Không chạy hai full chain / hai `pnpm e2e` cùng lúc (cổng 27027/3100/4173 cố định); jest đứng 0% CPU vài phút → kill rồi chạy lại.

## Review Focus
1. **"Hôm nay" lệch giữa API và trình duyệt** — API dùng `APP_CLOCK_START`, trình duyệt dùng giờ máy thật (2026-11-01): trang chủ GV hỏi `/sessions?from=<hôm nay trình duyệt>` → rỗng. Kỳ vọng: cả hai cùng 2026-11-02 VN. Test: `harness.spec.ts` (Task 0b) so `vnDay` của `Date.now()` trong page với ngày của `GET /reports/dashboard` (`todaySessions[0].startAt`).
2. **Đồng hồ giả lọt vào production** — `APP_CLOCK_START` đặt nhầm trên server thật. Kỳ vọng: `NODE_ENV=production` → `SystemClock`, cảnh báo log, `now()` ≈ giờ thật. Test: `clock-override.security-spec.ts` (Task 0).
3. **Sweep bảo mật pass giả** — id fixture sai → mọi route trả 404 "đúng" mà không chứng minh gì. Kỳ vọng: route HV được phép gọi với id **của chính HV** → 2xx trước khi gọi với id HV khác → 403/404; route có `:param` chưa có fixture → test fail tên route. Test: H-01B.
4. **Chạy lại E2E / giới hạn đăng nhập** — nhiều lần đăng nhập UI vượt 10 req/phút → 429; chạy `pnpm e2e` hai lần liên tiếp đụng dữ liệu cũ. Kỳ vọng: e2e env `LOGIN_RATE_LIMIT=1000`, DB tạm mới mỗi lần chạy; lần 2 vẫn xanh. Test: Task 0b Step 4 (chạy 2 lần), H-01A (rate limit mặc định vẫn 10 → 429 ở request thứ 11).
5. **375px: nút chính bị che / cuộn ngang** — bottom nav che thanh lưu (T2a W3). Kỳ vọng: ở 375×812 `document.scrollingElement.scrollWidth ≤ 375` và nút "Lưu điểm danh" click thật được (không bị phần tử khác chặn). Test: X-04, X-02 (bước HV xác nhận lớp).

---

## Lead decisions (đã chốt)
- **D29 Mongo cho E2E (thay "docker mongo" của TASK.md):** `e2e/run.sh` chạy `apps/api/scripts/dev-mongo.ts` với `MONGO_DEV_PORT=27027` và `MONGO_DATA_DIR=<mktemp -d>` (MongoMemoryReplSet một node, wiredTiger, DB mới mỗi lần chạy, xóa khi kết thúc) → `seed:demo --reset` → `rm -rf apps/api/dist apps/web/dist` → `pnpm build` thật → api `node apps/api/dist/main` cổng 3100 → web `vite preview` cổng 4173 (proxy `/api` → `API_PROXY_TARGET`) → `playwright test`. Env api E2E: `NODE_ENV=e2e`, `LOGIN_RATE_LIMIT=1000`, `JWT_ACCESS_SECRET` cố định ≥ 32 ký tự, `WEB_ORIGIN=http://localhost:4173`, `UPLOAD_DIR=<tmp>/uploads`, `APP_CLOCK_START` (D30).
- **D30 Đồng hồ có điều khiển:** env `APP_CLOCK_START` (ISO-8601 có offset). Khi đặt và `NODE_ENV !== 'production'` → `OffsetClock`: `now() = start + (Date.now() − bootTime)` (thời gian vẫn chạy, giữ thứ tự createdAt/audit). `NODE_ENV === 'production'` → bỏ qua, `SystemClock`, `Logger.warn('APP_CLOCK_START ignored in production')`. E2E dùng `2026-11-02T13:00:00Z` (20:00 VN thứ Hai — mọi buổi hôm nay của seed đã bắt đầu, còn trong cửa sổ sửa D16); trình duyệt `page.clock.install({ time: APP_CLOCK_START })` (không pause).
- **D31 Playwright:** `channel: 'chrome'`; staff 1280×800; GV/HV 375×812 `hasTouch: true, isMobile: true`; đăng nhập qua form UI (`loginAs(page, account)`), không storageState; `retries: 0`, `trace: 'retain-on-failure'`; tiêu đề test có mã FR rời.
- **D32 Ownership W4:** L-E2E = `e2e/**` trừ `e2e/a11y/**`; L-HARDENING = `apps/api/test/security/**`, `apps/api/test/perf/**`, `apps/api/src/openapi/**`, `e2e/a11y/**`, `README.md`, `docs/hardening/**` (bỏ `docs/**` cũ — `docs/DECISIONS.md` chỉ được **thêm** mục dưới heading `## Wave 4 hardening notes`; D-số do Lead cấp). Harness `e2e/{playwright.config.ts,run.sh,fixtures/**}` do Lead viết ở Task 0b, sau đó thuộc L-E2E nhưng **chữ ký export của `e2e/fixtures/**` đóng băng** (L-HARDENING dùng) — đổi chữ ký → CR. L-LEAD không đụng file của hai lane trên.
- **D33 OpenAPI (H-04):** `@nestjs/swagger@11.4.7` (đã có) + `@asteasolutions/zod-to-openapi` 7.3.x (dòng hỗ trợ zod 3; 8.x cần zod 4). Tài liệu sinh từ `listRoutes(app)` (Task 0) + schema zod lấy từ `ZodValidationPipe.schema` của tham số route; phục vụ `GET /api/docs` (Swagger UI) và `GET /api/docs-json`; **không mount khi `NODE_ENV=production`** (NFR-01: chỉ login/refresh/health public).
- **D34 Coverage NFR-07:** api: jest `projects` = unit (`src/**/*.spec.ts`) + e2e (`test/e2e/**`), `collectCoverageFrom: ['src/modules/**/*.ts']`, `coverageThreshold.global.lines = 85`; web: vitest `coverage: { provider: 'v8', include: ['src/features/**'], exclude: ['**/__tests__/**'], thresholds: { lines: 75 } }`. Lệnh gốc `pnpm coverage`. Thư mục `coverage/` git-ignored.
- **D35 Ngữ nghĩa sweep bảo mật (H-01B):** mỗi route GET có `:param` được ánh xạ tới id tài nguyên của HV B qua bảng `PARAM_FIXTURES` theo tiền tố path; tài nguyên không thuộc HV (`/courses/:id`, `/rooms/:id`) nằm trong `NOT_STUDENT_OWNED` có lý do; HV A gọi → status ∈ {403, 404}. Route HV được phép: gọi với id của A trước → 2xx.
- **D36 Hiệu năng (H-02):** DB riêng (MongoMemoryReplSet wiredTiger) + `runSeedDemo` + `runSeedLarge({ students: 10000, classes: 500, sessionsPerClass: 100 })` (= 50.000 buổi); app in-process lắng nghe cổng tạm; 10 endpoint × 5 warm-up + 50 request tuần tự, p95 < 300ms; mọi query bắt được qua `mongoose.set('debug', fn)` trong một request đem `explain('queryPlanner')`: không stage `COLLSCAN`. Kết quả ghi `docs/hardening/perf-report.md`. Không thuộc full chain (chạy ở H-02 và Task M).
- **D37 FR coverage:** `fr-coverage.sh` chỉ đếm mã nguyên văn; 5 FR "thiếu" (FR-ADM-08, FR-CLS-02, FR-CLS-03, FR-STU-04 bị viết gộp; FR-AUD-01 chưa có test) xử lý ở L-05; merge gate cuối chạy `--strict`.
- **D38 Phạm vi HV của GV (W2 hardening):** `ScopeService.teacherStudentIds` = HV có enrollment ENROLLED|COMPLETED mà `classId ∈ teacherClassIds` **hoặc** `classHistory ∩ teacherClassIds ≠ ∅` (nhất quán R22) — GV lớp cũ vẫn mở được hồ sơ HV đã chuyển đi mà họ thấy trong kết quả lớp.
- **D39 Báo cáo (W3 để lại):** academic `rows` chỉ gồm lớp có `startDate ≤ to` và `endDate ≥ from`; admissions thêm hàng `key: 'none', label: 'Khác'` cho hồ sơ không có khóa để Σ`rows.newProfiles` = `totals.newProfiles` (như finance R2); PDF báo cáo format tiền bằng `formatVnd`, bảng rỗng vẫn có đủ header.

---

## File Structure

```
Task 0 (main):
  package.json, apps/api/package.json, apps/web/package.json, pnpm-lock.yaml   deps + scripts (test:security, coverage, e2e, perf)
  scripts/lane-owners.json, scripts/merge-gate.sh, scripts/__tests__/merge-gate.test.sh
  apps/api/src/config/env.ts                       + APP_CLOCK_START
  apps/api/src/common/clock/{clock.service,clock.factory,clock.factory.spec}.ts   OffsetClock, createClock
  apps/api/src/common/common.module.ts             ClockService useFactory
  apps/api/src/common/pipes/zod-validation.pipe.ts schema public readonly
  apps/api/src/common/routes/route-inventory.ts   listRoutes(app)  (test: test/security/route-inventory.security-spec.ts)
  apps/api/src/openapi/setup-openapi.ts            stub no-op (H-04 điền)
  apps/api/src/setup-app.ts                        gọi setupOpenApi
  apps/api/jest-security.config.ts, apps/api/test/security/clock-override.security-spec.ts
  apps/api/scripts/{seed-large,dev-mongo}.ts       SEED_SESSIONS_PER_CLASS, MONGO_DATA_DIR
  apps/web/vite.config.ts                          API_PROXY_TARGET
  docs/DECISIONS.md (D29–D39), TASK.md ([~])
Task 0b (main):  e2e/{run.sh,playwright.config.ts,harness.spec.ts,fixtures/{accounts,auth,clock,api,ids}.ts}
L-E2E:       e2e/flows/x0{1..6}-*.spec.ts
L-HARDENING: apps/api/test/security/*.security-spec.ts, apps/api/test/perf/p95.ts,
             e2e/a11y/a11y.spec.ts, apps/api/src/openapi/**, README.md, docs/hardening/**
L-LEAD:      common/scope, scripts/migrate-class-history.ts, modules/reports, features/{reports,dashboard,home,attendance},
             test titles (FR rời), test/e2e/audit-coverage.e2e-spec.ts, jest/vitest coverage config + tests bù
```

---

### Task 0: Lead — hợp đồng Wave 4 (trên `main`, trước khi mở nhánh)

**Files:** như File Structure "Task 0".

**Interfaces — Produces:**
```ts
// apps/api/src/common/clock/clock.service.ts
export class OffsetClock extends ClockService { constructor(start: Date, realNow?: () => number); now(): Date }
// apps/api/src/common/clock/clock.factory.ts
export function createClock(env: Pick<Env, 'NODE_ENV' | 'APP_CLOCK_START'>, logger?: Pick<Logger, 'warn'>): ClockService
// apps/api/src/common/routes/route-inventory.ts
export interface RouteInfo {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;                 // không có tiền tố, vd '/students/:id'
  controller: string; handler: string;
  roles: Role[] | undefined;    // getAllAndOverride(ROLES_KEY) như RolesGuard
  isPublic: boolean; allowPasswordChange: boolean;
  params: string[];             // ['id'], ['id','docId']
  schemas: { body?: ZodTypeAny; query?: ZodTypeAny; param?: ZodTypeAny };   // từ ZodValidationPipe.schema
}
export function listRoutes(app: INestApplication): RouteInfo[]   // DiscoveryService + MetadataScanner, sắp method+path
// apps/api/src/openapi/setup-openapi.ts
export function setupOpenApi(app: NestExpressApplication, env: Env): void   // Task 0: no-op; H-04 hiện thực
// apps/api/scripts/seed-large.ts
SeedLargeOptions += { sessionsPerClass?: number }   // mặc định course.totalSessions (16); CLI env SEED_SESSIONS_PER_CLASS
// scripts: root "test:security": "pnpm -r --if-present test:security", "coverage": "pnpm --filter api test:coverage && pnpm --filter web test:coverage",
//          "e2e": "bash e2e/run.sh";  api "test:security": "jest --config jest-security.config.ts --runInBand", "perf": "ts-node test/perf/p95.ts"
```

- [ ] **Step 1: Deps.** `pnpm view <pkg> time --json` chọn bản mới nhất **đã phát hành ≥ 14 ngày**: `@asteasolutions/zod-to-openapi` 7.3.x (apps/api), `@axe-core/playwright` 4.10.x (root dev), `@vitest/coverage-v8@2.1.9` (apps/web dev, khớp vitest 2.1.9). Pin chính xác (không `^`). Smoke import mỗi gói (ts-jest CJS / vitest). Ghi vào DECISIONS "Installed for lanes".
- [ ] **Step 2 (RED):**
  - `clock.factory.spec.ts`: `không có APP_CLOCK_START → SystemClock`; `APP_CLOCK_START=2026-11-02T13:00:00Z, NODE_ENV=e2e → now() = 2026-11-02T13:00:00Z + thời gian đã trôi (realNow giả +5000ms → 13:00:05Z)`; `giá trị không phải ISO → loadEnv ném lỗi nêu APP_CLOCK_START`.
  - `test/security/clock-override.security-spec.ts` `describe('NFR-01 Đồng hồ giả bị bỏ qua ở production')`: `NODE_ENV=production + APP_CLOCK_START=2020-01-01T00:00:00Z → createClock trả SystemClock, |now − Date.now()| < 1000, logger.warn được gọi một lần`; `NestFactory app với env đó: GET /api/v1/health 200 và ClockService là SystemClock` (Review Focus 2).
  - `test/security/route-inventory.security-spec.ts` (`createTestApp()`; AppModule cần DB): `GET /students/:id có roles và params ['id']`; `POST /auth/login isPublic`; `POST /leads có schemas.body = CreateLeadInput`; `không có route trùng method+path`.
  - `seed-demo.e2e-spec.ts` thêm: `runSeedLarge(…, { students: 20, classes: 2, sessionsPerClass: 3 }) → mỗi lớp L-* có đúng 3 session`.
  - `merge-gate.test.sh` thêm: `L-E2E sửa e2e/a11y/x.spec.ts → 1`; `L-HARDENING sửa e2e/a11y/x.spec.ts, README.md, apps/api/src/openapi/a.ts → 0`; `L-HARDENING sửa docs/superpowers/x.md → 1`.
- [ ] **Step 3:** chạy `pnpm --filter api test -- clock`, `pnpm --filter api test:security`, `pnpm --filter api test:e2e -- seed-demo`, `bash scripts/__tests__/merge-gate.test.sh` → FAIL đúng lý do (dán output thô).
- [ ] **Step 4 (GREEN):** hiện thực Interfaces; `CommonModule` `{ provide: ClockService, useFactory: () => createClock(loadEnv(), new Logger('Clock')) }` (test vẫn `overrideProvider(ClockService)`); `ZodValidationPipe` đổi `private readonly schema` → `readonly schema`; `setupApp` gọi `setupOpenApi(app, loadEnv())`; `dev-mongo.ts` đọc `MONGO_DATA_DIR` (mặc định `.mongo-data/`); `vite.config.ts` `proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' }` (preview kế thừa); `jest-security.config.ts` = e2e config với `testMatch: ['<rootDir>/test/security/**/*.security-spec.ts']`; `merge-gate.sh` thêm `pnpm test:security` sau `pnpm test:e2e`; `lane-owners.json` theo D32; `.gitignore` + `coverage/`, `e2e/test-results/`, `e2e/playwright-report/`.
- [ ] **Step 5:** ghi D29–D39 vào `docs/DECISIONS.md` (heading `## Wave 4 decisions`) + mục rỗng `## Wave 4 hardening notes`; TASK.md W4 ô `[~]`.
- [ ] **Step 6:** full chain `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:security && bash scripts/__tests__/merge-gate.test.sh` xanh; commit `chore: wave 4 contracts (clock override, route inventory, deps, ownership)`.

---

### Task 0b: Lead — harness E2E (trên `main`, sau Task 0)

**Files:** `e2e/run.sh`, `e2e/playwright.config.ts`, `e2e/harness.spec.ts`, `e2e/fixtures/{accounts,auth,clock,api,ids}.ts`, `e2e/tsconfig.json`

**Interfaces — Produces (đóng băng, D32):**
```ts
// e2e/fixtures/accounts.ts
export const ACCOUNTS: { manager, staff1, staff2, teacher1..teacher5, admin }   // { username, password: 'Password1' } từ seed-demo
export const CLOCK_START = '2026-11-02T13:00:00Z'; export const DEMO_TODAY = '2026-11-02';
// e2e/fixtures/auth.ts
export async function loginAs(page: Page, acc: { username: string; password: string }): Promise<void>   // form /login, chờ h1 trang chủ
export async function changePasswordFirstLogin(page: Page, oldPw: string, newPw: string): Promise<void>
// e2e/fixtures/clock.ts
export const test: TestType<…>   // extends base: mọi page gọi page.clock.install({ time: new Date(CLOCK_START) }) trước goto
export const mobile: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
export async function expectNoHorizontalScroll(page: Page): Promise<void>  // scrollingElement.scrollWidth ≤ innerWidth
// e2e/fixtures/api.ts
export async function apiAs(acc): Promise<APIRequestContext>   // POST /api/v1/auth/login, Bearer
export async function findTeacherWithUntakenSessionToday(): Promise<{ account; sessionId: string; classCode: string }>
// e2e/fixtures/ids.ts
export const runId: string;  export const uniquePhone: () => string;  export const uniqueEmail: (p: string) => string
```

- [ ] **Step 1 (RED):** `harness.spec.ts` `describe('Harness E2E')`: `M đăng nhập thấy dashboard h1`; `ngày trong trình duyệt (vnDay(Date.now())) = DEMO_TODAY và dashboard có ≥ 1 buổi hôm nay` (Review Focus 1); `findTeacherWithUntakenSessionToday() trả buổi SCHEDULED chưa điểm danh`; `GET /api/v1/health qua proxy 4173 → 200`.
- [ ] **Step 2:** `pnpm e2e` khi chưa có `run.sh` → FAIL (dán).
- [ ] **Step 3 (GREEN):** `run.sh` theo D29: `set -euo pipefail`, `trap` dừng mongo/api/web và xóa tmp; chờ "MongoDB ready" rồi lấy URI; seed `MONGODB_URI=<uri> pnpm --filter api seed:demo --reset`; `rm -rf apps/api/dist apps/web/dist && pnpm build`; khởi api/web nền, chờ `curl -sf http://localhost:4173/api/v1/health`; `pnpm exec playwright test -c e2e/playwright.config.ts "$@"`; trả exit code của playwright. Config: `testDir: '.'`, `testMatch: ['**/*.spec.ts']`, `use: { baseURL: 'http://localhost:4173', channel: 'chrome' }`, `workers: 1`, `fullyParallel: false` (D31).
- [ ] **Step 4:** chạy `pnpm e2e` **hai lần liên tiếp** → xanh cả hai (Review Focus 4); dán output.
- [ ] **Step 5:** commit `test(e2e): playwright harness with local mongod, real builds and controlled clock`.
- [ ] **Step 6:** controller chạy `scripts/lane-start.sh L-E2E`, `scripts/lane-start.sh L-HARDENING`, `git worktree add ../lc-L-LEAD -b lane/L-LEAD main`.

---

## Lane L-E2E (worktree `../lc-L-E2E`)

Mỗi X một file `e2e/flows/x0N-<slug>.spec.ts`, import `test` từ `fixtures/clock.ts`, dữ liệu mới có hậu tố `runId`. Kiểm tra trạng thái cuối bằng UI **và** một lệnh `apiAs` đọc lại (không chỉ toast). Lệnh mỗi task: `pnpm e2e flows/x0N`. Lỗi sản phẩm → `test.fail(true, 'CR L-E2E-<n>')` + CR (Global Constraints).

### Task X-01: Tiếp nhận → trùng → hồ sơ → HV đổi mật khẩu lần đầu

**Files:** `e2e/flows/x01-admissions-first-login.spec.ts`

- [ ] **Step 1:** `test('FR-ADM-01 FR-ADM-02 FR-ADM-03 FR-ADM-04 FR-AUTH-02 NVHV tiếp nhận → trùng → hồ sơ → HV đăng nhập lần đầu')`: staff1 tạo lead (SĐT `uniquePhone()`); tạo lead thứ hai cùng SĐT → hộp cảnh báo trùng hiển thị lead thứ nhất; hủy; mở lead thứ nhất → "Tạo hồ sơ" → dialog hiện mã HV + mật khẩu tạm; đăng xuất; HV đăng nhập bằng mã HV + mật khẩu tạm → bị chuyển tới trang đổi mật khẩu; đổi `Newpass123` → vào trang chủ HV; `apiAs(staff1)` `GET /leads?status=PROFILE_CREATED&q=<tên>` có lead đó.
- [ ] **Step 2:** chạy, dán output thô (đảo assertion nếu xanh ngay); commit `test(e2e): X-01 admissions to first login`.

---

### Task X-02: Kiểm tra đầu vào → chấm → xếp lớp → HV xác nhận

**Files:** `e2e/flows/x02-placement-assign-confirm.spec.ts`

- [ ] **Step 1:** `test('FR-PLT-01 FR-PLT-03 FR-PLT-04 FR-CLS-06 FR-CLS-07 <mô tả tiếng Việt>')`: tiền điều kiện qua API (staff1 tạo lead + convert, khóa có lớp PLANNED còn chỗ); staff1 UI tạo đợt kiểm tra (giờ `DEMO_TODAY` +1 ngày, GV teacher3) thêm HV; teacher3 (mobile) nhập điểm 6.5 + trình độ → lưu; staff1 mở "Danh sách chờ xếp lớp" thấy HV → "Xếp lớp" chọn lớp → thành công; HV (mobile) trang chủ thấy banner xác nhận lớp, `expectNoHorizontalScroll`, click thật "Xác nhận" → banner biến mất; `apiAs(staff1)` enrollment `status ENROLLED`, `confirmedAt` khác null.
- [ ] **Step 2:** chạy, dán; commit `test(e2e): X-02 placement to class confirmation`.

---

### Task X-03: Tạo lớp → lịch lặp có xung đột → GV thấy lịch

**Files:** `e2e/flows/x03-class-schedule-conflict.spec.ts`

- [ ] **Step 1:** `test('FR-CLS-01 FR-SCH-01 FR-SCH-03 FR-SCH-07 <mô tả tiếng Việt>')`: staff1 tạo lớp `E2E-<runId>` (teacher2, phòng mặc định); "Tạo lịch lặp" chọn đúng thứ/giờ trùng một buổi hiện có của teacher2 → bảng xung đột liệt kê ngày trùng, nút tạo bị chặn; đổi giờ sang khung trống → tạo N buổi (N = số buổi hiển thị trong xem trước); teacher2 mở `/schedule` tuần chứa buổi đầu → thấy `E2E-<runId>`; `apiAs` `GET /sessions?classId=` meta.total = N.
- [ ] **Step 2:** chạy, dán; commit `test(e2e): X-03 class schedule with conflict fix`.

---

### Task X-04: GV 375px điểm danh buổi hôm nay → sửa → HV thấy lịch sử

**Files:** `e2e/flows/x04-mobile-attendance.spec.ts`

**Consumes:** `findTeacherWithUntakenSessionToday()`, `mobile`, `expectNoHorizontalScroll` (Task 0b).

- [ ] **Step 1:** `test.use(mobile)`; `test('FR-ATT-02 FR-ATT-03 FR-ATT-04 <mô tả tiếng Việt>')`: GV đăng nhập → trang chủ "Buổi dạy hôm nay" có `classCode` → "Điểm danh"; `expectNoHorizontalScroll`; "Tất cả có mặt", đổi HV đầu thành "Vắng không phép"; click thật "Lưu điểm danh" (Review Focus 5 — phải `toBeVisible` và không bị bottom nav che: `elementFromPoint` tại tâm nút là chính nút); mở lại → sửa HV đầu thành "Đi muộn" có lý do; HV đó đăng nhập (mobile; mật khẩu `Password1`, mã lấy qua `apiAs(staff1)` roster) → `/me/attendance` thấy buổi hôm nay trạng thái "Đi muộn"; `apiAs(staff1)` bản ghi có `history` 1 mục UNEXCUSED → LATE.
- [ ] **Step 2:** chạy, dán; commit `test(e2e): X-04 mobile attendance today`.

---

### Task X-05: GV tạo bài, nháp, xác nhận → HV xem + tải phiếu điểm

**Files:** `e2e/flows/x05-grades-transcript.spec.ts`

- [ ] **Step 1:** `test('FR-GRD-01 FR-GRD-03 FR-GRD-06 FR-GRD-08 <mô tả tiếng Việt>')`: GV (lớp ONGOING của seed) tạo bài QUIZ trọng số 10 `heldOn = DEMO_TODAY`; nhập điểm một nửa HV → "Lưu nháp"; HV của lớp `/me/results` **không** thấy bài này; GV nhập đủ → "Xác nhận" → hộp xác nhận → OK; HV thấy điểm bài + TB; "Tải phiếu điểm" → `page.waitForEvent('download')`, tên file đuôi `.pdf`, kích thước > 1KB.
- [ ] **Step 2:** chạy, dán; commit `test(e2e): X-05 grades draft confirm and transcript`.

---

### Task X-06: Giảm giá → duyệt → thu 2 lần → PAID → báo cáo tài chính + Excel

**Files:** `e2e/flows/x06-fees-finance-report.spec.ts`

- [ ] **Step 1:** `test('FR-FEE-03 FR-FEE-04 FR-RPT-04 FR-RPT-05 <mô tả tiếng Việt>')`: tiền điều kiện qua API: HV mới được xếp lớp → hóa đơn UNPAID; staff1 đề xuất giảm 10% lý do "Học bổng" → PENDING; manager duyệt → `finalAmount` = `baseFee − Math.round(baseFee*10/100)` hiển thị `formatVnd`; staff1 thu tiền lần 1 (một nửa, CASH) → PARTIAL; lần 2 phần còn lại (BANK_TRANSFER) → PAID, balance "0 ₫"; manager `/reports` tab Tài chính khoảng `DEMO_TODAY..DEMO_TODAY` → "Doanh thu" ≥ tổng 2 lần thu; "Xuất Excel" → download tên `bao-cao-finance-<from>-<to>.xlsx`, 2 byte đầu là `PK` (zip), kích thước > 1KB (nội dung sheet đã được `reports-export.e2e-spec.ts` kiểm).
- [ ] **Step 2:** chạy, dán; commit `test(e2e): X-06 discount payments and finance export`.

---

## Lane L-HARDENING (worktree `../lc-L-HARDENING`)

Security spec chạy bằng `pnpm --filter api test:security -- <pattern>` (dùng `createTestApp`, `loginAs`, factories). Lỗi sản phẩm → `it.failing` + `docs/contract-requests/L-HARDENING-<n>.md`.

### Task H-01A: Route sweep — @Roles, 401, rate limit, helmet, CORS, không lộ hash

**Files:** `apps/api/test/security/routes.security-spec.ts`, `apps/api/test/security/headers.security-spec.ts`

**Consumes:** `listRoutes(app)` (Task 0).

- [ ] **Step 1 (RED/đặc tả):** `describe('NFR-01 FR-AUTH-01 Bảo mật route')`:
  - `listRoutes trả ≥ 90 route` (chống inventory rỗng); `it.each(route không public)('%s có @Roles khác rỗng')`; `route public = đúng tập { POST /auth/login, POST /auth/refresh, GET /health }` (NFR-01).
  - `it.each(route không public)('%s không token → 401 UNAUTHENTICATED')` (thay `:param` bằng ObjectId hợp lệ, body `{}`).
  - `it.each(GET không :param)('%s với ADMIN/MANAGER: body không chứa "passwordHash" | "tokenHash"')`.
  - `POST /auth/login sai mật khẩu 10 lần cùng IP → 401; lần 11 → 429` (LOGIN_RATE_LIMIT mặc định 10; Review Focus 4).
  - headers: `x-content-type-options: nosniff`, `x-frame-options` có mặt, `content-security-policy` có mặt, `x-powered-by` vắng; CORS: `Origin: http://evil.test` → không có `access-control-allow-origin`; `Origin: WEB_ORIGIN` → có, kèm `access-control-allow-credentials: true`.
- [ ] **Step 2:** chạy, dán (đảo một assertion nếu xanh ngay); CR cho route vi phạm.
- [ ] **Step 3:** commit `test(security): route sweep, rate limit and headers`.

---

### Task H-01B: HV không đọc được tài nguyên của HV khác (D35)

**Files:** `apps/api/test/security/student-idor.security-spec.ts`, `apps/api/test/factories/l-hardening.extra.ts`

**Produces:** `seedTwoStudents(conn): { a: StudentWorld; b: StudentWorld }` trong `l-hardening.extra.ts`; `StudentWorld` = `{ token, studentId, userId, enrollmentId, classId, sessionId, assessmentId, invoiceId, paymentId, placementTestId, documentId, notificationId }` — A và B ở hai lớp khác nhau, mỗi người đủ mọi tài nguyên.

- [ ] **Step 1 (RED/đặc tả):** `describe('NFR-01 FR-STU-02 FR-FEE-06 FR-GRD-06 FR-ATT-04 Phạm vi HV')`:
  - `mọi route GET có :param đều có trong PARAM_FIXTURES hoặc NOT_STUDENT_OWNED` (thiếu → fail nêu route; Review Focus 3).
  - `it.each(route GET có :param mà roles chứa STUDENT)('%s với id của chính HV A → 2xx')`.
  - `it.each(mọi route GET có :param)('%s HV A với id của HV B → 403 hoặc 404, không 200')` — gồm `/students/:id`, `/students/:id/documents/:docId`, `/students/:id/audit`, `/invoices/:id`, `/payments/:id/receipt.pdf`, `/classes/:id`, `/classes/:id/students`, `/classes/:id/assessments`, `/sessions/:id`, `/sessions/:id/attendance`, `/assessments/:id/grades`, `/placement-tests/:id`, `/leads/:id`, `/users/:id`.
  - query scope: `GET /invoices?studentId=<B>`, `/results?studentId=<B>`, `/attendance?studentId=<B>` với token A → không chứa dữ liệu B (rỗng hoặc 403).
- [ ] **Step 2:** chạy, dán; CR cho lỗ hổng.
- [ ] **Step 3:** commit `test(security): student cross-access sweep`.

---

### Task H-02: Hiệu năng NFR-02 (D36)

**Files:** `apps/api/test/perf/p95.ts`, `apps/api/test/perf/explain.ts`, `docs/hardening/perf-report.md`

**Interfaces — Produces:**
```ts
// explain.ts
export function captureQueries(fn: () => Promise<unknown>): Promise<CapturedQuery[]>   // mongoose.set('debug', …)
export async function hasCollscan(conn: Connection, q: CapturedQuery): Promise<boolean> // explain('queryPlanner'), duyệt winningPlan đệ quy
export function p95(ms: number[]): number   // phần tử ở vị trí ceil(0.95·n)−1 sau sắp tăng
```

- [ ] **Step 1 (RED):** `apps/api/test/security/perf-helpers.security-spec.ts`: `p95([1..100]) = 95`; `p95([5]) = 5`; `hasCollscan: find trên field không index → true; find theo _id → false`.
- [ ] **Step 2:** chạy → FAIL (dán); GREEN `explain.ts`.
- [ ] **Step 3:** `p95.ts`: DB riêng, seed theo D36, đăng nhập manager, 10 endpoint: `GET /leads`, `/students`, `/students?q=nguyen`, `/classes`, `/sessions?from=<thứ Hai>&to=<CN>`, `/enrollments/waiting`, `/attendance?from=&to=` (30 ngày), `/results?classId=<lớp L-*>`, `/invoices`, `/invoices?overdue=true`; in bảng `endpoint | p50 | p95 | COLLSCAN`; exit 1 nếu p95 ≥ 300 hoặc có COLLSCAN.
- [ ] **Step 4:** chạy `pnpm --filter api perf` (dán bảng). Vi phạm do thiếu index → CR `L-HARDENING-<n>` (index cần thêm, explain trước/sau). Ghi `docs/hardening/perf-report.md` (máy, khối lượng, bảng).
- [ ] **Step 5:** commit `test(perf): NFR-02 p95 and index checks`.

---

### Task H-03: Accessibility 10 màn hình (NFR-06)

**Files:** `e2e/a11y/a11y.spec.ts`, `docs/hardening/a11y-report.md`

**Consumes:** `loginAs`, `test`, `mobile`, `ACCOUNTS`, `findTeacherWithUntakenSessionToday` (Task 0b).

- [ ] **Step 1:** `it.each` 10 màn hình, mỗi cái `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()` → `violations.filter(v => ['serious','critical'].includes(v.impact))` rỗng (in id + target khi fail): `/login`; M `/` (dashboard); S `/admissions/leads`; S `/admissions/leads/new`; S `/students/:id` (HV seed); S `/classes/:id`; S `/fees/invoices/:id`; M `/reports`; T mobile `/sessions/:id/attendance`; H mobile `/` (trang chủ HV). Mỗi màn hình chạy cả light và dark (`page.emulateMedia({ colorScheme: 'dark' })`) — tương phản AA.
- [ ] **Step 2:** `pnpm e2e a11y` dán output; vi phạm ở feature → `test.fail(true,'CR L-HARDENING-<n>')` + CR (rule id, selector, đề xuất); ghi `docs/hardening/a11y-report.md`.
- [ ] **Step 3:** commit `test(a11y): axe on 10 main screens`.

---

### Task H-04: Tài liệu — README + OpenAPI `/api/docs` (D33)

**Files:** `apps/api/src/openapi/{setup-openapi,build-document}.ts`, `apps/api/test/security/openapi.security-spec.ts`, `README.md`, `docs/DECISIONS.md` (chỉ mục `## Wave 4 hardening notes`)

**Interfaces — Produces:** `buildOpenApiDocument(routes: RouteInfo[]): OpenAPIObject` (OpenApiGeneratorV3, `extendZodWithOpenApi(z)` chỉ trong module này); `setupOpenApi` mount `SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs-json' })` khi `env.NODE_ENV !== 'production'`.

- [ ] **Step 1 (RED):** `describe('H-04 OpenAPI')`: `GET /api/docs-json 200 không cần token, openapi "3.0.x"`; `mọi route của listRoutes có paths['/api/v1'+path][method]` (`:id` → `{id}`); `POST /api/v1/auth/login requestBody có properties username, password`; `GET /api/v1/students có parameters q, page, limit từ ListStudentsQuery`; `route không public có security bearer và x-roles = roles`; `NODE_ENV=production → /api/docs và /api/docs-json 404`.
- [ ] **Step 2:** chạy → FAIL (dán); GREEN.
- [ ] **Step 3:** README viết lại: cài đặt; chạy dev không Docker; tài khoản seed demo (bảng username/vai trò, `Password1`) + ngày demo 2026-11-02 và `APP_CLOCK_START` (D30, chỉ dev/e2e); `seed:large` + `pnpm --filter api perf`; `pnpm e2e` (D29, Chrome hệ thống); `pnpm test:security`, `pnpm coverage`; `/api/docs`; `pnpm --filter api migrate:class-history` (L-01). Ghi chú hardening vào `## Wave 4 hardening notes`.
- [ ] **Step 4:** commit `feat(api): openapi docs from zod contracts` và `docs: wave 4 README`.

---

## Lane L-LEAD (worktree `../lc-L-LEAD`, Lead)

Không đụng `e2e/**`, `apps/api/test/{security,perf}/**`, `apps/api/src/openapi/**`, `README.md`, `docs/hardening/**`. Bỏ qua (không có tác động người dùng): R-03 literal `'sessions'` trong `$lookup` + gộp `$facet`; `presetRange` mỗi render; trend `$match` không cận trên; L-01 query grades thiếu `enrollmentId`/O(classes×assessments); results/invoices limit 100 và roster cap 100 (`maxCapacity ≤ 100`, một HV không có >100 hóa đơn); seed-large missing-actor chưa test; `Timeline.drain` O(n² log n); duplicated weekday helper; minor W2 đã triage hết ở W3.

### Task L-01: classHistory backfill + phạm vi HV của GV (W2 hardening, D38)

**Files:** `apps/api/scripts/migrate-class-history.ts` (+ script `migrate:class-history`), `apps/api/src/common/scope/scope.service.ts`; test `apps/api/test/e2e/hardening-class-history.e2e-spec.ts`

**Produces:** `runMigrateClassHistory(conn: Connection): Promise<{ scanned: number; updated: number }>`

- [ ] **Step 1 (RED):** `describe('FR-CLS-12 R22 backfill classHistory')`: `enrollment có classId, classHistory [] → sau migrate chứa classId`; `mục history to ENROLLED/TRANSFERRED có classId → classId vào classHistory`; `chạy lại → updated 0` (idempotent); `HV đã chuyển lớp (dữ liệu kiểu cũ) sau migrate vẫn xem /results lớp cũ`. `describe('FR-STU-01 D38 GV thấy HV đã chuyển khỏi lớp mình')`: `GV lớp cũ GET /students/:id HV đã chuyển → 200`; `GV không liên quan → 404`; `GET /students của GV lớp cũ có HV đó`.
- [ ] **Step 2–4:** RED → GREEN (`$addToSet` theo lô 1000, không đổi `updatedAt` qua `timestamps: false`) → commit `feat(scope): classHistory backfill and history-aware teacher student scope`.

---

### Task L-02: Báo cáo API — mục W3 để lại (D39)

**Files:** `apps/api/src/modules/reports/{academic-report,admissions-report,export}.service.ts`; tests `apps/api/test/e2e/reports-{academic,admissions,export}.e2e-spec.ts` (thêm case)

- [ ] **Step 1 (RED):** `FR-RPT-03 lớp kết thúc trước from không có trong rows; lớp bắt đầu sau to không có; lớp chồng một ngày có`; `FR-RPT-01 hồ sơ không có khóa → hàng key 'none' nhãn "Khác"; Σ rows.newProfiles = totals.newProfiles`; `FR-RPT-05 pdf tài chính chứa "1.500.000 ₫" (formatVnd) không chứa "1500000"`; `pdf rỗng có đủ mọi header của loại báo cáo + "Không có dữ liệu"`.
- [ ] **Step 2–4:** RED → GREEN → commit `fix(reports): academic class window, admissions 'none' row, pdf money and headers`.

---

### Task L-03: Báo cáo + Dashboard FE — mục W3 để lại

**Files:** `apps/web/src/features/reports/**`, `apps/web/src/features/dashboard/**` (+ `__tests__`), token màu biểu đồ trong `apps/web/src/index.css` (`--chart-1..5`, light + dark theo DESIGN §1)

- [ ] **Step 1 (RED):** `FR-RPT-03 tab Học tập có bộ lọc GV → gửi teacherId`; `FR-RPT-02 lọc lớp → classId`; `FR-RPT-04 chọn nhóm "Theo khóa" → groupBy=course`; `FR-RPT-05 xuất Excel tab Chuyên cần → reports/attendance/export?format=xlsx…`; `lỗi 500 → thông báo lỗi + nút "Thử lại" gọi lại`; `to < from → lỗi tại trường "Đến ngày", không gửi request`; `TEACHER vào /reports → chuyển về /`; `thẻ "Quá hạn" có chú thích "trên hóa đơn tạo trong khoảng"`; `series biểu đồ (reports + dashboard trend) dùng fill/stroke "var(--chart-N)", không có mã hex`.
- [ ] **Step 2–4:** RED → GREEN → commit `fix(web): report filters, guards, chart tokens`.

---

### Task L-04: Cổng GV/HV + ma trận điểm danh — mục W3 để lại

**Files:** `apps/web/src/lib/use-vn-today.ts` (+ test), `apps/web/src/features/home/**`, `apps/web/src/features/attendance/components/class-attendance-tab.tsx` (+ tests)

**Produces:** `useVnToday(): string` — ngày VN hiện tại, tự cập nhật khi qua 00:00 VN (một `setTimeout` tới nửa đêm VN kế tiếp, dọn khi unmount).

- [ ] **Step 1 (RED):** `useVnToday đổi từ "2026-11-02" sang "2026-11-03" khi fake timer qua 17:00Z` (= 00:00 VN); `trang chủ GV mở lúc 23:59 VN, qua nửa đêm → gọi lại /sessions?from=<ngày mới>`; `trang chủ HV tương tự cho "buổi học tiếp theo"`; `FR-ATT-04 roster GET /classes/:id/students lỗi → ma trận vẫn hiện từ bản ghi điểm danh + cảnh báo "Không tải được danh sách lớp" có nút Thử lại`.
- [ ] **Step 2–4:** RED → GREEN → commit `fix(web): midnight rollover for portal and resilient attendance matrix`.

---

### Task L-05: FR coverage = 0 thiếu (D37)

**Files:** mọi test có mã FR viết gộp (23 tiêu đề, liệt kê bằng lệnh Step 1), `apps/api/test/e2e/audit-coverage.e2e-spec.ts`

5 FR thiếu và nơi phủ: **FR-ADM-08** → `admissions-leads.e2e-spec.ts` (tiêu đề `FR-ADM-01 FR-ADM-02 FR-ADM-08`); **FR-CLS-02**, **FR-CLS-03** → `classes.e2e-spec.ts` (`FR-CLS-01 FR-CLS-02 FR-CLS-03`); **FR-STU-04** → `admissions-students-update.e2e-spec.ts` (`FR-STU-03 FR-STU-04 FR-ADM-06`); **FR-AUD-01** → test mới.

- [ ] **Step 1:** `grep -rnE "FR-[A-Z]+-[0-9]+([/.]{1,2}[0-9]+)+" apps packages --include='*.ts' --include='*.tsx' | grep -v node_modules` → đổi mỗi chuỗi gộp thành mã rời (chỉ tiêu đề, không đổi assertion; range `07..12` mở thành từng mã **chỉ khi** describe đó có test cho mã đó — nếu không, bỏ mã khỏi tiêu đề).
- [ ] **Step 2 (RED):** `describe('FR-AUD-01 Audit log cho mọi thao tác ghi')` `it.each` 6 vùng: hồ sơ `PATCH /students/:id` → entity `student`; lớp `PATCH /classes/:id` → `class`; lịch `PATCH /sessions/:id` và `POST /sessions/:id/cancel` → `Models.Session` (`'Session'`); điểm danh `PUT /sessions/:id/attendance` → `attendance`; điểm `PUT /assessments/:id/grades` (confirm) → `grade`; học phí `POST /invoices/:id/payments` → `payment` và `POST /invoices/:id/discount` → `invoice`; mỗi case: ít nhất một dòng `audit_logs` mới với `entityId`, `actorId` = người gọi, `actorRole`, `action`, `after` khác null.
- [ ] **Step 3:** chạy → vùng thiếu audit (nếu có) FAIL đúng lý do (dán) → GREEN trong service sở hữu.
- [ ] **Step 4:** `bash scripts/fr-coverage.sh --strict` → `FR coverage: 68/68 covered`, exit 0; grep Step 1 rỗng; `merge-gate.sh` thêm `bash scripts/fr-coverage.sh --strict`; commit `test: explicit FR ids and FR-AUD-01 audit coverage`.

---

### Task L-06: Coverage NFR-07 (D34)

**Files:** `apps/api/jest-coverage.config.ts`, `apps/api/package.json` (`test:coverage`), `apps/web/vite.config.ts`, `apps/web/package.json` (`test:coverage`), test bù trong module/feature thiếu

- [ ] **Step 1 (RED):** cấu hình ngưỡng theo D34; chạy `pnpm coverage` → in % dòng hiện tại; nếu dưới ngưỡng → FAIL "coverage threshold for lines (85%) not met" (dán).
- [ ] **Step 2:** liệt kê 10 file thấp nhất mỗi app (`coverage/coverage-summary.json`); viết test hành vi (có mã FR) cho nhánh chưa phủ — ưu tiên nhánh lỗi/phân quyền; không test file sinh/hằng số, không `/* istanbul ignore */` trừ code không thể đạt (ghi lý do).
- [ ] **Step 3:** `pnpm coverage` xanh, dán bảng tổng; commit `test: reach NFR-07 coverage thresholds`.

---

### Task L-07: Contract request từ L-E2E / L-HARDENING

**Files:** theo từng CR; test tái hiện trong lane sở hữu cũ (`apps/api/test/e2e/<module>-*.e2e-spec.ts`, `apps/web/src/features/<m>/__tests__/`), index trong `apps/api/src/database/schemas/` + `indexes.e2e-spec.ts`

- [ ] **Step 1:** đọc CR từ nhánh lane: `git show lane/L-E2E:docs/contract-requests/L-E2E-<n>.md` (và L-HARDENING) khi lane báo; mỗi CR: test tái hiện ở tầng thấp nhất (API e2e / RTL) RED (dán) → GREEN → commit `fix(<m>): <CR id> …`. Index cho COLLSCAN: test `indexes.e2e-spec.ts` khẳng định index tồn tại + explain không COLLSCAN.
- [ ] **Step 2:** ghi vào CR dòng "Fixed in lane/L-LEAD <sha>"; danh sách `test.fail`/`it.failing` cần bỏ ở Task M.

---

### Task M: Lead — merge & merge gate cuối, tag `w4`

**Files:** mọi đường dẫn cần cho merge; `TASK.md`; `docs/DECISIONS.md`; `docs/superpowers/wave4-ledger.md`

- [ ] **Step 1:** `bash scripts/merge-gate.sh L-E2E --ownership-only`, `… L-HARDENING --ownership-only`; L-LEAD kiểm tay không đụng file D32 của hai lane.
- [ ] **Step 2:** merge `--no-ff` L-LEAD → L-HARDENING → L-E2E; sau mỗi merge `pnpm test && pnpm test:e2e && pnpm test:security`.
- [ ] **Step 3:** CR còn lại (L-07) → fix TDD; bỏ mọi `test.fail(true,'CR …')`/`it.failing` đã được sửa (test phải xanh thật); `grep -rn "test.fail(\|it.failing" e2e apps/api/test` rỗng.
- [ ] **Step 4:** merge gate cuối (một lượt, không song song): `bash scripts/merge-gate.sh` (install/lint/typecheck/test/e2e/security/fr-coverage --strict) `&& pnpm coverage && bash scripts/__tests__/merge-gate.test.sh && pnpm e2e` → exit 0; `pnpm --filter api perf` → p95 < 300ms mọi endpoint, 0 COLLSCAN. Dán số: shared/api unit/web/api e2e/security/playwright, % coverage api & web, `68/68`.
- [ ] **Step 5:** smoke tay (Chrome hệ thống, build thật sau `rm -rf apps/api/dist apps/web/dist`, `APP_CLOCK_START`): `/api/docs` mở được; dark mode biểu đồ báo cáo; HV đăng nhập email; GV 375 trang chủ → điểm danh. Không 5xx.
- [ ] **Step 6:** final review (opus, `w3..HEAD`) → một fix wave → re-review → full chain Step 4 → tick TASK.md W4 (X-01..X-06, H-01..H-04, merge gate cuối) → `git tag w4` → push `main` + tag → xóa worktree; ghi `docs/superpowers/wave4-ledger.md`.
