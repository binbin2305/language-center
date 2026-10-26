# Language Center

Hệ thống quản lý trung tâm ngoại ngữ (monorepo pnpm): `apps/api` (NestJS 11 + Mongoose), `apps/web` (React 18 + Vite), `packages/shared` (`@lc/shared`: zod contract, enum, quyền).

Tài liệu gốc: `PRD.md`, `ARCHITECTURE.md`, `BACKEND_SCHEMA.md`, `DESIGN.md`, `RULES.md`, `TASK.md`. Quyết định bổ sung: `docs/DECISIONS.md`.

## Cài đặt

- Node >= 22 (CI dùng Node 26), pnpm 9 (`npm i -g pnpm@9`).
- macOS + Homebrew: node có thể không nằm trong PATH mặc định, chạy `export PATH=/opt/homebrew/bin:$PATH` trước các lệnh.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # đổi JWT secret (>= 32 ký tự)
```

## Lệnh

| Lệnh | Việc |
|---|---|
| `pnpm dev` | chạy api + web song song |
| `pnpm build` | build shared rồi các app |
| `pnpm lint` / `pnpm typecheck` | ESLint (0 warning) / tsc mọi package |
| `pnpm test` | unit test (Jest, Vitest) |
| `pnpm test:e2e` | e2e API (supertest + mongodb-memory-server, không cần Docker) |
| `pnpm test:scripts` | test script swarm (`scripts/__tests__`) |
| `scripts/fr-coverage.sh [--strict]` | FR trong PRD chưa có test nào nhắc tới |

## Chạy dev không cần Docker

```bash
pnpm --filter api dev:mongo     # MongoMemoryReplSet bền vững, dữ liệu ở .mongo-data/
```

Lệnh in `MONGODB_URI=...`; dán vào `apps/api/.env`. Giữ terminal đó chạy, rồi `pnpm dev` ở terminal khác. (Có Docker thì dùng `docker compose up -d` với `docker-compose.yml`: mongo 7 replica set `rs0`.)

## Tài khoản admin đầu tiên (seed)

Đặt `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD` (đủ mạnh theo chính sách mật khẩu) trong `apps/api/.env`, rồi:

```bash
pnpm --filter api seed
```

Tạo ADMIN nếu chưa tồn tại; đăng nhập lần đầu bắt buộc đổi mật khẩu. Chạy lại an toàn (idempotent).

## Quy trình swarm

Chi tiết: `TASK.md` (wave/lane, test viết trước) và `RULES.md` §2 (quyền sở hữu file).

1. Lead hoàn tất Wave 0 (nền móng, hợp đồng, auth, khung FE).
2. Mỗi lane: `scripts/lane-start.sh <lane>` (vd `L-CLASSES`) tạo worktree `../lc-<lane>` trên nhánh `lane/<lane>`.
3. Lane chỉ sửa file thuộc phần "Sở hữu" (`scripts/lane-owners.json`) cộng `TASK.md`, `docs/DECISIONS.md`, `docs/QUESTIONS.md`, `docs/contract-requests/**`. Cần đổi hợp đồng/dependency: viết `docs/contract-requests/<lane>-<n>.md`.
4. Trước khi báo xong: rebase lên `main`, chạy `scripts/merge-gate.sh <lane>` (ownership + install/lint/typecheck/test/e2e). Chỉ kiểm tra ownership: `scripts/merge-gate.sh <lane> --ownership-only` (đổi nhánh gốc bằng `MERGE_BASE`).
5. Lead review và merge; wave kế tiếp bắt đầu khi merge gate xanh.
