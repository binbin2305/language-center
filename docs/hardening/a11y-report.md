# Accessibility report (H-03, NFR-06)

`pnpm e2e a11y` -> `e2e/a11y/a11y.spec.ts`: axe (`wcag2a` + `wcag2aa`) on 10 screens x light/dark = 20 scans (+1 check for CR 4). Pass criterion: 0 `serious`/`critical` violations. Screens: /login; M `/`; S `/admissions/leads`, `/admissions/leads/new`, `/students/:id`, `/classes/:id`, `/fees/invoices/:id`; M `/reports`; T mobile `/sessions/:id/attendance`; H mobile `/`.

Dark mode: the app has no theme toggle and the production CSS contains no `.dark` block (CR L-HARDENING-4). The spec sets `.dark` on `<html>` (asserted, plus body background luminance), and injects the `.dark` tokens from `apps/web/src/index.css` when the served CSS lacks them, so the intended dark palette is audited.

| Screen | Light | Dark |
|---|---|---|
| /login | pass | CR-6 |
| M / | pass | pass |
| S /admissions/leads | CR-5 | CR-6 |
| S /admissions/leads/new | CR-5 | CR-6 |
| S /students/:id | CR-5 | CR-6 |
| S /classes/:id | CR-5 | CR-6 |
| S /fees/invoices/:id | CR-5 | CR-6 |
| M /reports | CR-5 + CR-7 | CR-6 + CR-7 |
| T mobile attendance | CR-5 | CR-6 |
| H mobile / | pass | pass |

Contract requests (marked `test.fail(true, 'CR L-HARDENING-n')`; they flip to "unexpectedly passed" when fixed, then drop the marker):
- 4: `.dark` tokens purged from production CSS, no toggle.
- 5: light `--muted-foreground` 4.48:1 (4.28 on secondary); success badge 2.7:1.
- 6: dark primary/destructive with white text 3.63 / 3.78; destructive text on tint 4.36.
- 7: `/reports` tab `aria-controls` points to a missing panel (`aria-valid-attr-value`).

Caveat: a screen with several causes is covered by one marker; after fixing a CR re-run and confirm the remaining ones.

Scanner proof: injecting `<input id=bite>` + `<p style="color:#ccc;background:#fff">` on the (clean) dashboard made the scan fail with `label` (critical, `#bite`) and `color-contrast` (serious, `#bite2`); reverted.
