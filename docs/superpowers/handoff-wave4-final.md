# Handoff: Wave 4 gần xong — chỉ còn bước đóng wave (dừng 2026-11-02 theo yêu cầu người dùng)

Người dùng viết tiếng Việt; trả lời tiếng Việt, ngắn. **Full chain xanh → tự tag và push, không cần hỏi.**

## Trạng thái
- `main` = `3325b65` (local, **chưa push** từ `1025ac7`/w3). Chứa: plan W4, Task 0/0b, merge 3 lane (`5b3cd7b` L-LEAD, `db51bfd` L-HARDENING, `67f33e0` L-E2E), Task M carry-overs (`8945ce9`, `cc3288e`), final fix wave (`e1da298`, `71fbad2`, `3325b65`).
- Mọi task W4 (0, 0b, X-01..06, H-01A/B, H-02..04, L-01..07, M) đã review sạch. Final review (opus) → 1 Important (NODE_ENV fail-open) + minors → đã sửa trong final fix wave → re-review sạch.
- Gate do Task M chạy trên `cc3288e`: shared 103, api unit 56, web 531, api e2e 942, security 311, fr 68/68, coverage api 98.89% / web 95.33%, `pnpm e2e` 34/34 ×2, perf p95 ≤ 19.3ms 0 COLLSCAN. Fix wave báo gate xanh trên `3325b65` (security 319, web 534, e2e 942, `pnpm e2e` 34). **Controller chưa tự xác minh lại trên `3325b65`** (lượt chạy bị dừng giữa chừng).
- Ledger SDD (git-ignored): `.superpowers/sdd/2026-11-02-wave4-hardening-e2e/progress.md`; bản sao: `docs/superpowers/wave4-ledger-midway.md` (rulings R1–R15, deferred minors + triage).
- Đã soạn sẵn (chưa commit): `docs/superpowers/handoff-post-w4.md` (handoff sau W4, dùng khi đóng wave).
- Worktree còn: `../lc-L-E2E`, `../lc-L-HARDENING`, `../lc-L-LEAD` (đã merge, sạch). Tiến trình jest treo cũ pid 9346 (trong lc-L-LEAD, CPU 0%) — người dùng quyết định có kill không.

## Việc còn lại (theo thứ tự)
1. `export PATH=/opt/homebrew/bin:$PATH`; chạy lại gate trên main dưới `caffeinate -i`: `pnpm --filter @lc/shared build && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:security && bash scripts/__tests__/merge-gate.test.sh && bash scripts/fr-coverage.sh --strict` (+ tùy chọn `pnpm coverage`, `pnpm e2e`).
2. Xanh → tick TASK.md W4 (dòng 205–217, `[~]` → `[x]`), `cp` ledger SDD → `docs/superpowers/wave4-ledger.md` (thêm dòng gate cuối), xóa `wave4-ledger-midway.md` và file handoff này, commit cùng `handoff-post-w4.md` (`git -c user.name=huybin2305 -c user.email=huybin2305@gmail.com`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
3. `git tag w4 && git push origin main && git push origin w4`; `git worktree remove` 3 worktree; `rm -rf .superpowers/sdd/2026-11-02-wave4-hardening-e2e`; cập nhật memory `language-center-wave-status`.
4. Báo người dùng danh sách "Rulings I made" R1–R15 (lấy từ ledger, mỗi cái kèm chi phí nếu sai).

## Ghi chú môi trường
- Bọc mọi lần chạy dài bằng `caffeinate -i` (máy Mac tự ngủ → jest timeout 0% CPU).
- `rm -rf apps/api/dist apps/web/dist` trước build thật; `pnpm e2e` dùng cổng cố định 27027/3100/4173.
