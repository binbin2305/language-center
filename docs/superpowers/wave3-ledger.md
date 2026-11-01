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
RESUMED 2026-11-01 new session.
Task R-05: impl re-dispatched (sonnet, BASE 59d5c60, continue-or-discard WIP, raw RED required)
Task L-04: impl re-dispatched (opus, BASE 4ddaee0, continue WIP, raw RED required)
Both R-05 and L-04 impls hit 5h limit; resumed via SendMessage after reset
Task R-05: implemented (59d5c60..0df6bf7), kept coherent WIP, raw RED 8 failed; review dispatched
Task R-06: impl dispatched (sonnet, BASE 0df6bf7) concurrently with R-05 read-only review (FE files disjoint)
Task R-05: complete (commits 59d5c60..0df6bf7, review clean)
Task R-05: minor (deferred): tests miss classId filter, finance groupBy selector, non-admissions export, error/retry, role redirect, to<from guard; chart colours hardcoded hex (no dark tokens); attendance byStudent not rendered; presetRange per render
Task R-06: implemented (0df6bf7..3d4a7e9) concerns: recharts 0x0 warnings in jsdom, sessionsToday card not link; review dispatched
Task R-06: review Needs fixes (/fees?overdue=true not read by fees-page → CR L-REPORTS-1 for Task M; recharts 0x0 noise); fix round 1 dispatched (HEAD seen: 3d4a7e9). Checked ⚠️: home-router sends MANAGER+ACADEMIC_STAFF to StaffDashboard — ok.
Task R-06: minor (deferred): trend line colours hardcoded hex; "6 điểm" test asserts sr-only table only
Task R-06: fix round 1/5 (2 addressed, 0 open — CR L-REPORTS-1 filed, recharts mock; commits 3d4a7e9..df6c4f7)
Task R-06: complete (commits 0df6bf7..df6c4f7, review clean). Task M note: apply CR L-REPORTS-1 (fees-page overdue from search param + test)
Task R-05: minor (deferred, from R-06 re-review): reports tests still emit recharts width(0)/height(0) warnings — apply same ResponsiveContainer mock
Lane L-REPORTS: all tasks complete (HEAD df6c4f7)
Task L-04: implemented (4ddaee0..7ffb68b) concerns: DEMO_TODAY→2026-11-02, admin created only if none, seed:large own course LARGE, --reset keeps settings+ADMIN; review dispatched
Task L-05: impl dispatched (sonnet, BASE 7ffb68b) concurrently with L-04 review; carries L-03 minors (3),(8),(4)
Task L-04: review Needs fixes (RED block pasted from dashboard vitest, not seed spec; minors seed-large wall clock / fake actor / non-idempotent partial rerun); fix round 1 dispatched (HEAD seen: 7ffb68b)
Task L-04: minor (deferred): demo today fixed 2026-11-02 vs real clock (README note); duplicated weekday helper; Timeline.drain re-sorts O(n² log n)
Task L-05: implemented (7ffb68b..4deac17: 99e7ecb feat, 4deac17 L-03 minors); review dispatched
Task L-05: complete (commits 7ffb68b..4deac17, review clean)
Task L-05: minor (deferred): results-page wrapper not prettier-formatted; roster fetch capped at 100 (no paging); roster error blocks matrix; studentId clear not tested
Task L-04: fix round 1 done (4deac17..dd269bf, real RED via scratch worktree, 3 minors fixed; missing-actor error untested); re-review dispatched
Task L-04: fix round 1/5 (4 addressed, 0 open — real RED, ClockService, actor error, LARGE idempotence; commits 4deac17..dd269bf)
Task L-04: complete (commits 4ddaee0..dd269bf, review clean)
Task L-04: minor (deferred): missing-actor error untested; partial run after teacher.l1 before LARGE not caught (theoretical)
Lane L-LEAD: all tasks complete (HEAD dd269bf)
Task M: Steps 1-5 dispatched (opus, main 3a1cbd0; CRs PORTAL-1/-2, REPORTS-1 + reports recharts mock). Step 6 controller-run.
Task M: Steps 1-5 done (3a1cbd0..c46da6a: merges 5514fa0/3722221/11e1e8a, CRs e7b4e0a/ba9c4af, recharts mock c46da6a). Full chain green: shared 102, api unit 44, web 492, e2e 871, merge-gate ok, fr-coverage 63/68 (W3 FRs covered). Smoke 16/17 PASS, T2a FAIL (attendance save bar under bottom nav at 375px, pre-existing W2).
Ruling R3: T2a (save bar hidden under mobile bottom nav) goes into the final fix wave, not deferred — Review Focus 4 (mobile 375 primary actions) binds W3 — cost if wrong: one small extra fix in W3.
Final review dispatched (opus, 0f9951b..c46da6a)
Final review: 3 Important (T2a save bar, FR-RPT-02 byStudent, academic empty state) + 7 minor/docs; deferred-minor triage: rest → W4. ONE fix wave dispatched (findings in final-findings.md, FIX_BASE c46da6a)
Final fix wave done (c46da6a..05ff5fc, 7 commits, full chain green: web 496, e2e 874; T2a smoke PASS real click); scoped re-review dispatched
Final fix wave: re-review all 10 addressed, no new breakage. Controller full-chain verification started.
Final fix wave: complete (commits c46da6a..05ff5fc, re-review clean). Controller full chain on 05ff5fc: EXIT 0 — shared 102, api unit 44, web 496 (37 files), api e2e 874 (60 suites), merge-gate ok, fr-coverage 63/68. Smoke 17/17 PASS (T2a fixed).
Remaining deferred minors → W4 per final-review triage (see handoff-wave4.md).
Wave 3 done: TASK.md W3 ticked, tag w3, pushed.
