# RULES — Luật bắt buộc cho mọi agent

Đọc file này trước khi viết bất kỳ dòng code nào. Vi phạm luật = task chưa xong.

## 0. Thứ tự đọc tài liệu
1. RULES.md (file này) → 2. TASK.md (task của bạn + dependency) → 3. PRD.md (các FR của task) → 4. BACKEND_SCHEMA.md / DESIGN.md (phần liên quan) → 5. ARCHITECTURE.md khi cần.
Tài liệu mâu thuẫn nhau → thứ tự ưu tiên: PRD > BACKEND_SCHEMA > DESIGN > ARCHITECTURE. Ghi mâu thuẫn vào `docs/QUESTIONS.md`.

## 1. TDD — không có ngoại lệ

Chu trình cho **mỗi** hành vi:
1. **RED** — viết một test mô tả hành vi (đặt tên theo FR). Chạy, xác nhận nó **fail vì đúng lý do** (không phải vì lỗi import/cú pháp).
2. **GREEN** — viết code tối thiểu để test pass. Không thêm tính năng chưa có test.
3. **REFACTOR** — dọn code khi mọi test xanh; chạy lại test.

Quy tắc:
- Không viết code production khi chưa có test fail cho nó. Code viết trước test → xóa và làm lại.
- Commit theo nhịp: `test: ...` (red) rồi `feat: ...` (green) — hoặc một commit chứa cả hai nhưng test phải có trong cùng commit.
- Mỗi alternative flow trong use case SRS = ít nhất một test.
- Mỗi endpoint phải có test quyền: một role được phép → 2xx; **mỗi** role không được phép → 403; truy cập ngoài phạm vi dữ liệu → 404.
- Test đặt tên có mã FR:
  ```ts
  describe('FR-CLS-06 Xếp học viên vào lớp', () => {
    it('trả 422 CLASS_FULL khi lớp đã đủ sĩ số', ...)
    it('không vượt sĩ số khi 2 request xếp lớp đồng thời vào chỗ cuối cùng', ...)
  });
  ```
- Không mock thứ bạn đang test. BE integration test dùng Mongo thật (MongoMemoryReplSet), không mock Mongoose. FE test mock mạng bằng MSW, không mock hook nội bộ.
- Thời gian: dùng `ClockService` (BE) / `vi.setSystemTime` (FE). Không test phụ thuộc giờ thật.
- Không `it.skip`, `it.only`, `xit` khi commit. Không xóa/sửa test của người khác để cho pass — báo Lead.
- Test phải độc lập, chạy được theo thứ tự bất kỳ, song song.
- Bug fix: viết test tái hiện bug trước.

Lệnh:
```
pnpm --filter api test -- <pattern>        # unit
pnpm --filter api test:e2e -- <pattern>    # integration API
pnpm --filter web test -- <pattern>        # FE
```

## 2. Quyền sở hữu file (swarm)

- Bạn chỉ sửa file trong **lane của mình** (xem TASK.md cột "Sở hữu"). Thường là:
  `apps/api/src/modules/<m>/**`, `apps/api/test/e2e/<m>*.e2e-spec.ts`, `apps/api/test/factories/<lane>.extra.ts`, `apps/web/src/features/<m>/**`, `apps/web/test/msw/<m>.handlers.ts`.
- Đọc mọi model được; **chỉ ghi** collection lane mình sở hữu (TASK.md đầu file). Ghi dữ liệu lane khác → gọi service của lane đó.
- **Chỉ Lead** sửa: `packages/shared/**`, `apps/api/src/common/**`, `apps/api/src/database/**`, `apps/api/test/{helpers,factories}/**` (trừ `*.extra.ts`), `apps/api/src/app.module.ts`, `apps/web/src/{router.tsx,lib,layouts,auth,components}/**`, file cấu hình gốc, `package.json` gốc, lockfile.
- Cần đổi hợp đồng (schema zod, enum, mã lỗi, quyền) hoặc thêm dependency → tạo `docs/contract-requests/<lane>-<n>.md` (cái gì, tại sao, ví dụ) và dừng phần bị chặn; làm tiếp phần khác. Không tự sửa shared.
- Cần dùng module của lane khác chưa xong → dùng interface trong shared + stub cục bộ trong test. Không viết hộ code lane khác.
- Làm trong worktree riêng, nhánh `lane/<module>`. Rebase lên `main` trước khi báo xong.

## 3. Backend

- Controller mỏng: không có logic nghiệp vụ, không truy cập model.
- Mọi route có `@Roles(...)` tường minh (kể cả "mọi role đã đăng nhập" → `@Roles(...ALL_ROLES)`). Route không có `@Roles` → guard từ chối (fail closed).
- Mọi input qua `ZodValidationPipe` với schema từ `@lc/shared`. Không tự định nghĩa DTO trùng lặp ở BE.
- Phạm vi dữ liệu kiểm tra **trong service**, qua `scopeFilter(user)`. Ngoài phạm vi → 404.
- Lỗi nghiệp vụ: `throw new AppError(ErrorCode.X, httpStatus, details?)`. Không throw string, không trả `{ success: false }`.
- Không trả document Mongoose trực tiếp: map sang response type (`toDto`). Không bao giờ trả `passwordHash`, `tokenHash`.
- Thao tác nhiều document → `withTransaction`. Đếm/sĩ số → `$inc` có điều kiện, không đọc-rồi-ghi.
- Tiền là số nguyên. Cấm `parseFloat`, cấm phép chia không làm tròn cho tiền (giảm %: `Math.round(amount * pct / 100)`).
- Thời gian lấy từ `ClockService.now()`; không gọi `new Date()` / `Date.now()` trong service.
- Mọi thao tác ghi trên students, classes, sessions, attendances, grades, invoices, payments → `AuditService.log`.
- Không dùng `any`. `unknown` + thu hẹp kiểu. Không `// @ts-ignore`; `@ts-expect-error` chỉ trong test, có lý do.
- Không `console.log`; dùng `Logger` của Nest.
- Query danh sách luôn phân trang và có index phục vụ (thêm index vào schema khi thêm bộ lọc mới).

## 4. Frontend

- Gọi API chỉ qua `features/<m>/api.ts` + hook TanStack Query trong `hooks.ts`. Component không gọi `fetch`/`ky` trực tiếp.
- Form dùng react-hook-form + zod schema từ shared. Lỗi server `details.fields` → `setError`.
- Mọi màn hình có 4 trạng thái: loading, rỗng, lỗi, dữ liệu (DESIGN.md §4).
- Dùng component chung trong `components/common` và `components/ui`. Không tự tạo bảng/badge/dialog riêng nếu đã có. Thiếu → contract request cho Lead.
- Chuỗi hiển thị tiếng Việt; lỗi map qua `lib/error-messages.ts`; nhãn trạng thái qua `lib/status.ts`.
- Ẩn/hiện hành động bằng `can(user, permission)`. Không hard-code role trong component.
- Tiền hiển thị bằng `MoneyText`/`formatVnd`; ngày bằng `formatDate` — không tự format.
- Test bằng hành vi người dùng (`getByRole`, `getByLabelText`, `userEvent`), không test chi tiết cài đặt, không snapshot lớn.
- Accessibility: mọi input có label; dialog có tiêu đề; nút icon có `aria-label`.

## 5. Phong cách code
- TypeScript strict, ESLint + Prettier (cấu hình gốc) phải sạch.
- Tên file `kebab-case`; class `PascalCase`; biến/hàm `camelCase`; hằng `UPPER_SNAKE`.
- Code, tên biến, commit message: tiếng Anh. Chuỗi UI và tên test (`it(...)`): tiếng Việt được phép.
- Hàm ≤ ~50 dòng; tách hàm khi một hàm làm hơn một việc.
- Comment giải thích **tại sao**, không giải thích **cái gì**.
- Không thêm dependency khi chưa được Lead duyệt.

## 6. Git
- Conventional commits: `feat(classes): ...`, `test(attendance): ...`, `fix(fees): ...`, `chore: ...`.
- Commit nhỏ, mỗi commit build được và test xanh (trừ commit `test:` đỏ có chủ đích ngay trước commit `feat:`).
- Không commit `.env`, `uploads/`, `coverage/`, `node_modules/`.
- Không force-push lên `main`. Không merge lane khác vào lane mình.

## 7. Definition of Done (một task)
- [ ] Mọi FR của task có test (mã FR trong tên), bao gồm alternative flow, quyền, phạm vi.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` xanh trong worktree sau khi rebase `main`.
- [ ] Coverage module ≥ ngưỡng (NFR-07).
- [ ] Không sửa file ngoài lane (kiểm `git diff --stat main`).
- [ ] Màn hình FE có đủ 4 trạng thái, dùng được ở độ rộng yêu cầu.
- [ ] Cập nhật `TASK.md`: đánh dấu `[x]`, ghi chú ngắn nếu có quyết định mới (và thêm vào `docs/DECISIONS.md`).
- [ ] Báo cáo cho Lead: những gì xong, lệnh đã chạy + kết quả, contract request còn mở.

## 8. Khi bị kẹt
- Yêu cầu mơ hồ: chọn cách đơn giản nhất phù hợp PRD, ghi vào `docs/DECISIONS.md` (`[Lane][Task] quyết định — lý do`), tiếp tục.
- Bị chặn bởi lane khác/hợp đồng: contract request + stub, làm phần khác.
- Test fail không rõ lý do sau 3 lần thử: dừng đoán, đọc lỗi kỹ, cô lập bằng test nhỏ hơn; vẫn không được → báo Lead kèm log.
- Không bao giờ "làm cho xanh" bằng cách nới assertion, bỏ test, hoặc bắt-và-nuốt lỗi.
