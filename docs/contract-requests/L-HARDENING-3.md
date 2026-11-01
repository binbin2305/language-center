# L-HARDENING-3: query shape of attendance list and results list (NFR-02, D36)

**Routes:** `GET /attendance?from&to` (`modules/attendance/attendance.service.ts` `historyMatch`/`joinSession`/`list`), `GET /results?classId` (`modules/grades/results.service.ts` `list`) — Lead-owned.

**Repro:** `caffeinate -i pnpm --filter api perf` (`apps/api/test/perf/p95.ts`).

## A. `GET /attendance?from=2026-10-04&to=2026-11-02` (manager) — p95 2112ms / 8359ms in two runs (limit 300ms), COLLSCAN

**Actual:** for staff, `historyMatch` returns `{}`, so the pipeline is
`attendances.aggregate [{$match:{}}, {$lookup sessions by sessionId}, {$unwind}, {$match:{'session.status':{$ne:'CANCELLED'}, 'session.startAt':{$gte,$lt}}}, {$facet:{rows:[{$sort:{'session.startAt':-1,_id:-1}},{$skip},{$limit}], count:[{$count}]}}]`
→ winning plan `COLLSCAN` over all 80,504 attendance rows, one `$lookup` per row, date filter applied after the join.

**Measured alternatives (ad hoc on the perf DB):**
- sessions in range first (`sessions.find({startAt range, status≠CANCELLED})`, 4,211 ids) then `attendances.$match {sessionId:{$in:ids}}` + `$lookup` + `$facet`: plan `FETCH>IXSCAN(sessionId_1_studentId_1)` (no COLLSCAN) but p95 still **1155ms** — the window holds 80,312 rows that are all joined and sorted.
- the same session prefilter + `attendances.countDocuments({sessionId:{$in:ids}})` for the total only: p95 **29.7ms**.

**Suggestion (Lead decides):** avoid joining every row before paging, e.g.
1. denormalise `sessionStartAt` (and session status or a `cancelled` flag) onto attendance, maintained by the schedule update/cancel paths, index `{ sessionStartAt: -1, _id: -1 }` (+ `{ classId: 1, sessionStartAt: -1 }`, `{ studentId: 1, sessionStartAt: -1 }` for scoped roles); then `$match` on the date range, sort/limit through the index, `$lookup` only the 20 page rows; or
2. page through sessions: session prefilter sorted `{startAt:-1,_id:-1}`, per-session counts via `$group` on `{sessionId:{$in}}` (index-covered), pick the sessions covering the page, fetch only their attendance; total from `countDocuments`.
Both need `SessionSchema.index({ startAt: 1, _id: 1 })` (CR L-HARDENING-2). `summary` uses the same `joinSession` and has the same problem.

## B. `GET /results?classId=<L-0001>` — p95 11–15ms, COLLSCAN

**Actual:** `enrollments.aggregate [{$match:{}} (staff), {$project cids = classId ∪ classHistory}, {$unwind}, {$match:{cid: X}}, …]` → plan `PROJECTION_DEFAULT>COLLSCAN` over all 10,060 enrollments.

**Suggestion:** when a class filter is known (`q.classId`, or the teacher/student class list), prepend an index-backed stage before the `$project` (keep the existing `$match: {cid}` after `$unwind` for exactness):
```ts
{ $match: { ...match, $or: [{ classId: { $in: ids } }, { classHistory: { $in: ids } }] } }
```
Explain (ad hoc): `SUBPLAN>PROJECTION_SIMPLE>FETCH>OR>IXSCAN(classId_1_status_1)|IXSCAN(classHistory_1)` — existing indexes, no schema change. Unfiltered `/results` (no classId) stays a full scan; whitelisting it or requiring a filter is Lead's call.

After the fix, re-run `pnpm --filter api perf` (Task M).
