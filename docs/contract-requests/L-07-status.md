# L-07 status: contract requests fixed on lane/L-LEAD

The CR files live on `lane/L-HARDENING`. Their "Fixed in" lines are recorded here so that branch is not edited.

| CR | Fixed in | Test (lowest layer) |
|---|---|---|
| L-HARDENING-1 (CORS echoes WEB_ORIGIN) | Fixed in lane/L-LEAD 0060773 | `apps/api/test/e2e/cors.e2e-spec.ts` |
| H-01B note (receipt.pdf 403/404 served as application/pdf) | Fixed in lane/L-LEAD c596295 | `apps/api/test/e2e/fees-lookup.e2e-spec.ts` "receipt lỗi 403/404 -> Content-Type application/json" |
| L-HARDENING-2 (list indexes, unfiltered totals) | Fixed in lane/L-LEAD 4048479 | `apps/api/test/e2e/indexes.e2e-spec.ts` (index exists + every read explained, no COLLSCAN), `apps/api/src/common/pagination.spec.ts` |
| L-HARDENING-3 (attendance join-before-filter, results classId) | Fixed in lane/L-LEAD 418b2d6 + 47eed21 (review fixes) | `indexes.e2e-spec.ts`, `attendance-take`, `attendance-update`, `schedule-update`, `seed-demo`, `attendance-startat-migration` e2e specs |

## What changed
- **CORS:** `enableCors({ origin: [env.WEB_ORIGIN], credentials: true })`. Any other origin gets no `Access-Control-Allow-Origin`, on simple requests and on preflight.
- **receipt.pdf:** the Content-Type moved from `@Header` to `StreamableFile({ type: 'application/pdf' })`. Error envelopes are `application/json`.
- **Indexes:** leads/students `{deletedAt:1, createdAt:-1, _id:-1}`; classes/invoices `{createdAt:-1, _id:-1}`; sessions `{startAt:1, _id:1}` and `{status:1, startAt:1, _id:1}`; attendances `{startAt:-1, _id:-1}`, `{classId:1, startAt:-1, _id:-1}`, `{studentId:1, startAt:-1, _id:-1}`.
- **R11:** `paginate` (and `/attendance`) count with `estimatedDocumentCount()` when the effective filter is empty (`{}` or `$and` made only of empty filters). Any other filter uses `countDocuments`.
- **R12:** `attendance.startAt` (required) is set when attendance is taken or upserted, and updated in the same transaction when a session is rescheduled. It is backfilled by `pnpm --filter api migrate:attendance-start-at` (batched, idempotent, `timestamps: false`, orphans counted). `seed-large` writes the field; `seed-demo` gets it through the service. `/attendance` and `/attendance/summary` match on attendance alone: scope + `startAt` range + `sessionId $nin` (cancelled sessions in the range, read through the covering index). The list is `find().sort({startAt:-1,_id:-1}).skip().limit()` with an indexed count, and no session join.
- **/results:** when the class list is known (`classId`, or the teacher's or student's classes), `$or: [{classId:{$in}}, {classHistory:{$in}}]` runs first. The exact `cid` match after `$unwind` is kept.

## Deploy note
`pnpm --filter api migrate:attendance-start-at` is a **pre-traffic step**. Run it right after deploying, at a low-traffic time; it scans every attendance row once. Until it has run:
- legacy rows without `startAt` **are missing from every date-filtered query**: `GET /attendance?from|to` and `GET /attendance/summary?from|to`, totals included;
- in an **unranged** `GET /attendance` they are counted and listed (no 500), with `sessionStartAt` read from their session (page rows only). They sort after every migrated row, because a missing `startAt` sorts last in descending order;
- an unranged `/attendance/summary` counts them.

## For Task M (L-HARDENING)
- Flip the two `it.failing` tests `CR L-HARDENING-1 …` in `apps/api/test/security/headers.security-spec.ts` to `it`.
- `apps/api/test/perf/explain.ts`: treat `estimatedDocumentCount` (R11) as an explained read with no COLLSCAN. Otherwise `p95.ts` reports it as NOT EXPLAINABLE.
- With that single change, a copy of `p95.ts` run on lane/L-LEAD 418b2d6 gives NFR-02 PASS at D36 volume. All 10 endpoints are below 43ms p95 with 0 COLLSCAN (`/attendance` 42.5ms, was 2112ms; `/sessions` 18.9; `/students?q` 12.0; others ≤ 7ms).

## Batch 2: accessibility CRs (L-HARDENING-4..7)
- L-HARDENING-4 (dark mode): Fixed in lane/L-LEAD 3aee0dd. Task M: set `CR4_OPEN = false` in `e2e/a11y/a11y.spec.ts`.
- L-HARDENING-5 (light contrast): Fixed in lane/L-LEAD 3aee0dd. Task M: drop `test.fail` / known-CR entries for CR-5.
- L-HARDENING-6 (dark contrast): Fixed in lane/L-LEAD 3aee0dd. Task M: drop known-CR entries for CR-6.
- L-HARDENING-7 (reports tabs aria-controls): Fixed in lane/L-LEAD 3aee0dd. Task M: drop the `aria-valid-attr-value` entries for `/reports`.
