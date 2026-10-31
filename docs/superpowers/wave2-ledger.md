# SDD ledger — plan: docs/superpowers/plans/2026-10-31-wave2-domain-lanes.md

Spec: PRD.md, BACKEND_SCHEMA.md, DESIGN.md, ARCHITECTURE.md, RULES.md, TASK.md (W2), docs/DECISIONS.md. Base: main 3bec359 (= w1 + handoff + plan).
Briefs: `brief.sh <ID>` (header + lane intro + task). Common prompts: common-implementer.md / common-reviewer.md / common-re-reviewer.md.

## Preflight scan
| Pair / Task | Produces → Consumes | Finding |
|---|---|---|
| T0 ↔ E-03/E-04/F-01 | InvoiceCreator.createForEnrollment → ObjectId\|null (D11) | ok, T0 before lanes |
| T0 ↔ G-04/F-04 | FEES_OUTSTANDING 403, PdfService, pdfText | ok |
| T0 ↔ AT-01/AT-02/AT-05 | SessionAttendanceDto += takenAt/takenByName/editable/roster.history/roster.absenceRate | AT-01 must fill absenceRate before AT-04 builds warningFlags → R2 |
| T0 ↔ G-02/G-05 | AssessmentGradesDto (left) | ok |
| T0 ↔ E-02/E-05 | PlacementTestDto labels | ok |
| T0 ↔ all FE | status groups, notification targets, msw slot files | ok |
| E-01 ↔ E-02/E-05/E-06 | enrollments.controller + GET /enrollments?status&courseId&studentId (M,S) | ok sequential in lane |
| E-02 ↔ S (W1) | SCHEDULE_CONFLICT_CHECKER needs explicit ScheduleModule import | carried in lane intro |
| E-03 ↔ E-04 | AssignmentService.seat | ok |
| E-03/E-04 ↔ F-01 | invoiceId copy on transfer, chain lookup | consistent (D11) |
| E-04 ↔ CL-01 (W1) | class.finished payload {classId, at, actorId} = ClassFinishedPayload | ok |
| AT-01 ↔ AT-04 | AttendanceRecorded event + warningFlags | R2 |
| G-01 ↔ G-03 | lockedAt/isLocked (D16) | ok |
| G-04 ↔ F-04 | OUTSTANDING_CHECKER fake in lane (D18), real in M | ok |
| E-06 ↔ classes FE (W1) | open classes list | classes/hooks.ts may lack list hook → E-06 uses own api.ts call (plan allows) |
| M ↔ CL-03 (W1) | roster flag field | plan says `absenceWarning`, ClassStudentDto field is `warning` → R3 |
| Each task self-consistency | T0, E-01..06, AT-01..06, G-01..06, F-01..04, F-06, M: tests vs code vs files | clean after plan self-review edits (AT-02 not-taken = 422 INVALID_STATUS_TRANSITION) |

Ruling R1: lanes run in parallel (one implementer at a time per lane, own worktree/branch, ownership gate) — user asked for swarm, same as W1 R1 — cost if wrong: merge conflicts at Task M.
Ruling R2: AT-01 fills SessionAttendanceDto.roster[].absenceRate with absenceRate() over the student's records in that class (simple query); AT-04 replaces it with warningFlags — cost if wrong: small refactor in AT-04.
Ruling R3: Task M asserts ClassStudentDto.warning (existing field), not `absenceWarning` — plan wording slip — cost if wrong: none.

## Progress
Task 0: dispatched impl (BASE 3bec359)
Task 0: implemented (commits 3bec359..2552493), review clean (sonnet)
Task 0: minor (deferred): TASK.md W2 boxes not marked [~]; double blank lines pdf.service.ts / grades.ts, import order common.module; pdfmake access policies are process-global (L-FEES note: no images/URLs in receipts)
Ruling R4: controller untracked committed .DS_Store files + .gitignore (housekeeping, no code) — cost if wrong: none.
Lanes started: L-ENROLL 4cd74ae, others 51f8701 (51f8701 = docs-only commit on main not made by controller: handoff CI note). Full api e2e on main 442/442 after Task 0.
Task 0: complete (commits 3bec359..4cd74ae, review clean)
Lane workers: E-01 impl a0e6fc84 (BASE 4cd74ae), AT-01 impl a629881a, G-01 impl a6867e68, F-01 impl a11a99f9 (BASE 51f8701) — dispatched in parallel
Task F-01: implemented (51f8701..739304b). Concerns: voidReason not in invoice schema (contract request L-FEES-1, strict:false write); E11000 relabelled TransientTransactionError for retry.
Ruling R5: invoices get NO voidReason field (BACKEND_SCHEMA §2.16 has none; only payments do) — void reason goes into the audit log (AuditService.log, entity 'invoice', same txn); L-FEES-1 contract request rejected; strict:false write must go — cost if wrong: reason only visible in audit.
Task E-01: implemented (4cd74ae..e3c57ec)
Task F-01: review Needs fixes (R5 voidReason/audit, D11 invoiceId branch untested, E11000 retry untested); fix round 1 dispatched (HEAD seen: 739304b)
Task E-01: review dispatched
Task G-01: implemented (51f8701..4e3e7ad); review dispatched
Task E-01: complete (commits 4cd74ae..e3c57ec, review clean)
Task E-01: minor (deferred): change to same course still writes history+audit; unknown sort silently defaulted; import order/long lines; no M PATCH / malformed studentId tests
Task G-01: complete (commits 51f8701..4e3e7ad, review clean)
Task G-01: minor (deferred): float weight sum epsilon (33.3+33.3+33.4); assertClassScope write flag indirect; test reaches SettingsService cache via cast
Task AT-01: implemented (51f8701..eab9ecd). Concerns: errors.ts ATTENDANCE_INCOMPLETE=422 vs PRD 400 (lane passes explicit 400); editable false for MANAGER; takenByName from first record.
Ruling R6: ATTENDANCE_INCOMPLETE is 400 (PRD FR-ATT-02 + TASK) — Lead fixes errors.ts mapping in Task M and the lane's explicit status override is then removed — cost if wrong: none.
Ruling R7: SessionAttendanceDto.editable = false for MANAGER (cannot write attendance, D16) — refines R2 — cost if wrong: M sees read-only screen (correct per roles).
Ruling R8: InvoiceCreator void audit uses a fixed system actor (contract carries no actor); the human actor is in the enrollments withdraw audit of the same txn — cost if wrong: invoice audit row shows 'system'.
Task F-01: fix round 1/5 (3 addressed, 0 open — R5 audit void, D11 invoiceId branch test, E11000 retry test; commits 739304b..b3af755)
Task F-01: complete (commits 51f8701..b3af755, review clean)
Task F-01: minor (deferred): dead `orig` binding in E11000 test; lock key per enrollment not chain root; RED was compile-only
Task AT-01: review Needs fixes (swallowed listener error, + cheap minors: dup studentId, editable on CANCELLED, dedupe event ids, 2 roster tests); fix round 1 dispatched (HEAD seen: eab9ecd)
Ruling R9: first-time PUT has no teacher time window (only startAt−15'); editable=true for T on an untaken session is correct — D16 window applies to edits only — cost if wrong: GV can take attendance late.
Task G-02: implemented (4e3e7ad..HEAD). Concerns: score null ignored; post-confirm PUT allowed for roster students without a grade.
Ruling R10: in PUT before confirm, `score: null` clears the stored score (null = chưa nhập, BACKEND_SCHEMA §2.15) — ignoring it would make a typo uncorrectable in a draft — cost if wrong: small.
Ruling R11: after confirm, PUT may add a grade (isDraft=false) only for roster students with no grade yet (late joiners); existing grades need PATCH with reason — cost if wrong: late joiner gets grade without reason trail.
Task G-02: review Needs fixes (R10 null-clear + missing calc, Promise.all on txn session, silent notify catch, RED not pasted); fix round 1 dispatched (HEAD seen: ec77f31)
Task E-02: implemented (e3c57ec..3a88235); choices: complete when all candidates have score+level; PATCH only status CANCELLED (others? check); extra lock keys lock:placement-enrollment:<id>, lock:placement:<id>
Task AT-01: fix round 1/5 (5 addressed, 0 open — logger, dup studentId, editable CANCELLED, dedupe, tests; commits eab9ecd..d99bf38)
Task AT-01: complete (commits 51f8701..d99bf38, review clean)
Task AT-01: minor (deferred): uppercase-hex ObjectId evades dup check (still rejected as not in roster); terse Set idiom; takenByName from first record; RED summarised not pasted
Task F-02: implemented (b3af755..a64cbfb); review dispatched. E-02 review dispatched. AT-02 impl dispatched (BASE d99bf38).
Ruling R12: DISCOUNT_INVALID is 400 (TASK F-02) — Lead fixes errors.ts in Task M together with ATTENDANCE_INCOMPLETE (R6); lanes' explicit 400 removed then — cost if wrong: none.
Task F-02: review Needs fixes (RED not pasted; + statusFor→invoiceStatus in mapper for F-03, shared discount type, scoped deleteMany); fix round 1 dispatched (HEAD seen: a64cbfb)
Task E-02: review Needs fixes (level drift on score:null re-PUT; + R13, skip lock, score-after-scope, RED paste); fix round 1 dispatched (HEAD seen: 3a88235)
Ruling R13: placement test COMPLETED check ignores candidates whose enrollment left PENDING_PLACEMENT other than via this test (skipped/cancelled) — otherwise a test can never complete — cost if wrong: a test completes with an ungraded skipped candidate (intended).
Task G-02: fix round 1/5 (3 addressed, 1 open — raw RED paste; commits ec77f31..cbe95fa); round 2 (report-only) dispatched
Task G-02: fix round 2/5 (1 addressed, 0 open — raw RED pasted, report-only, verified by controller: section present with failing jest lines)
Task G-02: complete (commits 4e3e7ad..cbe95fa, review clean)
Task G-02: minor (deferred): no test for notify-failure logging; R11 late-joiner gets no GRADES_PUBLISHED; no concurrent confirm-vs-draft test
Task G-03: impl dispatched (BASE cbe95fa)
Task E-02: fix round 1/5 (5 addressed, 0 open — level drift, R13, skip lock, scope-first, RED; commits 3a88235..b3b8759)
Task E-02: complete (commits e3c57ec..b3b8759, review clean)
Task E-02: minor (deferred): R13 N+1 findById in txn; score check now inside txn; no concurrency test for skip vs add-candidate; candidates POST returns 200
Task E-03: impl dispatched (BASE b3b8759)
Task F-02: fix round 1/5 (3 addressed, 0 open — RED pasted, invoiceStatus in mapper, shared Discount type; commits a64cbfb..5832147)
Task F-02: complete (commits b3af755..5832147, review clean)
Task F-02: minor (deferred): pending-list test meta.total==data.length fragile past 20 rows; approval re-validation/parallel decisions/notify-failure untested
Task F-03: impl dispatched (BASE 5832147)
Task AT-02: implemented (d99bf38..3db6392). Concern: attendance schema history.from required but null written via updateOne.
Ruling R14: Lead makes attendance schema history.from nullable (shared AttendanceHistoryEntry already nullable) in Task M — cost if wrong: hydrated save would fail validation.
Task AT-02: complete (commits d99bf38..3db6392, review clean)
Task AT-02: minor (deferred): no recordedBy-unchanged / emit assertions; untaken check outside txn; duplicate emit try/catch in take (use emitRecorded)
Task F-03: implemented (5832147..7834e6e); review dispatched (opus)
Task E-03: implemented (b3b8759..9daf794); review dispatched (opus)
Task F-03: complete (commits 5832147..7834e6e, review clean)
Task F-03: minor (deferred → carried into F-04 dispatch): creator lock key lock:invoice:<enrollmentId> collides in prefix with per-invoice key, voidForEnrollment bumps no per-invoice lock; voided invoice with pending discount still in pending list. Others: race/audit/paidAt tests, recordedBy '' fallback, RED paraphrased
Task F-04: impl dispatched (BASE 7834e6e, carries F-03 minors a–c)
Task E-03: review Needs fixes (seat() reshaped for E-04: no level check, caller bumps locks, returns ClassDoc; + Logger, tests); fix round 1 dispatched (HEAD seen: 9daf794)
Ruling R15: transfer enforces same course + open class + free seat, not level (FR-CLS-08 silent, TransferEnrollmentInput has no overrideReason) — cost if wrong: staff can transfer across levels without a reason.
Task AT-03: implemented (3db6392..a6b0d92); review dispatched
Task AT-03: complete (commits 3db6392..a6b0d92, review clean)
Task AT-03: minor (deferred): CANCELLED-session filter is a deliberate extra (controller dispatch asked for it); H scope edge tests; mapper '' fallbacks
Task AT-04: impl dispatched (BASE a6b0d92). Task G-03: implemented (cbe95fa..37f1166); review dispatched
Task G-03: complete (commits cbe95fa..37f1166, review clean)
Task G-03: minor (deferred → carried into G-04): GradeDto mapped inline in amendGrade + duplicated history mapping (move to toGradeDto); audit assertion weak; settings read outside txn
Task E-03: fix round 1/5 (2 addressed, 0 open — seat() reshaped, minors; commits 9daf794..4d77486)
Task E-03: complete (commits b3b8759..4d77486, review clean)
Task E-03: minor (deferred): rollback test spy restore not in finally; duck-typed session check; setMaxListeners(50) in test
Task G-04: impl dispatched (BASE 37f1166). Task E-04: impl dispatched (BASE 4d77486)
Task F-04: implemented (7834e6e..2f3e634); review dispatched
Task F-04: complete (commits 7834e6e..2f3e634, review clean)
Task F-04: minor (deferred): surcharge optional enrollmentId/courseId/classId not existence/ownership-checked; teacher out-of-scope ?studentId test; void-vs-payment race untested; duplicated sort whitelist
Rate-limit interruption: F-06, G-04, AT-04, E-04 impl stopped mid-work (work saved) — resumed via SendMessage after reset
Task E-04: implemented (4d77486..4ed60fe); review dispatched (opus)
Ruling R16: transfer into the same class → 400 VALIDATION_FAILED fields.toClassId (plan's "422" was a slip; VALIDATION_FAILED is 400) — cost if wrong: none.
Ruling R17: ClassFinishedListener writes no audit row (system follow-up of an audited class PATCH; enrollment history records by=actorId) — cost if wrong: COMPLETED transitions only in history, not audit_logs.
Task G-04: implemented (37f1166..3aa371e); review dispatched
Task AT-04: implemented (a6b0d92..b6d20f9); review dispatched
Task G-04: complete (commits 37f1166..3aa371e, review clean)
Task G-04: minor (deferred → carried into G-05): H history scope re-implemented inline instead of ScopeService.studentClassIds('history'); long import line; dead `?? ''`; pagination/M studentId filter tests
Task G-05: impl dispatched (BASE 3aa371e, carries G-04 minor: H scope via ScopeService)
Task AT-04: complete (commits a6b0d92..b6d20f9, review clean)
Task AT-04: minor (deferred → carried into AT-05): warning insert + notify not atomic (notify failure → never re-sent; delete row on notify failure); per-student failure aborts loop. Others: no-userId / race tests
Task AT-05: impl dispatched (BASE b6d20f9, carries AT-04 minors)
Task E-04: review Needs fixes (RESERVED/WAITING→CANCELLED never voids invoice; + lock from peek, tests, confirm idempotent, waitingDays helpers); fix round 1 dispatched (HEAD seen: 4ed60fe)
Ruling R18: every withdraw to CANCELLED calls voidForEnrollment when the enrollment has an invoiceId (ENROLLED, RESERVED, WAITING_CLASS after resume) — BACKEND_SCHEMA §2.16 wins over plan's "WAITING_CLASS không void" — cost if wrong: an extra no-op call.
Task E-04: fix round 1 done (4ed60fe..e73b396), re-review dispatched. Task F-06: implemented (2f3e634..b430635); review dispatched
Task E-04: fix round 1/5 (4 addressed, 0 open — R18 void, lock guard, tests, confirm idempotent; commits 4ed60fe..e73b396)
Task E-04: complete (commits 4d77486..e73b396, review clean)
Task E-04: minor (deferred): withdraw doc comment stale; no stale-peek race test; resume duplicate-key path untested; confirm audit before read outside txn
Task E-05: impl dispatched (BASE e73b396)
Task F-06: review Needs fixes (role literal TEACHER, forms without shared zod schemas); fix round 1 dispatched (HEAD seen: b430635)
Ruling R19: payment/invoice void UI gated by can('discounts.decide') with TODO W2-MERGE; L-FEES-2 contract request → Lead adds `payments.void: [MANAGER]` to PERMISSIONS in Task M and swaps the gate — cost if wrong: none (same role set today).
Task F-06: fix round 1/5 (4 addressed, 0 open — shape-derived teacher view, shared zod schemas, R19, minors; commits b430635..1ca9a13)
Task F-06: complete (commits 2f3e634..1ca9a13, review clean)
Task F-06: minor (deferred): reason error message wording in discount dialog; teacher empty list shows full columns; void/mutation-error tests
Lane L-FEES: all tasks complete (HEAD 1ca9a13)
Task E-05: implemented (e73b396..0ca36a3) — implementer admits impl written before first RED (RED captured by reverting pages); review dispatched
Task AT-05: implemented (b6d20f9..6712c96); review dispatched
Ruling R20: attendance warning shows a percentage ("⚠ vắng 30% số buổi") instead of "3/10 buổi" (DTO carries absenceRate only); session note read-only in update mode (PATCH has no sessionNote) — cost if wrong: copy differs from DESIGN mock.
Task E-05: review Needs fixes (TDD: impl before RED → mutation-style RED addendum; + minors); fix round 1 dispatched (HEAD seen: 0ca36a3)
Task AT-05: complete (commits b6d20f9..6712c96, review clean)
Task AT-05: minor (deferred → carried into AT-06): read-only message wrong for MANAGER/CANCELLED; 409 ALREADY_TAKEN doesn't refetch; no tests for ALREADY_TAKEN / EDIT_WINDOW_CLOSED. Others: refetch discards edits; partial notify re-send
Task E-05: fix round 1/5 (2 addressed, 0 open — mutation RED addendum, minors; commits 0ca36a3..3088f93)
Task E-05: complete (commits e73b396..3088f93, review clean; process deviation: impl before RED, remediated by mutation RED)
Task E-05: minor (deferred): no tests for conflicts-cleared-on-resubmit, enrollments invalidation, dirty-guard; form stays dirty after save
Task E-06: impl dispatched (BASE 3088f93)
Task G-05: implemented (3aa371e..93e6a46); review dispatched. Concern: "Thêm bài đánh giá" gated by grades.enter (T only) though API lets S create.
Ruling R21: Lead adds permission `assessments.manage: [TEACHER, ACADEMIC_STAFF]` to @lc/shared PERMISSIONS in Task M (matches BACKEND_SCHEMA POST/PATCH/DELETE assessments = T,S); lane files contract request and gates create/edit/delete with a TODO W2-MERGE until then — cost if wrong: S can't create assessments in the UI until merge.
Task G-05: review Needs fixes (R21 helper+contract request, form without shared zod schema, carry-over evidence); fix round 1 dispatched (HEAD seen: 93e6a46)
Task G-05: fix round 1/5 (3 addressed, 0 open — R21 helper + L-GRADES-1, rhf+zod dialog, carry-over proven pure refactor; commits 93e6a46..03b2fcb)
Task G-05: complete (commits 3aa371e..03b2fcb, review clean)
Task G-05: minor (deferred): setDirty(false) before amend await; results STUDENT scope refactor redundant extra query; native date input
Task G-06: impl dispatched (BASE 03b2fcb). Task E-06: implemented (3088f93..2276c8c); review dispatched
Task E-06: complete (commits 3088f93..2276c8c, review clean)
Task E-06: minor (deferred): panel lacks placement score; hard-coded "Lớp vừa đầy" text (CLASS_FULL message wrong context — Lead tweak); overdue colour on span not row; resume/Bảo lưu untested; no Rút on RESERVED rows; waiting list no pagination/course filter. Extra resume button accepted.
Lane L-ENROLL: all tasks complete (HEAD 2276c8c)
Task AT-06: implemented (6712c96..f1b9aad); review dispatched
Task AT-06: complete (commits 6712c96..f1b9aad, review clean)
Task AT-06: minor (deferred, TRIAGE AT FINAL — #1 user-visible): (1) class matrix rows only from students with records (enrolled students w/o records missing; empty class shows empty state) — union GET /classes/:id/students; (2) 92-day session window truncates longer classes; (3) native date inputs vs DateRangePicker, no from>to guard; (4) RED scoping unclear; (5) message flash while session loads; (6) /me/attendance title changed; (7,8) test/doc tidy
Lane L-ATTENDANCE: all tasks complete (HEAD f1b9aad)
Task G-06: implemented (03b2fcb..4429dbc); review dispatched
Task G-06: complete (commits 03b2fcb..4429dbc, review clean)
Task G-06: minor (deferred, TRIAGE AT FINAL): /results lacks course/student filters and class column (mixed rows without class filter); PDF test weak assertion + leaked globals; staff-view warning wording
Lane L-GRADES: all tasks complete (HEAD 4429dbc)
All lanes complete. Task M dispatched (main HEAD before merge: 51f8701+4cd74ae… see git)
Task M: implemented (merges db4b164,c35b3c9,dc730f9,d37558f; integration d37558f..d9a7a60); full chain green per report (shared 98, api unit 42, web 437, e2e 757); smoke 13/13
Task M note: L-ENROLL rebased onto 51f8701 (HEAD f26fa09). Flow case 6 could not fail first (refactor). Dev servers were already running from main (started 15:07, not by this run) — reused, left running.
Task M note (product question for user): student assigned after class start gets an already-overdue invoice (due = class start + 7); follows FR-FEE-02 — no change.
Task M note: teacher home has no link to today's session (W3 L-STUDENT-PORTAL P-01).
Task M: complete (commits 51f8701..d9a7a60, review clean)
Task M: minor (deferred): flow case 6 should pin attendanceWarningThreshold; case 5 depends on clock vs class start
Final review dispatched (opus, 3bec359..d9a7a60)
Final review (3bec359..d9a7a60): With fixes — 1 Critical (reserve→resume→reassign loses old-class history scope, FR-CLS-12), 4 Important (no cancel for RESERVED/WAITING/PENDING in UI; late-assign invoice overdue on day one; attendance matrix 92-day truncation; /results mixed classes without class column), 4 Minor (re-propose after REJECTED discount; void-invoice button with payments; ATTENDANCE_WARNING target; float weight sum). ONE fix wave dispatched: final-fix-brief.md.
Ruling R22: history scope gets a durable field — enrollments.classHistory: ObjectId[] ($addToSet on assign/transfer); ScopeService.studentClassIds('history') = classId ∪ classHistory; results/transcript lookups by class use the same rule — cost if wrong: one schema field (dev data only, default []).
Ruling R23: tuition dueDate = max(class.startDate, today VN at invoice creation) + invoiceDueDaysAfterStart (FR-FEE-02 assumes enrolment before start; late assignment must not be overdue on day one); recorded in DECISIONS — cost if wrong: late joiners get 7 extra days.
Rate-limit interruption: final fix wave stopped mid-work (work saved) — resumed via SendMessage after reset
Final fix wave: implemented (d9a7a60..77fc1cc); full chain green per report (shared 98, api unit 44, web 443, e2e 761/49). Re-review dispatched.
Final fix wave: re-review — all 9 + extra addressed, 0 new Critical/Important (opus). Implementer deviation accepted: ENROLLED history entries carry classId and enrolledAt checks it (R22 roster correctness).
Final fix wave: minor (deferred → W4 hardening): no backfill of classHistory / stint classId (dev data only — needed before production data); classHistory not indexed; teacherStudentIds still classId-only.
Final fix wave: complete (commits d9a7a60..77fc1cc); full chain green at 77fc1cc (shared 98, api unit 44, web 443, api e2e 761/49 suites, merge-gate, fr-coverage 54/68).
Ruling R24: no second UI smoke after the fix wave — Task M smoke (13/13) ran on d9a7a60 and every fix-wave change is covered by RED→GREEN tests + the full chain — cost if wrong: a UI regression in the 9 touched spots surfaces in W3.

Re-verification 2026-11-01 (controller): full chain re-run on main green (shared 98, api unit 44, web 443, api e2e 761/49, merge-gate, fr-coverage 54/68); UI smoke re-run 20/20 PASS, no 5xx (smoke2-report.md). Finding: seed:demo enrollments have no classHistory / stamped stints → reserve→resume→reassign of a SEEDED enrollment loses old-class history. Fix in W3-L3 (seed through services) or a seed patch.
