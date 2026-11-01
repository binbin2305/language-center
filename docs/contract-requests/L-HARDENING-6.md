# L-HARDENING-6: dark palette contrast below WCAG AA (axe `color-contrast`, serious)

**Pages:** all 10 screens except dashboard `/` and student home (dark; audited with the source `.dark` tokens injected because of CR L-HARDENING-4). Lead/FE-owned (`apps/web/src/index.css`).

**Repro:** `pnpm e2e a11y` (specs `NFR-06 a11y ... (dark)`, `test.fail(true,'CR L-HARDENING-6')`).

**Rule:** `color-contrast` (serious). Measured:
- `.bg-primary` buttons/badges: `--primary-foreground` white on `--primary: 217 91% 60%` (`#3c83f6`) = **3.63** (login submit button, "Lưu", etc.).
- notification count badge `.absolute.-right-0.5` : white on `--destructive: 0 84% 60%` (`#ef4343`) = **3.78**.
- `text-destructive` on the tinted error bg (`#2c1924`, invoice detail `.px-2\.5`): **4.36**.

**Suggestion:** in `.dark`: `--primary-foreground: 220 49% 8%` (dark text on bright primary) or darken `--primary` to about `217 91% 45%`; same for `--destructive` (e.g. `0 72% 45%` with white, or dark foreground), and lighten destructive text on tints (`0 90% 70%`).

**Status:** Fixed in lane/L-LEAD 3aee0dd (+ 2c68f76 dark hover contrast). Task M: KNOWN entries for CR-6 removed from `e2e/a11y/a11y.spec.ts`. (from `docs/contract-requests/L-07-status.md`)
