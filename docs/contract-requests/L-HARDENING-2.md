# L-HARDENING-2: missing indexes for staff list endpoints (NFR-02, D36)

**Routes:** `GET /leads`, `GET /students`, `GET /classes`, `GET /sessions?from&to`, `GET /invoices` (schemas in `apps/api/src/database/schemas/**`, services in `modules/{admissions,classes,schedule,fees}` — Lead-owned).

**Repro:** `caffeinate -i pnpm --filter api perf` (`apps/api/test/perf/p95.ts`, 10k students / 500 classes / 50k sessions). It exits 1 and prints `COLLSCAN in GET <route>: <collection>.<method> <filter> sort=… plan: …`.

**Expected (D36):** no `COLLSCAN` in the winning plan (`explain('queryPlanner')`) of any read made by these requests.

**Actual (explain before, MongoDB 7.0.24):**

| route | query | winning plan |
|---|---|---|
| `/leads` | `leads.find {deletedAt:null}` sort `{createdAt:-1,_id:-1}` limit 20 | `SORT>COLLSCAN` |
| `/leads` | `leads.countDocuments {deletedAt:null}` | `COLLSCAN` |
| `/students` | `students.find {$and:[{deletedAt:null}]}` sort `{createdAt:-1,_id:-1}` limit 20 | `SORT>COLLSCAN` |
| `/students` | `students.countDocuments {$and:[{deletedAt:null}]}` | `COLLSCAN` |
| `/classes` | `classes.find {}` sort `{createdAt:-1,_id:-1}` limit 20 | `SORT>COLLSCAN` |
| `/classes` | `classes.countDocuments {}` | `COLLSCAN` |
| `/sessions` | `sessions.find {startAt:{$gte,$lt}}` sort `{startAt:1,_id:1}` | `SORT>COLLSCAN` |
| `/invoices` | `invoices.find {}` sort `{createdAt:-1,_id:-1}` limit 20 | `SORT>COLLSCAN` |
| `/invoices` | `invoices.countDocuments {}` | `COLLSCAN` |

p95 is already < 300ms at this volume (2–30ms), but each is a full scan + in-memory sort that grows linearly.

**Suggestion (1) indexes** — verified by creating them ad hoc on the perf DB (explain after):

```ts
LeadSchema.index({ deletedAt: 1, createdAt: -1, _id: -1 });     // find: LIMIT>FETCH>SORT_MERGE>IXSCAN ; count: OR>COUNT_SCAN
StudentSchema.index({ deletedAt: 1, createdAt: -1, _id: -1 });  // same plans; HTTP p95 11.0 → 2.9ms
ClassSchema.index({ createdAt: -1, _id: -1 });                  // find: LIMIT>FETCH>IXSCAN(createdAt_-1__id_-1)
InvoiceSchema.index({ createdAt: -1, _id: -1 });                // find: LIMIT>FETCH>IXSCAN ; HTTP p95 6.7 → 3.1ms
SessionSchema.index({ startAt: 1, _id: 1 });                    // find: FETCH>IXSCAN(startAt_1__id_1) ; HTTP p95 33.4 → 20.6ms
```

**Suggestion (2) unfiltered totals** — `countDocuments({})` (`/classes`, `/invoices` with no filter) stays `COLLSCAN` with any index (the driver runs `$match {}` + `$group`). When the list filter is empty, use `estimatedDocumentCount()` (collection metadata, plan `RECORD_STORE_FAST_COUNT`, 0.1ms; matched the exact count 508/10052 here). Alternatively Lead may accept unfiltered totals as a documented exception and the perf check can whitelist `countDocuments {}`; tell L-HARDENING which.

After the fix, re-run `pnpm --filter api perf` (Task M).
