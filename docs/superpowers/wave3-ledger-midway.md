# SDD ledger — plan: docs/superpowers/plans/2026-11-01-wave3-reports-portal-integration.md

Spec: PRD.md §4.9 + FR-ADM-04/FR-STU-02, BACKEND_SCHEMA §3.3 Reports/§4 seed, DESIGN §4.1/4.2/4.10, TASK.md W3, docs/DECISIONS.md, docs/superpowers/wave2-ledger.md. Base: main 2ca886c (= w2 + docs + plan).
Briefs: `brief.sh <ID>`. Common prompts copied from W2 (Wave 3 wording).

## Preflight scan
| Pair / Task | Produces → Consumes | Finding |
|---|---|---|
| T0 ↔ R-01/R-06 | DashboardDto todaySessions/admissionsTrend | ok, T0 first |
| T0 ↔ L-01 | StudentDto.currentClasses ([] placeholder in T0, real in L-01) | ok |
| T0 ↔ P-01 | GET /assessments/pending + usePendingAssessments | ok |
| R-01 ↔ fees | overdueFilter import (pure fn) from modules/fees/fees.mapper | allowed by Global Constraints |
| R-02..R-04 ↔ R-05 | report endpoints + export | ok sequential |
| P-01 ↔ W2 features | hooks exported? D27 fallback to features/home/api.ts | ok |
| P-02 ↔ Task M | contract requests for other features | ok |
| L-01 ↔ L-05 | features/students vs results/attendance — distinct files | ok |
| L-04 ↔ Task M smoke | new seed used by smoke | ok |
| L-LEAD ↔ L-REPORTS/PORTAL | LEAD must not touch modules/reports, features/{reports,dashboard,home} | carried in lane intro |
| Each task self-consistency | T0, R-01..06, P-01..02, L-01..05, M | clean |

Ruling R1: three branches run in parallel (one implementer per branch at a time, own worktree) — user asked for swarm — cost if wrong: merge conflicts at Task M.

## Progress
Task 0: dispatched impl (BASE 2ca886c)
Task 0: implemented (2ca886c..0f9951b); review dispatched
Task 0: complete (commits 2ca886c..0f9951b, review clean)
Task 0: minor (deferred): no unlockedUntil-override / tie-break tests for pending; cosmetic import order
Branches started from 0f9951b: lc-L-REPORTS, lc-L-STUDENT-PORTAL, lc-L-LEAD (git worktree add, lane/L-LEAD)
Workers (BASE 0f9951b): R-01 impl a2ed5efc, P-01 impl a6ec8218, L-01 impl a3861f35 — parallel
Task R-01: implemented (0f9951b..8c5ac7c); review dispatched
Task R-01: complete (commits 0f9951b..8c5ac7c, review clean)
Task R-01: minor (deferred): trend $match no upper bound; factory createdAt not pinned in trend test; decLeadsOnly naming
Task L-01: implemented (0f9951b..045fed6); review dispatched. Task R-02: impl dispatched (BASE 8c5ac7c)
Task L-01: review Needs fixes (PATCH/me-contact return currentClasses []); fix round 1 dispatched (HEAD seen: 045fed6)
Task P-01: implemented (0f9951b..9e07521); review dispatched
Task L-01: fix round 1 done (045fed6..c99dae8); re-review dispatched
Task P-01: review Needs fixes (CRITICAL queryKey per-render → request loop; placement not filtered SCHEDULED; RED not raw); fix round 1 dispatched (HEAD seen: 9e07521)
Task R-02: implemented (8c5ac7c..07465d2); review dispatched
Ruling R2: admissions newProfiles course = lead.interestedCourseId, fallback earliest enrollment courseId; students with neither only in totals; rows = courses with any non-zero metric (+ filtered course); finance rows with null course/class → key 'none' label "Khác"; revenue grouped by the payment's invoice — accepted (D26 silent) — cost if wrong: small regrouping.
Task L-01: fix round 1/5 (2 addressed, 0 open; commits 045fed6..c99dae8)
Task L-01: complete (commits 0f9951b..c99dae8, review clean)
Task L-01: minor (deferred): grades query no enrollmentId filter; O(classes×assessments); import order
Task L-02: impl dispatched (BASE c99dae8)
Task R-02: complete (commits 8c5ac7c..07465d2, review clean)
Task R-02: minor (deferred): admissions Σrows.newProfiles < totals when profile has no course (no 'none' row); enrollment-fallback / finance 'Khác' / VOID-invoice payment untested; local rate() helper (reuse in R-03)
Task R-03: impl dispatched (BASE 07465d2). Task L-02: implemented (c99dae8..68e93a2); review dispatched (opus, security)
Task P-01: fix round 1/5 (4 addressed, 0 open — stable key, SCHEDULED, raw RED, startAt; commits 9e07521..acda7bb)
Task P-01: complete (commits 0f9951b..acda7bb, review clean)
Task P-01: minor (deferred): `now` frozen per mount (no midnight rollover); results/invoices limit 100 not paginated; FEES_OUTSTANDING text check loose
Task P-02: impl dispatched (BASE acda7bb)
Task L-02: review Approved-with-RED-defect (raw RED missing) + defence-in-depth studentId match + guard tests; fix round 1 dispatched (HEAD seen: 68e93a2)
Task L-02: note (accepted by D23): 5 wrong passwords on a unique student email → 423 reveals the email maps to one student; same as student code / staff email today.
Task R-03: implemented (07465d2..7504666); review dispatched
Task P-02: implemented (acda7bb..HEAD); CR L-STUDENT-PORTAL-1 (result-cards table/button) for Task M; review dispatched
Task L-02: fix round 1 done (68e93a2..3f99fa8); re-review dispatched
Task R-03: complete (commits 07465d2..7504666, review clean)
Task R-03: minor (deferred): literal 'sessions' collection name in $lookup; two aggregations could be one $facet; round4 duplicate of attendance.service round (lane rule); combined-filter tests
Task L-02: fix round 1/5 (3 addressed, 0 open — raw RED, studentId binding, 5 guard tests; commits 68e93a2..3f99fa8)
Task L-02: complete (commits c99dae8..3f99fa8, review clean)
Task L-02: minor (deferred): test (a) not isolating studentId check; test (d) title mismatch
Task L-03: impl dispatched (BASE 3f99fa8). Task P-02: review Needs fixes (banner/schedule/StatusSegmented targets unchecked); fix round 1 dispatched (HEAD seen: b98befe)
Task L-03: implemented (3f99fa8..4ddaee0), test-only, no product bugs; review dispatched
Task L-04: impl dispatched (opus, BASE 4ddaee0) — concurrently with L-03 read-only review
Task P-02: fix round 1/5 (3 addressed, 0 open; commits b98befe..96dfe23)
Task P-02: complete (commits acda7bb..96dfe23, review clean). Task M note: CR L-STUDENT-PORTAL-1 (result-cards table overflow + PDF button h-8) and -2 (confirm-class-banner size=sm; session-detail-sheet Điểm danh h-9) → fix + remove 4 it.fails
Lane L-STUDENT-PORTAL: all tasks complete (HEAD 96dfe23)
Task L-03: complete (commits 3f99fa8..4ddaee0, review clean)
Task L-03: minor (deferred → carried into L-05 dispatch): (3) comment overstates transfer /attendance coverage; case (8) weak post-FINISHED payload assertions (PRESENT, assessment id, pdf content-type); case (4) notification ref + non-ENROLLED control
Task R-04: implemented (7504666..59d5c60); review dispatched; R-05 impl dispatched in parallel (FE files only)
Task R-04: complete (commits 7504666..59d5c60, review clean)
Task R-04: minor (deferred): pdf money not formatted (formatVnd); per-type header/empty tests thin; empty pdf table shows only first header
STOPPED by user request 2026-11-01: R-05 impl and L-04 impl killed mid-work (uncommitted WIP in lc-L-REPORTS and lc-L-LEAD). Handoff: docs/superpowers/handoff-wave3-midway.md
