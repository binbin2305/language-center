# L-HARDENING-5: light palette contrast below WCAG AA (axe `color-contrast`, serious)

**Pages:** `/admissions/leads`, `/admissions/leads/new`, `/students/:id`, `/classes/:id`, `/fees/invoices/:id`, `/reports`, `/sessions/:id/attendance` (light). Lead/FE-owned (`apps/web/src/index.css`, shared badge/tab components).

**Repro:** `pnpm e2e a11y` (specs `NFR-06 a11y ... (light)`, marked `test.fail(true,'CR L-HARDENING-5')`).

**Rule:** `color-contrast` (serious, wcag2aa 4.5:1). Selectors / measured:
- `text-muted-foreground` (`--muted-foreground: 215 16% 47%` = `#65758b`) on page bg `#f8fafc`: **4.48** (needs 4.5), on `bg-secondary/muted` `#f1f5f9`: **4.28**. Hits `th`, `dt`, `p.text-xs`, breadcrumb `span[aria-current=page]`, `.hover\:underline`, `#radix-...-trigger-*` inactive tabs, attendance `li > div > .text-xs` and the status radio buttons.
- Success badge on student detail (`.px-2\.5.py-0\.5`): `#16a249` on `#d6ede1` = **2.7**.

**Suggestion:** darken `--muted-foreground` to about `215 19% 35%` (>= 6:1 on all surfaces) or at least `215 16% 40%` (4.28 -> >= 5); use a darker text token for the success badge (e.g. `142 76% 22%` on the tint) instead of `text-success`.
