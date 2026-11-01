# Accessibility report (H-03, NFR-06)

`pnpm e2e a11y` -> `e2e/a11y/a11y.spec.ts`: axe (`wcag2a` + `wcag2aa`) on 10 screens x light/dark = 20 scans (+1 check for CR 4). Pass criterion: 0 `serious`/`critical` violations. Screens: /login; M `/`; S `/admissions/leads`, `/admissions/leads/new`, `/students/:id`, `/classes/:id`, `/fees/invoices/:id`; M `/reports`; T mobile `/sessions/:id/attendance`; H mobile `/`.

Method: light runs use `page.emulateMedia({ colorScheme: 'light' })`, dark runs `colorScheme: 'dark'`, set before login; the app itself applies the theme (`html.dark` from `prefers-color-scheme`, Ruling R15) and the scan asserts `html.dark` matches the mode and the body background is actually dark/light. `CR4_OPEN = false` (CR L-HARDENING-4 fixed in lane/L-LEAD 3aee0dd + 2c68f76): no workaround, the two CR-4 tests require the real behaviour (app sets `html.dark` and serves a `.dark` rule that declares `--background`; user-menu toggle Hệ thống/Sáng/Tối switches and persists across reload, `Hệ thống` follows the OS live). `KNOWN` is empty: every screen must have 0 serious/critical in both modes. Navigation/readiness failures (h1 + a data element per screen) are real failures.

## Result (Task M, after merging lane/L-LEAD)

`pnpm e2e a11y`: **22 passed** (20 scans + 2 CR-4 tests), 0 serious/critical.

| Screen | Light | Dark |
|---|---|---|
| /login | pass | pass |
| M / | pass | pass |
| S /admissions/leads | pass | pass |
| S /admissions/leads/new | pass | pass |
| S /students/:id | pass | pass |
| S /classes/:id | pass | pass |
| S /fees/invoices/:id | pass | pass |
| M /reports | pass | pass |
| T mobile attendance | pass | pass |
| H mobile / | pass | pass |

Contract requests (all fixed on lane/L-LEAD, see `docs/contract-requests/L-07-status.md`):
- 4: `.dark` tokens purged from production CSS, no toggle → theme module + safelist + pre-paint boot script (3aee0dd, 2c68f76).
- 5: light `--muted-foreground` 4.48:1; success badge 2.7:1 → tokens darkened (3aee0dd).
- 6: dark primary/destructive with white text 3.63 / 3.78 → dark foregrounds (3aee0dd), dark hover via brightness (2c68f76).
- 7: `/reports` tab `aria-controls` → real `TabsContent` (3aee0dd).
- Task M: with the CR-5 known sets removed, light `text-info` on `bg-info/15` (3.06:1, `/admissions/leads`) and `text-destructive` on `bg-destructive/15` (3.65:1, `/fees/invoices/:id`) surfaced (they had been hidden behind the CR-5 `color-contrast` entry). Light `--destructive`/`--warning`/`--info` darkened (DECISIONS "W4 Task M a11y"; guard `apps/web/src/__tests__/status-token-contrast.test.ts`).

Scanner proof: injecting `<input id=bite>` + `<p style="color:#ccc;background:#fff">` on the (clean) dashboard made the scan fail with `label` (critical, `#bite`) and `color-contrast` (serious, `#bite2`); reverted.
