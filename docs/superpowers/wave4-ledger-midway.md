# SDD ledger — plan: docs/superpowers/plans/2026-11-02-wave4-hardening-e2e.md

Spec: TASK.md W4, PRD.md NFR-01/02/05/06/07 + FR-AUD-01, RULES.md, docs/DECISIONS.md D1–D28, handoff-wave4.md, wave3-ledger.md, wave2-ledger.md. Base: main 7d87a02 (= w3 + plan). Plan approved by user ("làm tiếp wave4 đi").
Briefs: `brief.sh <ID>`. Common prompts rewritten for W4 (W3 copies deleted with W3 workspace).

## Preflight scan
| Pair / Task | Produces → Consumes | Finding |
|---|---|---|
| T0 ↔ T0b | ClockService/APP_CLOCK_START, dev-mongo MONGO_DATA_DIR, vite API_PROXY_TARGET → run.sh | ok, sequential on main |
| T0 ↔ H-01A/H-01B/H-04 | listRoutes(app) RouteInfo (roles, params, schemas) | ok |
| T0 ↔ H-02 | seed-large sessionsPerClass | ok |
| T0 ↔ L-05 | merge-gate.sh edited by both (test:security, fr-coverage --strict) | sequential (T0 first), ok |
| T0 ↔ L-06 | vite.config.ts edited by both (proxy vs coverage) | sequential, ok |
| T0b ↔ X-01..06, H-03 | fixtures (frozen signatures, D32) | ok |
| X-* ↔ H-03 | both run `pnpm e2e` on fixed ports 27027/3100/4173 in different worktrees | CONFLICT → R2 |
| X-04 ↔ L-04 | attendance page/matrix behaviour | L-04 changes matrix (class tab), X-04 uses take-attendance — distinct, ok |
| X-* / H-* ↔ L-07 | CRs → Lead fixes on L-LEAD | L-07 runs after lanes report CRs; may re-run at Task M |
| L-01 ↔ H-01B | teacherStudentIds widened (D38) vs student IDOR sweep | different role (T vs H), ok |
| L-02 ↔ L-03 | report DTO unchanged (rows filtered, 'none' row) | ok |
| L-05 ↔ all | renames FR titles in many test files (lead-owned) | lanes don't edit those files; ok |
| L-06 ↔ L-05/L-07 | coverage depends on final test set | L-06 after L-05; re-check at M |
| Each task self-consistency | T0, T0b, X-01..06, H-01A, H-01B, H-02, H-03, H-04, L-01..07, M | clean; H-02 Step 1 test file under test/security (owned) ok |

Ruling R1: three lanes run in parallel after T0+T0b (one implementer per lane at a time, own worktree) — user asks for swarm, same as W1–W3 — cost if wrong: merge conflicts at Task M.
Ruling R2: `pnpm e2e` uses fixed ports, so only one worktree may run it at a time; L-HARDENING order H-01A → H-01B → H-02 → H-04 → H-03, and H-03 runs only after L-E2E finished its runs (controller grants the "e2e ports" in the dispatch) — cost if wrong: H-03 waits a bit longer.
Ruling R3: Task 0 and 0b are committed directly on main (plan says so; same as W2/W3 Task 0) — cost if wrong: none, main is local until push.

## Progress
Task 0: impl dispatched (opus, BASE 7d87a02, on main)
Task 0: implemented (7d87a02..a53f9c2); concern: api e2e timeouts (0% CPU) never one clean run; added L-LEAD lane-owners entry; review dispatched; controller re-runs api e2e
Task 0: review Approved (pending controller api e2e run)
Task 0: minor (deferred): clock-override NestFactory test doesn't assert warn wiring; DECISIONS append-only rule for L-HARDENING not enforced by gate (check by hand at M); seed-large sessionsPerClass 100 → ~92% sessions future (no attendance) — H-02 must note in perf-report; test:coverage/perf placeholders — M must confirm D34 thresholds; seed-demo spec edited after RED (equivalent)
Ruling R4: api e2e 0%-CPU timeouts root cause = macOS idle/maintenance sleep during runs (pmset log, 121 sleep/wakes) — every long test/e2e/build run is wrapped in `caffeinate -i`; added to implementer contract — cost if wrong: none.
Controller: api e2e under caffeinate on a53f9c2 → 60/60 suites, 876/876 (EXIT 0).
Task 0: complete (commits 7d87a02..a53f9c2, review clean)
Task 0b: impl dispatched (opus, BASE a53f9c2, on main; e2e ports 27027/3100/4173 granted)
Task 0b: implemented (a53f9c2..de4fb33), 2 consecutive green pnpm e2e runs; concerns: CLOCK_START duplicated run.sh/fixtures, root typecheck skips e2e/ (add tsc -p e2e to merge gate at M), runs delete apps/api/dist; review dispatched
Task 0b: review Approved-with-Important (clock only on page fixture → context override + newClockedContext; root typecheck skips e2e) + 5 minors fixed pre-freeze; fix round 1 dispatched (HEAD seen: de4fb33)
Ruling R5: L-LEAD and L-HARDENING branched from de4fb33 while 0b fix round runs — they don't consume e2e fixtures (H-03 runs last, after rebase/merge of 0b fix) — cost if wrong: small merge of e2e/ + root package.json at M.
Worktrees: lc-L-LEAD, lc-L-HARDENING from de4fb33. L-01 impl + H-01A impl dispatched (parallel)
Task 0b: fix round 1 done (de4fb33..153dc70; 2 green pnpm e2e runs 5/5); re-review dispatched
Task 0b: fix round 1/5 (7 addressed, 0 open — context clock + newClockedContext, typecheck e2e, CLOCK_START single source, signal/readiness, loginAs expectHome, uniquePhone; commits de4fb33..153dc70)
Task 0b: complete (commits a53f9c2..153dc70, review clean). Fixture signatures frozen (D32) incl. additive newClockedContext + loginAs opts.
Worktree lc-L-E2E from 153dc70. X-01 impl dispatched (e2e ports granted to L-E2E)
Task H-01A: implemented (de4fb33..d7d1942), 257/257 security; CR L-HARDENING-1 (CORS reflects WEB_ORIGIN to any origin; 2 it.failing) → L-07; review dispatched
Ruling R6: rate-limit test spreads 11 failed logins over 11 accounts on one IP — the throttle is per IP (brief "cùng IP"); a single account would hit the 5-failure lockout (423) first and mask it — cost if wrong: none.
Task H-01B: impl dispatched (opus, BASE d7d1942) concurrently with H-01A read-only review (different files)
Task H-01A: complete (commits de4fb33..d7d1942, review clean). ⚠️ checked: APP_GUARD global (see grep).
Task H-01A: minor (deferred): hash sweep only asserts <500 for 9 non-2xx routes (allow-list them); earlier 10 login responses' code not asserted; static-routes misses factory-built dynamic controllers (caught by equality test)
Task L-01: implemented (de4fb33..4e962d5), 10/10 new, api e2e 886; concern: D38 status set misses real transfer A→B
Ruling R7: D38 teacherStudentIds status set = ENROLLED|COMPLETED|TRANSFERRED (classId ∈ teacherClassIds) OR classHistory ∩ teacherClassIds — D38's stated intent ("GV lớp cũ vẫn mở được hồ sơ HV đã chuyển đi mà họ thấy trong kết quả lớp") binds over its literal status list; update D38 text in DECISIONS — cost if wrong: old-class teachers see transferred students' profiles (already visible in their /results).
Task L-01: profile enrollments list for old-class teacher still classId-only — minor (deferred), leave.
Task L-01: R7 change sent to implementer before review
Task X-01: implemented (153dc70..9a4d5ac), 1 passed, inversion RED; review dispatched
Task X-02: impl dispatched (sonnet, BASE 9a4d5ac)
Task X-01: complete (commits 153dc70..9a4d5ac, review clean)
Task X-01: minor (deferred): goto instead of nav clicks; student-home arrival only "h1 ≠ Đổi mật khẩu" (use expectHome); no read-back of cancelled duplicate / mustChangePassword cleared; unused phone field in type
Task H-01B: implemented (d7d1942..263b8f5), 30/30, 4 mutation REDs; seedTwoStudents(conn, login) signature (needs login for real token); no IDOR hole; review dispatched
Lead item for L-07: /payments/:id/receipt.pdf 403/404 error body served with Content-Type application/pdf (should be JSON) — from H-01B, no CR filed.
Task H-02: impl dispatched (opus, BASE 263b8f5) concurrently with H-01B review
Task H-01B: complete (commits d7d1942..263b8f5, review clean)
Task H-01B: minor (deferred): B ids valid only by construction (add B-own 2xx call); staff-only routes could require 403 not {403,404}; notificationId unused (comment); bodyOf unused text? field. receipt.pdf content-type → already a Lead item for L-07.
Task L-01: R7 applied (4e962d5..f4dafbe), 11/11, api e2e 886+fixed old TRANSFERRED-excluded assertion; side effect: teacher invoice access widens to transferred-out students; review dispatched (opus)
Task L-02: impl dispatched (sonnet, BASE f4dafbe) concurrently with L-01 review
Task L-02: implemented (f4dafbe..411317b), 77 passed; review dispatched
Ruling R8: admissions "Khác" row uses courseId 'none' + courseName 'Khác' (DTO has no `key` field; plan wording slip) — no shared change; L-03 FE must not send 'none' as a courseId filter/link — cost if wrong: small DTO rename later.
Task L-03: impl dispatched (sonnet, BASE 411317b) concurrently with L-01/L-02 reviews
Task X-02: implemented (9a4d5ac..a96fd88), 1/1 + inversion; review dispatched
Task X-03: impl dispatched (sonnet, BASE a96fd88)
Task L-02: review Approved code-wise; controller confirmed ⚠️ RED is summarised not raw → Important; fix round 1 dispatched (raw RED via scratch worktree, money inversion, R8 doc note) (HEAD seen: 411317b)
Task L-01: review Needs fixes (status filter on classHistory branch drops RESERVED/WAITING/CANCELLED students teacher still sees in /results; invoices widening untested; explain test vacuous; title mismatch; migration null classHistory; ARCHITECTURE.md:157 stale)
Ruling R9 (refines R7): profile/list scope teacherStudentIds = (status ∈ {ENROLLED,COMPLETED,TRANSFERRED} AND classId ∈ T) OR (status ≠ CANCELLED AND classHistory ∩ T ≠ ∅) — covers reserve/waiting window, keeps R17 precedent that CANCELLED doesn't count; invoices (FR-FEE-06 "lớp mình") use the pre-R7 narrower set (ENROLLED|COMPLETED with classId ∈ T) via a separate helper, pinned by a fees test — cost if wrong: old-class teacher sees/doesn't see a cancelled student's profile.
Task L-01: fix round 1 dispatched (HEAD seen: f4dafbe)
Task X-02: complete (commits 9a4d5ac..a96fd88, review clean)
Task X-02: minor (deferred): add toBeInViewport/elementFromPoint before confirm click (Review Focus 5 strictness); placement test lookup by teacher+date not runId-unique; grading 6.5/A2 not read back via API
Task L-03: implemented (411317b..065bf1d; diff from 6eca6a8 since L-02 docs commit interleaved), web 507/507; review dispatched
Ruling R10: chart palette --chart-1..5 (light #2563eb #d97706 #059669 #7c3aed #e11d48 + lighter dark variants) accepted though DESIGN.md has no chart palette — contrast is checked by H-03 axe in light+dark — cost if wrong: retune 10 CSS values.
Task L-04: impl dispatched (sonnet, BASE 065bf1d) concurrently with L-03 review and L-01 fix (L-04 = apps/web home/attendance + lib/use-vn-today)
Task L-03: complete (commits 6eca6a8..065bf1d, review clean). Task M smoke: verify recharts resolves var(--chart-N) visually in light+dark.
Task L-03: minor (deferred): TEACHER guard test doesn't assert home rendered; R8 link test can't fail; hex regex misses 3-digit/rgb and chart-3; no test that tokens exist in both themes; range error text not via error-messages.ts
Task L-02: fix round 1/5 (3 addressed, 0 open — raw RED, money inversion, D39 note; commits 411317b..6eca6a8). Re-review new Minor: shared AdmissionsReportDto rows[].courseId is zObjectId but API emits 'none' (R8 premise "DTO is string" was wrong); no GREEN log for fix round.
Ruling R8 (amended): shared schema rows[].courseId = z.union([zObjectId, z.literal('none')]) with a schema test — keep contract honest — cost if wrong: none.
Task L-02: fix round 2 dispatched (shared schema union + test + GREEN log)
Task L-04: implemented (a8ffc5c), web 512; deviation: useVnToday hook written before its RED (import-fail RED only); 3 other behavioural REDs ok; review dispatched
Task L-01: fix round 1 done (2139797), 177/177 targeted; re-review dispatched (opus)
Task L-02: fix round 2/5 (2 addressed, 0 open — shared courseId union + test, GREEN log; commit 1d99ad1)
Task L-02: complete (commits f4dafbe..1d99ad1 interleaved: 411317b, 6eca6a8, 1d99ad1; review clean)
Task L-02: minor (deferred): 1d99ad1 trailer says "Claude Sonnet 5.5" instead of the required trailer (no history rewrite)
Task L-04: complete (commit a8ffc5c, review clean)
Task L-04: minor (deferred): useVnToday unmount-cleanup test never shown failing; re-arm relies on setToday value change (early fire → no re-arm); retry button not disabled while refetching
Task L-01: fix round 1/5 (6 addressed, 0 open — R9 scope, narrow invoices helper + fees test, real explain test, title, null guard, docs; commit 2139797)
Task L-01: complete (commits de4fb33..2139797 interleaved: 4e962d5, f4dafbe, 2139797; review clean)
Task L-01: minor (deferred): migration (row.classHistory ?? []).map throws on non-array scalar; common-services test "CANCELLED/RESERVED không" misstates R9 (carried into L-05); profile enrollments list classId-only
Task L-05: impl dispatched (sonnet, BASE a8ffc5c)
Task X-03: implemented (a96fd88..86c8c36), 1 passed + inversion; GET /sessions has no meta.total → counts data.length over the month (plan slip, accepted); review dispatched
Task X-04: impl dispatched (sonnet, BASE 86c8c36; e2e ports L-E2E)
RATE LIMIT 5h hit (resets 20:40 VN): X-04 impl stopped mid-work (saved); others likely too — resume via SendMessage after reset
Limit reset: resumed X-04, L-05, H-02 impls and X-03 review via SendMessage
Task X-03: complete (commits a96fd88..86c8c36, review clean)
Task X-03: minor (deferred): teacher view match by class code only (not tied to 03/11 slot); read-back could assert start dates; .last() on day-picker relies on popover unmount; option order by index
Task H-02: implemented (263b8f5..70200c0), perf harness works; NFR-02 FAILS: /attendance p95 2.1–8.4s, COLLSCAN on 7/10 endpoints. CR L-HARDENING-2 (5 indexes), L-HARDENING-3 (attendance join-before-filter; results $or at pipeline start). Review dispatched.
Ruling R11: list endpoints whose effective filter is empty count with estimatedDocumentCount (no COLLSCAN); any non-empty filter uses countDocuments on an indexed filter — cost if wrong: approximate total on unfiltered lists (exact in practice without orphaned docs).
Ruling R12: /attendance stops joining all rows: attendance records carry denormalized session `startAt` (+ classId already) set at write time and backfilled by a migration; indexes {classId,startAt}, {studentId,startAt}; /attendance filters + paginates attendance directly by indexed range, joining sessions only for the returned page — cost if wrong: one denormalized field to keep in sync (sessions are not rescheduled after attendance exists? — L-07 must handle session time edits by updating attendance.startAt in the same transaction).
Task H-04: impl dispatched (sonnet, BASE 70200c0) concurrently with H-02 review
L-07: queued after L-05 (CRs: L-HARDENING-1 CORS, -2 indexes, -3 query shapes + R11/R12; receipt.pdf error content-type)
Task X-04: implemented (86c8c36..2dfe0ac), 1/1 + elementFromPoint inversion; review dispatched
Task X-05: impl dispatched (sonnet, BASE 2dfe0ac)
Task H-02: review Needs fixes (EQ_LOOKUP/foreign-side scan invisible; 0-reads vacuous pass); fix round 1 dispatched (HEAD seen: 70200c0)
Task H-02: minor (deferred): median lower-middle; exitCode lost if close throws; perf-report Run 2 to refresh at M
Task X-04: complete (commits 86c8c36..2dfe0ac, review clean). Task M: run full pnpm e2e twice (Review Focus 4).
Task X-04: minor (deferred): reopen via goto not home card; could add toBeInViewport
Task L-05: implemented (a8ffc5c..b96e003), fr-coverage --strict 68/68, api e2e 62/906; audit spec green first (all areas audit) + inversion; review dispatched
Task L-07: impl dispatched (opus, BASE b96e003): CR L-HARDENING-1/-2/-3 + R11/R12 + receipt.pdf error content-type; concurrently with L-05 review. L-06 after L-07.
Task H-04: implemented (70200c0..3efce10), openapi 8/8; 4 perf-helpers failures are H-02 in-progress RED (not H-04); review dispatched
Task H-04: complete (commits 70200c0..3efce10, review clean). ⚠️ migrate:class-history script exists on lane/L-LEAD (checked) → present after merge.
Task H-04: minor (deferred): prod-404 openapi test has no flip proof (add dev-mode positive control); x-roles/security casts loose; responses default-envelope only
Task L-05: review Needs fixes (over-expanded FR ranges in w2-wiring + enrollments-lifecycle titles; raw inversion output missing); fix round 1 dispatched (HEAD seen: b96e003). Note: common-services fixture change was controller-instructed.
Task H-02: fix round 1 done (95171d9), perf-helpers 15/15; perf-report method line to refresh at M; re-review dispatched
Task L-05: fix round 1 done (8da9c13), 68/68, 40/40 focused; re-review dispatched
Task H-02: fix round 1/5 (2 addressed, 0 open — foreign-side lookup scans, vacuous-read guard; commit 95171d9)
Task H-02: complete (commits 263b8f5..95171d9, review clean). Harness gate for M; NFR-02 still failing until L-07. perf-report.md method + numbers refresh at M.
L-HARDENING remaining: H-03 (waits for L-E2E e2e ports, R2)
Task X-05: implemented (2dfe0ac..957ca25), 1/1 + inversion; review dispatched
Ruling R13: grade "Xác nhận" with every score filled confirms without a dialog (dialog only for missing scores) — accepted: DESIGN §principle 3 requires dialogs for destructive actions, and confirming grades is amendable (D16), not destructive; X-05 follows the real UI — cost if wrong: add a ConfirmDialog later.
Task X-06: impl dispatched (sonnet, BASE 957ca25)
Task L-05: fix round 1/5 (I1, I2, M1–M3 addressed; M4 Minor evidence-only open — inversion paste abridged, GREEN focused-run output not recorded; commit 8da9c13)
Task L-05: complete (commits a8ffc5c..8da9c13, review clean on Critical/Important). fr-coverage --strict 68/68 confirmed by re-reviewer run.
Task L-05: minor (deferred): M4 abridged raw evidence (minor, not looped); grades.service.ts:327 logs entity 'grade' lowercase vs Models.Grade at :275 (inconsistent audit entity name)
Task X-05: complete (commits 2dfe0ac..957ca25, review clean)
Task X-05: minor (deferred): average value not compared; section.last() locator; UI draft-hidden check not inverted; `extra` untyped
Task X-06: implemented (957ca25..add72e2), full pnpm e2e 11/11 twice; local formatVnd copy (e2e can't import @lc/shared); review dispatched
Controller: merged main (153dc70, 0b fix round) into lane/L-HARDENING → d50fa3a so H-03 has newClockedContext.
Task H-03: impl dispatched (sonnet, BASE d50fa3a); e2e ports granted to L-HARDENING (L-E2E done running).
Task X-06: complete (commits 957ca25..add72e2, review clean). ⚠️ RED checked by controller: inversion with file:line + expected/received present (abridged but specific) — accepted.
Task X-06: minor (deferred): local formatVnd copy lacks negative handling → shared e2e/fixtures/money.ts at M; card locator by DOM nesting
Ruling R14: export filename — web client (reports-page.tsx:32 `${from}_${to}`) is aligned to the API's `bao-cao-<type>-<from>-<to>` (hyphen, matches brief + reports-export e2e) at Task M, and X-06 expectation updated — cost if wrong: none (cosmetic).
Lane L-E2E: all tasks complete (HEAD add72e2)
Task L-07: implemented (8da9c13..8cb264e: CORS, receipt json errors, indexes+R11, R12 attendance startAt + results prefilter, status doc); api unit 56, e2e 939; perf (scratch harness copy) NFR-02 PASS, all p95 < 43ms, 0 COLLSCAN. Task M notes: explain.ts must treat estimatedDocumentCount as read (patched copy saved as L07-explain-patched.ts), flip 2 it.failing CORS tests, migrate:attendance-start-at in README. Review dispatched (opus).
Task L-06: impl dispatched (sonnet, BASE 8cb264e) concurrently with L-07 review
Task L-07: review Needs fixes (take() stale startAt from pre-txn read; legacy rows without startAt → 500 on /attendance; deploy note understated); fix round 1 dispatched (HEAD seen: 8cb264e) with M1 (cancelled $nin bounded + fixture), M2 (scoped total test), M3 (comment)
Task L-07: minor (deferred): attendances {studentId, createdAt} index maybe redundant; migration vs concurrent reschedule (low-traffic note). ⚠️ CORS commit 0060773 outside package range — reviewed separately OK. Fixed-in lines in L-07-status.md accepted (copy at M).
Task H-03: implemented (d50fa3a..d1eb63b), 21 a11y tests, 18 test.fail tied to CR L-HARDENING-4..7 (4: no runtime dark mode — .dark CSS purged + nothing sets class; 5: light contrast muted-fg 4.48, success badge 2.7; 6: dark contrast on primary/destructive; 7: /reports tab aria-controls → missing panel). Review dispatched.
Ruling R15: dark mode follows the OS `prefers-color-scheme` (a small theme effect toggles `.dark` on <html>, live on change); no manual toggle in W4; `.dark` token block must survive the production build — cost if wrong: add a toggle later.
CRs L-HARDENING-4..7 → L-07 second batch (after L-07 fix round 1).
Ruling R15 (amended per DESIGN.md:30 'theo hệ thống, có nút chuyển trong menu người dùng'): default follows prefers-color-scheme live; user-menu toggle (Hệ thống / Sáng / Tối) persisted in localStorage (try/catch); .dark token block survives the production build — cost if wrong: none (spec-mandated).
Task H-03: review Needs fixes (dark forced via class instead of emulateMedia/app mechanism; test.fail accepts any failure); fix round 1 dispatched (HEAD seen: d1eb63b), e2e ports granted
Task L-07: fix round 1 done (47eed21, feef5ee), 190/190 targeted; reports-attendance fixture also made realistic; re-review dispatched (opus)
Task L-07: fix round 1/5 (5 addressed, 0 open — in-txn startAt, legacy fallback, bounded cancelled distinct, scoped total test, comment; commits 47eed21, feef5ee)
Task L-07 (batch 1: CR L-HARDENING-1..3 + receipt): complete (commits 8da9c13..feef5ee, review clean)
Task L-07: minor (deferred): update() upsert writes startAt from pre-txn read (taken sessions locked → low risk); report vs summary cancelled-rule divergence only for impossible data; early-window re-check untested
Task L-07 batch 2 (CR L-HARDENING-4..7 a11y/dark mode) queued after H-03 fix round finalizes CR 4 locators.
Task H-03: fix round 1 done (47130a5): emulateMedia, CR4_OPEN gate, exact KNOWN rule sets per screen/mode; re-review dispatched
Task L-07 batch 2 (CR L-HARDENING-4..7) dispatched (sonnet, lane/L-LEAD) concurrently with L-06
Task H-03: fix round 1/5 (2 addressed + minors, 0 open; commit 47130a5)
Task H-03: complete (commits d50fa3a..47130a5, review clean). Task M: flip CR4_OPEN=false + remove KNOWN entries as CRs 4–7 are fixed; harden darkRuleServed to require a token declaration; refresh a11y-report counts.
Lane L-HARDENING: all tasks complete (HEAD 47130a5)
Task L-07b: implemented (3aee0dd, cad6351): theme (system/light/dark, live OS, localStorage), safelist dark, AA tokens, reports TabsContent; web 519; real verification = a11y e2e flip at M; review dispatched
Task L-06: implemented (1ebf0fa): thresholds already met (api 98.89% lines, web 95.33%); config only; no threshold RED possible (characterisation); theme.test flake seen once under load; review dispatched
Note: L-06 agent's kill of a hung jest (pid 9346) was denied by the permission system — controller does NOT kill it on the agent's behalf; surfaced to user.
Task L-07b: review Needs fixes (no pre-paint theme apply; dark primary hover contrast 3.7–4.4); fix round 1 dispatched (HEAD seen: cad6351)
Task L-06: review Needs fixes (no threshold-FAIL proof: raise to 99.9 → FAIL raw → revert, both apps); fix round 1 queued until L-07b fix round finishes (same worktree, avoid contention)
Task L-06: minor (deferred): --forceExit hides open handles (follow-up --detectOpenHandles); root testTimeout 120000 also on unit project
Task L-07b: fix round 1 done (2c68f76), web 523; re-review dispatched. Task L-06: fix round 1 dispatched.
Task L-07b: fix round 1/5 (2 addressed + 4 minors, 0 open — pre-paint script, dark hover ≥5.9:1 computed by reviewer; commit 2c68f76)
Task L-07b: complete (commits 3aee0dd..2c68f76, review clean)
Task L-07b: minor (deferred): hover contrast not test-locked; boot script lacks matchMedia guard (harmless)
Task L-06: fix round 1 done (643ccc5 comment; threshold 99.9 FAIL proof both apps; one clean pnpm coverage exit 0: api 98.89, web 95.33); re-review dispatched
Task M: Steps 1-5 dispatched (opus, main 153dc70) with carry list task-M-carry.md; Step 6 controller-run
Task L-06: fix round 1/5 (1 addressed, 0 open; commit 643ccc5)
Task L-06: complete (commits 8cb264e..643ccc5 interleaved: 1ebf0fa, 643ccc5; review clean)
Task L-06: minor (deferred): report lacks raw log paths/exit codes; forceExit comment asserts an unverified cause
Lane L-LEAD: all tasks complete (HEAD 643ccc5)
Task M: Steps 1-5 done (merges 5b3cd7b, db51bfd, 67f33e0; 8945ce9 a11y light status tokens; cc3288e carry-overs). Final gate all exit 0: shared 103, api unit 56, web 531, api e2e 942, security 311, fr 68/68, coverage api 98.89 / web 95.33, merge-gate.test ok, pnpm e2e 34/34 twice, perf p95 ≤ 19.3ms 0 COLLSCAN. Smoke 5/5. Concern: light destructive/warning/info tokens darkened (visible colour change) — final review to confirm. Minor smoke: finance y-axis "160.000k"; /reports default "Tháng này" empty early in month.
Final review dispatched (opus, w3..HEAD)
Final review: 0 Critical, 1 Important (NODE_ENV fail-open guards), minors; ONE fix wave dispatched (final-findings.md, FIX_BASE cc3288e)
Final fix wave done (cc3288e..3325b65); gate green per report (security 319, web 534, e2e 942, pnpm e2e 34); re-review dispatched
Final fix wave: re-review all 4 addressed, no new breakage. Controller merge-gate verification started on 3325b65.
STOPPED by user request 2026-11-02 before controller gate verification/tag/push. Handoff: docs/superpowers/handoff-wave4-final.md
