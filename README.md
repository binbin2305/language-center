# Language Center

Hệ thống quản lý trung tâm ngoại ngữ (monorepo pnpm): `apps/api` (NestJS 11 + Mongoose), `apps/web` (React 18 + Vite), `packages/shared` (`@lc/shared`: zod contract, enum, quyền).

Tài liệu gốc: `PRD.md`, `ARCHITECTURE.md`, `BACKEND_SCHEMA.md`, `DESIGN.md`, `RULES.md`, `TASK.md`. Quyết định bổ sung: `docs/DECISIONS.md`.

## Cài đặt

- Node >= 22 (CI dùng Node 26), pnpm 9 (`npm i -g pnpm@9`).
- macOS + Homebrew: node có thể không nằm trong PATH mặc định, chạy `export PATH=/opt/homebrew/bin:$PATH` trước các lệnh.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # đổi JWT_ACCESS_SECRET (>= 32 ký tự)
```

`pnpm install` tự build `packages/shared` (script `prepare`). Dev, typecheck và test đọc `@lc/shared` thẳng từ `packages/shared/src`; chỉ bản build API (`pnpm --filter api build`) dùng `dist`.

## Lệnh

| Lệnh | Việc |
|---|---|
| `pnpm dev` | chạy api + web song song |
| `pnpm build` | build shared rồi các app |
| `pnpm lint` / `pnpm typecheck` | ESLint (0 warning) / tsc mọi package |
| `pnpm test` | unit test (Jest, Vitest) |
| `pnpm test:e2e` | e2e API (supertest + mongodb-memory-server, không cần Docker) |
| `pnpm test:scripts` | test script swarm (`scripts/__tests__`) |
| `pnpm test:security` | sweep bảo mật API (`apps/api/test/security`: phân quyền theo route, IDOR HV, header, rate limit, OpenAPI) |
| `pnpm coverage` | coverage dòng: api `src/modules/**` >= 85%, web `src/features/**` >= 75% (NFR-07); báo cáo ở `coverage/` (git-ignored) |
| `pnpm e2e` | Playwright E2E trên bản build thật (xem "E2E" bên dưới) |
| `pnpm --filter api perf` | đo p95 các endpoint chính trên dữ liệu lớn (NFR-02, xem "Hiệu năng") |
| `pnpm --filter api migrate:class-history` | điền `classHistory` cho ghi danh cũ (chạy một lần sau khi nâng cấp từ bản trước W2) |
| `pnpm --filter api migrate:attendance-start-at` | điền `attendance.startAt` cho điểm danh cũ (R12): **bước trước khi mở traffic** khi nâng cấp lên W4, chạy ngay sau deploy lúc ít truy cập (quét mỗi dòng điểm danh một lần, theo lô, chạy lại an toàn). Chưa chạy thì điểm danh cũ không xuất hiện trong `GET /attendance?from/to` và `/attendance/summary?from/to` |
| `scripts/fr-coverage.sh [--strict]` | FR trong PRD chưa có test nào nhắc tới |

## Chạy dev không cần Docker

```bash
pnpm --filter api dev:mongo     # MongoMemoryReplSet bền vững, dữ liệu ở .mongo-data/
```

Cổng mặc định 27017; đổi bằng `MONGO_DEV_PORT=27018 pnpm --filter api dev:mongo` (để trống cũng dùng 27017). Lệnh in `MONGODB_URI=...`; dán vào `apps/api/.env`. Giữ terminal đó chạy, rồi `pnpm dev` ở terminal khác. (Có Docker thì dùng `docker compose up -d` với `docker-compose.yml`: mongo 7 replica set `rs0`.)

## Chạy sau reverse proxy

Đặt `TRUST_PROXY` trong `apps/api/.env` (mặc định `false`) để Express lấy IP client từ `X-Forwarded-For` — cần cho giới hạn tần suất đăng nhập theo IP. Giá trị: `true`/`false`, số proxy tin cậy (vd. `1`, nên dùng), hoặc danh sách địa chỉ/subnet (vd. `loopback, 10.0.0.0/8`). Đừng đặt `true` nếu API nhận request trực tiếp từ Internet: client có thể giả mạo IP.

## Tài khoản admin đầu tiên (seed)

Đặt `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD` (đủ mạnh theo chính sách mật khẩu) trong `apps/api/.env`, rồi:

```bash
pnpm --filter api seed
```

Tạo ADMIN nếu chưa tồn tại; đăng nhập lần đầu bắt buộc đổi mật khẩu. Chạy lại an toàn (idempotent).

## Đồng hồ demo (`APP_CLOCK_START`)

Dữ liệu demo kết thúc ở ngày **2026-11-02** (thứ Hai). Để API coi "hôm nay" là ngày đó, đặt `APP_CLOCK_START` (ISO-8601 có offset, vd. `2026-11-02T13:00:00Z` = 20:00 giờ VN) trong `apps/api/.env`: thời gian vẫn chạy tiếp từ mốc này. Chỉ dành cho dev/e2e: khi `NODE_ENV=production` biến này bị bỏ qua (dùng giờ hệ thống, có cảnh báo log).

## E2E (Playwright)

```bash
caffeinate -i pnpm e2e
```

`e2e/run.sh` tự dựng mọi thứ, không cần Docker: Mongo tạm (MongoMemoryReplSet, cổng 27027, thư mục dữ liệu mới mỗi lần chạy và xóa khi xong) -> `seed:demo --reset` -> xóa `apps/api/dist` và `apps/web/dist` -> build thật -> api (cổng 3100) + `vite preview` (cổng 4173) -> Playwright dùng Chrome cài sẵn trên máy (`channel: 'chrome'`, không tải browser). Không chạy hai lần `pnpm e2e` cùng lúc (cổng cố định). Spec nằm ở `e2e/flows/`; kiểm tra truy cập (axe) ở `e2e/a11y/`.

## Tài liệu API (OpenAPI)

Khi chạy ngoài production, API phục vụ Swagger UI tại `http://localhost:3000/api/docs` và JSON tại `/api/docs-json` (không cần token). Tài liệu được sinh tự động từ danh sách route Nest và schema zod của `@lc/shared` (body, query, path param), mỗi route ghi `x-roles` và yêu cầu bearer token trừ route public (login, refresh, health). Khi `NODE_ENV=production` cả hai đường dẫn trả 404.

## Hiệu năng (NFR-02)

```bash
caffeinate -i pnpm --filter api perf
```

Dựng DB riêng, seed demo cộng `seed:large` (10.000 HV, 500 lớp, 50.000 buổi), đo p95 của các endpoint chính (mục tiêu < 300 ms) và kiểm tra query không COLLSCAN; kết quả ghi ở `docs/hardening/perf-report.md`.

## Ghi chú vận hành

- macOS tự ngủ khi rảnh và làm test/build dài treo giữa chừng (jest đứng 0% CPU): bọc lệnh dài (`pnpm test`, `pnpm test:e2e`, `pnpm e2e`, `pnpm coverage`, `pnpm build`, perf) bằng `caffeinate -i`.
- Trước khi build thật để chạy: `rm -rf apps/api/dist apps/web/dist` (tsbuildinfo cũ có thể làm bản build lỗi 500).

## Quy trình swarm

Chi tiết: `TASK.md` (wave/lane, test viết trước) và `RULES.md` §2 (quyền sở hữu file).

1. Lead hoàn tất Wave 0 (nền móng, hợp đồng, auth, khung FE).
2. Mỗi lane: `scripts/lane-start.sh <lane>` (vd `L-CLASSES`) tạo worktree `../lc-<lane>` trên nhánh `lane/<lane>`.
3. Lane chỉ sửa file thuộc phần "Sở hữu" (`scripts/lane-owners.json`) cộng factory bổ sung `apps/api/test/factories/<lane-id viết thường>.extra.ts` (chuẩn: `l-classes.extra.ts`; chấp nhận cả `classes.extra.ts`) cộng `TASK.md`, `docs/DECISIONS.md`, `docs/QUESTIONS.md`, `docs/contract-requests/**`. Cần đổi hợp đồng/dependency: viết `docs/contract-requests/<lane>-<n>.md`.
4. Trước khi báo xong: rebase lên `main`, chạy `scripts/merge-gate.sh <lane>` (ownership + install/lint/typecheck/test/e2e). Chỉ kiểm tra ownership: `scripts/merge-gate.sh <lane> --ownership-only` (đổi nhánh gốc bằng `MERGE_BASE`).
5. Lead review và merge; wave kế tiếp bắt đầu khi merge gate xanh.

## Dữ liệu demo (chỉ dùng cho dev)

```bash
pnpm --filter api seed:demo          # tạo nếu chưa có
pnpm --filter api seed:demo --reset  # xóa dữ liệu (giữ tài khoản ADMIN) rồi tạo lại
```

Seed chạy qua service thật (Nest application context, đồng hồ được điều khiển đi từ 06/2026 tới ngày demo **2026-11-02**, thứ Hai): lead → chuyển hồ sơ → kiểm tra đầu vào → xếp lớp (có `classHistory`, history gắn lớp, hóa đơn qua InvoiceCreator) → lịch theo tuần → điểm danh, điểm, thu tiền. Chỉ mật khẩu demo được ghi thẳng.

Mật khẩu chung `Password1`: `manager@center.local`, `staff1@center.local`, `staff2@center.local`, `teacher1..5@center.local`, học viên `HV202600001`…`HV202600060`; nếu DB chưa có ADMIN, seed tạo `admin@center.local` (cũng `Password1`). Gồm 3 khóa, 6 phòng, 8 lớp (5 đang học, 1 chờ mở, 1 tạm ngưng, 1 đã kết thúc), lịch 8 tuần cho lớp đang học (4 tuần đã điểm danh, 1 buổi bị hủy), 2 bài đã công bố điểm mỗi lớp đang học, hóa đơn chưa thu / thu một phần / đã thu / quá hạn, HV chờ xếp lớp và 1 đợt kiểm tra đầu vào sắp tới, 15 lead đang theo dõi.

Dữ liệu lớn (NFR-02, chèn thô nhưng đủ field W2):

```bash
SEED_STUDENTS=5000 SEED_CLASSES=200 pnpm --filter api seed:large   # mặc định 5000 / 200; lớp mã L-xxxx, HV mã HVLxxxxxx; thêm SEED_SESSIONS_PER_CLASS=N để sinh N buổi mỗi lớp
```

Học viên đăng nhập bằng mã HV hoặc bằng email hồ sơ (không phân biệt hoa/thường). Nếu nhiều HV dùng chung một email (vd. email phụ huynh), đăng nhập bằng email bị từ chối (401) — dùng mã HV. Nhân viên đăng nhập bằng email như cũ.
