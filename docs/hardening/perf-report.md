# NFR-02 performance report (H-02, D36)

**Command:** `caffeinate -i pnpm --filter api perf` → `apps/api/test/perf/p95.ts` (helpers `apps/api/test/perf/explain.ts`, tested by `apps/api/test/security/perf-helpers.security-spec.ts`). Not part of the full chain; re-run in Task M.

**Method:** own MongoMemoryReplSet (1 node, wiredTiger, temp dbPath) → `runSeedDemo` → `runSeedLarge({ students: 10000, classes: 500, sessionsPerClass: 100 })` → in-process Nest app on an ephemeral port, logged in as `manager@center.local`. Per endpoint: 5 warm-up + 50 sequential timed requests (`fetch`, full body read), nearest-rank p95; then one extra request under `mongoose.set('debug', …)` whose reads (`find`/`findOne`/`aggregate`/`countDocuments`/`distinct`, and `estimatedDocumentCount` — Ruling R11, a metadata count with no plan, counted as a read without COLLSCAN) are run through `explain('queryPlanner')`. A winning-plan `COLLSCAN` (any depth, rejected plans ignored) or an SBE `EQ_LOOKUP` that is not `IndexedLoopJoin` counts as a scan; the **foreign side** of every `$lookup` / `$unionWith` (also inside `$facet`) is explained on its own collection. **Vacuous-read guard:** an endpoint with 0 captured reads or any captured call explain.ts cannot explain fails the run. Any scan or p95 ≥ 300ms → exit 1.

**Machine:** Apple M4 ×10, 16 GiB, Node v26.12.1, MongoDB 7.0.24 (memory-server, wiredTiger), 2026-11-01 (Task M re-run on main after merging lane/L-LEAD + lane/L-HARDENING + lane/L-E2E).

## Volume

| collection | docs |
|---|---:|
| students | 10,060 |
| classes | 508 |
| sessions | 50,112 |
| sessions with attendance taken | 4,063 (8.1%) |
| attendance | 80,504 |
| enrollments | 10,060 |
| invoices | 10,052 |
| payments | 6,710 |
| leads | 75 |

(demo seed + large seed; seeding took 13.3s.)

**Caveat — attendance volume:** `seed-large` takes each class's sessions from today−28 forward, so with `sessionsPerClass: 100` only ~8 sessions per class lie in the past and get attendance; **~92% of the 50k sessions have no attendance**. Attendance is 80.5k rows, not the ~1M a fully-run 50k-session dataset would hold, and all of it falls inside the 30-day `/attendance` window. The attendance numbers below are therefore a lower bound on the real cost.

## Result (Task M, `NFR-02 PASS`)

| endpoint | p50 (ms) | p95 (ms) | rows (page/total) | reads explained | COLLSCAN |
|---|---:|---:|---:|---:|---|
| `GET /leads` | 1.0 | 1.4 | 20/75 | 3 | no |
| `GET /students` | 2.6 | 2.8 | 20/10060 | 4 | no |
| `GET /students?q=nguyen` | 10.8 | 11.2 | 20/1256 | 4 | no |
| `GET /classes` | 1.1 | 1.3 | 20/508 | 5 | no |
| `GET /sessions?from=2026-11-02&to=2026-11-08` | 18.6 | 19.3 | 1010 | 4 | no |
| `GET /enrollments/waiting` | 0.9 | 1.0 | 4/4 | 5 | no |
| `GET /attendance?from=2026-10-04&to=2026-11-02` | 11.3 | 11.7 | 20/80312 | 5 | no |
| `GET /results?classId=<L-0001>` | 1.4 | 1.7 | 20/20 | 5 | no |
| `GET /invoices` | 1.0 | 1.1 | 20/10052 | 3 | no |
| `GET /invoices?overdue=true` | 6.3 | 7.0 | 20/6676 | 3 | no |

Every endpoint is far below 300ms p95, with 0 COLLSCAN and no NOT EXPLAINABLE / NO READS lines. `/attendance` went from p95 2112–8358ms (H-02, FAIL) to 11.7ms after CR L-HARDENING-3 (R12: `attendance.startAt` + covering indexes, no session join). The attendance-volume caveat above still holds: 80.5k rows, not the ~1M of a fully-run 50k-session dataset, so `/attendance` is a lower bound (its plan is index-bounded by `startAt`, so cost should grow with the page window, not the collection).

## Before (H-02 run 2, `NFR-02 FAIL`, kept for reference)

| endpoint | p95 (ms) | COLLSCAN |
|---|---:|---|
| `GET /leads` | 2.1 | YES (2) |
| `GET /students` | 8.2 | YES (2) |
| `GET /classes` | 2.0 | YES (2) |
| `GET /sessions?from=2026-11-02&to=2026-11-08` | 29.8 | YES (1) |
| `GET /attendance?from=2026-10-04&to=2026-11-02` | 8358.6 ✗ | YES (1) |
| `GET /results?classId=<L-0001>` | 11.7 | YES (1) |
| `GET /invoices` | 6.5 | YES (2) |

## Findings → contract requests

- **L-HARDENING-2** (`docs/contract-requests/L-HARDENING-2.md`): missing indexes — `leads`/`students` `{deletedAt, createdAt:-1, _id:-1}`, `classes`/`invoices` `{createdAt:-1, _id:-1}`, `sessions` `{startAt, _id}`; unfiltered `countDocuments({})` on `classes`/`invoices` stays COLLSCAN under any index → `estimatedDocumentCount()` or an agreed exception. Explain before/after included (verified ad hoc on the perf DB; schemas untouched).
- **L-HARDENING-3** (`docs/contract-requests/L-HARDENING-3.md`): `/attendance` list joins all 80k rows to sessions before filtering by date (the only p95 breach); a session prefilter alone removes the COLLSCAN but leaves p95 ≈ 1.2s, so it needs denormalised session time on attendance or session-based paging. `/results?classId` runs `$match {}` before `$unwind` → prepend an `$or` on `classId`/`classHistory` (existing indexes).

Both CRs fixed on lane/L-LEAD (L-HARDENING-2: 4048479; L-HARDENING-3: 418b2d6 + 47eed21); the Task M result table above is the re-run.
