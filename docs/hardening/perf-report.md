# NFR-02 performance report (H-02, D36)

**Command:** `caffeinate -i pnpm --filter api perf` → `apps/api/test/perf/p95.ts` (helpers `apps/api/test/perf/explain.ts`, tested by `apps/api/test/security/perf-helpers.security-spec.ts`). Not part of the full chain; re-run in Task M.

**Method:** own MongoMemoryReplSet (1 node, wiredTiger, temp dbPath) → `runSeedDemo` → `runSeedLarge({ students: 10000, classes: 500, sessionsPerClass: 100 })` → in-process Nest app on an ephemeral port, logged in as `manager@center.local`. Per endpoint: 5 warm-up + 50 sequential timed requests (`fetch`, full body read), nearest-rank p95; then one extra request under `mongoose.set('debug', …)` whose reads (`find`/`findOne`/`aggregate`/`countDocuments`/`distinct`) are run through `explain('queryPlanner')`. Any `COLLSCAN` stage in a winning plan (any depth, rejected plans ignored) or p95 ≥ 300ms → exit 1.

**Machine:** Apple M4 ×10, 16 GiB, Node v26.12.1, MongoDB 7.0.24 (memory-server, wiredTiger), 2026-11-01.

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

(demo seed + large seed; seeding took ~13.5s.)

**Caveat — attendance volume:** `seed-large` takes each class's sessions from today−28 forward, so with `sessionsPerClass: 100` only ~8 sessions per class lie in the past and get attendance; **~92% of the 50k sessions have no attendance**. Attendance is 80.5k rows, not the ~1M a fully-run 50k-session dataset would hold, and all of it falls inside the 30-day `/attendance` window. The attendance numbers below are therefore a lower bound on the real cost.

## Result (run 2, `NFR-02 FAIL`)

| endpoint | p50 (ms) | p95 (ms) | rows (page/total) | reads explained | COLLSCAN |
|---|---:|---:|---:|---:|---|
| `GET /leads` | 1.0 | 2.1 | 20/75 | 3 | YES (2) |
| `GET /students` | 7.6 | 8.2 | 20/10060 | 4 | YES (2) |
| `GET /students?q=nguyen` | 5.8 | 6.4 | 20/1256 | 4 | no |
| `GET /classes` | 1.4 | 2.0 | 20/508 | 5 | YES (2) |
| `GET /sessions?from=2026-11-02&to=2026-11-08` | 27.7 | 29.8 | 1010 | 4 | YES (1) |
| `GET /enrollments/waiting` | 1.0 | 1.3 | 4/4 | 5 | no |
| `GET /attendance?from=2026-10-04&to=2026-11-02` | 2012.0 | 8358.6 ✗ | 20/80312 | 3 | YES (1) |
| `GET /results?classId=<L-0001>` | 10.9 | 11.7 | 20/20 | 5 | YES (1) |
| `GET /invoices` | 5.9 | 6.5 | 20/10052 | 3 | YES (2) |
| `GET /invoices?overdue=true` | 8.7 | 16.2 | 20/6676 | 3 | no |

Run 1 gave the same COLLSCAN set and `/attendance` p50 1661.6 / p95 2112.5ms (all other endpoints < 30ms) — the attendance tail is unstable but far above 300ms in both runs.

## Findings → contract requests

- **L-HARDENING-2** (`docs/contract-requests/L-HARDENING-2.md`): missing indexes — `leads`/`students` `{deletedAt, createdAt:-1, _id:-1}`, `classes`/`invoices` `{createdAt:-1, _id:-1}`, `sessions` `{startAt, _id}`; unfiltered `countDocuments({})` on `classes`/`invoices` stays COLLSCAN under any index → `estimatedDocumentCount()` or an agreed exception. Explain before/after included (verified ad hoc on the perf DB; schemas untouched).
- **L-HARDENING-3** (`docs/contract-requests/L-HARDENING-3.md`): `/attendance` list joins all 80k rows to sessions before filtering by date (the only p95 breach); a session prefilter alone removes the COLLSCAN but leaves p95 ≈ 1.2s, so it needs denormalised session time on attendance or session-based paging. `/results?classId` runs `$match {}` before `$unwind` → prepend an `$or` on `classId`/`classHistory` (existing indexes).

Expected after both CRs: re-run `pnpm --filter api perf` in Task M and replace the table above.
