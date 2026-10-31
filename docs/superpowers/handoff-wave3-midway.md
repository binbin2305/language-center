# Handoff: Wave 3 đang chạy giữa chừng (dừng 2026-11-01 theo yêu cầu người dùng)

Đọc `handoff-wave3.md` (cách làm việc, môi trường) rồi file này. Người dùng viết tiếng Việt, muốn chạy liên tục theo SDD (subagent-driven-development), swarm song song, TDD.

## Nguồn sự thật
- Plan: `docs/superpowers/plans/2026-11-01-wave3-reports-portal-integration.md` (đã được duyệt).
- Ledger SDD (git-ignored, **đọc trước**): `/Users/huybin2305/language-center/.superpowers/sdd/2026-11-01-wave3-reports-portal-integration/progress.md` — rulings R1–R2 của W3, minors deferred từng task, Task M notes. Bản sao lúc dừng: `docs/superpowers/wave3-ledger-midway.md`.
- Cùng thư mục SDD: `brief.sh <ID>` (tạo brief = header plan + lane intro + task), `common-implementer.md`, `common-reviewer.md`, `common-re-reviewer.md`, các `task-*-report.md`. Script SDD: `~/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/subagent-driven-development/scripts/{sdd-workspace,review-package}`.

## Trạng thái
- `main` = `0f9951b` (Task 0 W3 xong + review sạch). **Chưa push** các commit sau `dba8879` (plan W3 `2ca886c`, Task 0 `370c6f6`, `0f9951b`).
- Worktree/nhánh (đều từ `0f9951b`):
  | Nhánh | Worktree | HEAD | Xong | Còn lại |
  |---|---|---|---|---|
  | `lane/L-REPORTS` | `/Users/huybin2305/lc-L-REPORTS` | `59d5c60` | R-01, R-02, R-03, R-04 (review sạch) | **R-05 dở** (xem dưới), R-06 |
  | `lane/L-STUDENT-PORTAL` | `/Users/huybin2305/lc-L-STUDENT-PORTAL` | `96dfe23` | P-01, P-02 (review sạch) — lane xong | — |
  | `lane/L-LEAD` | `/Users/huybin2305/lc-L-LEAD` | `4ddaee0` | L-01, L-02, L-03 (review sạch) | **L-04 dở** (xem dưới), L-05 |
- **WIP chưa commit (agent bị dừng giữa chừng):**
  - L-REPORTS / R-05 (FE báo cáo): sửa `apps/web/src/features/reports/pages/reports-page.tsx`, `apps/web/test/msw/reports.handlers.ts`; mới `features/reports/{__tests__/,api.ts,components/,hooks.ts,range.ts}`. Chưa rõ đã qua RED/GREEN chưa → phiên mới: `git -C ../lc-L-REPORTS status`, chạy `pnpm --filter web test -- features/reports`, rồi dispatch implementer R-05 mới với brief `task-R-05-brief.md` + báo cáo `task-R-05-report.md` (nếu có) và chỉ dẫn "tiếp tục từ WIP hiện có, phải có RED thô". Nếu WIP rối → `git -C ../lc-L-REPORTS checkout -- . && git clean -fd apps/web/src/features/reports` rồi làm lại.
  - L-LEAD / L-04 (seed qua service): sửa `apps/api/scripts/seed-demo.ts`; mới `apps/api/scripts/seed-large.ts`, `apps/api/test/e2e/seed-demo.e2e-spec.ts`. Agent dừng ngay trước khi chạy RED (test đã viết, script chưa export `runSeedDemo`). Phiên mới: dispatch lại L-04 (opus) với brief `task-L-04-brief.md` và context trong ledger.
- Dev servers (mongod :27017, api :3000, vite :5173) có thể vẫn chạy từ phiên trước; dev DB đang chứa dữ liệu smoke.

## Việc tiếp theo (theo plan)
1. Hoàn tất R-05 → review; R-06 (FE dashboard) → review. Lane L-REPORTS xong.
2. Hoàn tất L-04 → review; L-05 (bộ lọc /results theo khóa/HV, ma trận điểm danh theo roster) → review. Nhánh L-LEAD xong. Mang vào L-05: minors L-03 (assert mạnh hơn cho case 8/4, sửa comment case 3).
3. Task M (opus): ownership gate REPORTS/PORTAL, kiểm tay L-LEAD không đụng `modules/reports`, `features/{reports,dashboard,home}` (trừ `home-router.tsx`); merge `--no-ff` LEAD → REPORTS → PORTAL; xử lý contract requests `docs/contract-requests/L-STUDENT-PORTAL-1.md` (result-cards: bọc bảng `overflow-x-auto`, nút "Tải phiếu điểm PDF" h-8 → ≥44px) và `-2.md` (confirm-class-banner `size="sm"`; session-detail-sheet nút "Điểm danh" h-9) rồi bỏ 4 `it.fails` trong `features/home/__tests__/mobile-375.test.tsx`; full chain; `seed:demo --reset` + smoke; final review → một fix wave → re-review → tick TASK.md W3 → tag `w3` → push → ghi `wave3-ledger.md` + `handoff-wave4.md`.

## Ghi chú quan trọng cho phiên mới
- Mỗi phiên: `export PATH=/opt/homebrew/bin:$PATH`. Commit với `git -c user.name=huybin2305 -c user.email=huybin2305@gmail.com`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Implementer hay quên dán RED thô → nhắc trong dispatch ngay từ đầu.
- Quyết định W3 đã chốt nằm trong plan (D22–D28) và `docs/DECISIONS.md`.
