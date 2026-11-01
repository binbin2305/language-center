# L-HARDENING-7: reports tabs reference a missing panel id (axe `aria-valid-attr-value`, critical)

**Page:** `/reports` (light and dark). `apps/web/src/features/reports/pages/reports-page.tsx` (Radix `Tabs`). Lead/FE-owned.

**Repro:** `pnpm e2e a11y` on `M /reports`; selector `#radix-:r5:-trigger-admissions`.

**Rule:** `aria-valid-attr-value` (critical): the first tab trigger has `aria-controls="radix-...-content-admissions"` but that panel is not in the DOM (Radix unmounts inactive `TabsContent`; the first panel is not rendered yet / lazy).

**Suggestion:** render the active `TabsContent` unconditionally (no early return while loading: show a skeleton inside it) or `forceMount` all panels with `hidden`; ensure the default tab's panel exists on first paint.
