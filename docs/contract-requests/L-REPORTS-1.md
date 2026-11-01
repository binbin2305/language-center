# L-REPORTS-1: fees page must honour `?overdue=true`

Requested by: L-REPORTS (R-06). Owner to act: Lead (Task M), since `features/fees` is not owned by L-REPORTS (D27).

The staff dashboard card "Công nợ quá hạn" links to `/fees?overdue=true` (Review Focus 3: dashboard count = `GET /invoices?overdue=true` meta.total).
`apps/web/src/features/fees/pages/fees-page.tsx` (~line 24) keeps `overdue` in `useState(false)` and never reads `useSearchParams`, so the link lands on an unfiltered list.

Requested change: initialise `overdue` from the `overdue` search param (`searchParams.get('overdue') === 'true'`) and keep it in the URL when toggled.

Suggested test (fees feature): render at `/fees?overdue=true`, spy `GET */invoices`, assert the first request has `overdue=true` and the overdue toggle is checked; toggling it off removes the param from the URL and the request.
