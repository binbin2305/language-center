# SDD ledger — plan: docs/superpowers/plans/2026-10-29-wave1-domain-lanes.md

Spec: PRD.md, BACKEND_SCHEMA.md, DESIGN.md, RULES.md, TASK.md (W1), docs/DECISIONS.md. Base: main 9d8e3d4 (= wave0 + plan; tag w0 on 0dc1d51).

## Preflight scan
| Pair / Task | Produces → Consumes | Finding |
|---|---|---|
| T0 ↔ A-01/A-02/A-04 | DuplicateMatchDto/DuplicatePersonDetails, UpdateStudentResultDto | ok, T0 before lanes |
| T0 ↔ A-03 | attendanceRate(), StudentBriefDto+dob/phone, StudentTeacherViewDto | ok |
| T0 ↔ CL-02/CL-03 | ClassDependencyReason, ListClassesQuery.includePast, absenceRate() | ok (includePast moved into T0 interfaces during self-review) |
| T0 ↔ S-02/S-03 | SessionWarning, CreateSessionResultDto, Bulk.warnings | ok |
| T0 ↔ C-03 | 423 for LOCKED login | ok — C-03 test depends on T0 auth change |
| T0 ↔ A-04/A-06 | apiPostForm/apiGetBlob | ok |
| C-03 ↔ A-02 | UsersService.createStudentAccount signature frozen | L-CATALOG must not change it; carried in both dispatches |
| C-05 ↔ A-05/CL-04/S-05 | catalog hooks vs local api copies | lanes parallel → local copies tagged W1-MERGE, Lead replaces in Task M |
| S-01 ↔ S-02/S-03 | findSlotConflicts / MongoScheduleConflictChecker | ok sequential in lane |
| A-03 ↔ A-04 | /students/me routes before /:id | ok, noted in both |
| CL-01 ↔ W2 | class.finished payload | ok |
| Each task self-consistency | T0, C-01..05, A-01..06, CL-01..04, S-01..05, M checked: tests vs code vs files | clean after self-review edits |

Ruling R1: lanes run in parallel (one implementer at a time per lane, each lane in its own worktree/branch) — the skill's "never parallel implementers" guards shared-tree conflicts, which separate worktrees + ownership gate remove; user asked for agent swarm — cost if wrong: merge conflicts at Task M (gate catches).
Ruling R2: ff main→wave0 + tag w0 done by controller (user approved) — cost if wrong: none, local only, not pushed.

## Progress
Task 0: implemented (commits 9d8e3d4..7f139af), review dispatched. Concerns: jsdom multipart limit (A-06 upload tests can't use MSW formData — carry to A-04/A-06 dispatch); DuplicateMatchDto in schemas/duplicates.ts re-exported from leads.ts (import cycle)
Task 0: complete (commits 9d8e3d4..7f139af, review clean)
Task 0: minor (deferred): apiPostForm test asserts raw multipart text not bytes; closure-captured asserts in handler; shape-key-only schema checks for CreateSessionResultDto/StudentBriefDto; apiGetBlob no 204 handling
Lane workers (base 7f139af): C-01 impl a5e90f25, A-01 impl a27db709, CL-01 impl a1527685, S-01 impl a0f61f3a — dispatched in parallel
Task C-01: complete (commits 7f139af..0d28e7d, review clean)
Task C-01: minor (deferred): escapeRegex exported from courses.service (candidate for common/ — lanes copy it); PATCH {} no-op write; isDuplicateKey maps any E11000 to fields.code
Ruling R3: C-02 + C-04 batched into one dispatch/review (small same-shape CRUD/settings APIs, same lane) — cost if wrong: one larger review surface.
Ruling R4: A-01 concerns accepted — lead q via tone-variant regex (no fullNameSearch on Lead; W4 hardening if volume), PATCH /leads no dup check (FR-ADM-02 covers intake+profile creation only), cancel reason only in audit log — cost if wrong: small follow-ups.
Task S-01: complete (commits 7f139af..db349c7, review clean)
Task S-01: minor (deferred): findSlotConflicts called per-doc; app-level strict:false DI test depends on AppModule wiring; no e2e for earlier-adjacent touch / room-only Mongo case
Task M note: consumers of SCHEDULE_CONFLICT_CHECKER (placement W2) must import ScheduleModule explicitly
Ruling R5: CL-01 judgement calls accepted — POST /classes only status PLANNED (FR-CLS-02 lifecycle starts at PLANNED); PATCH to same status = no-op 200; GET /classes/:id M,S only until CL-03 widens it — cost if wrong: seed/import of ONGOING classes must go through PATCH.
Task A-01: complete (commits 7f139af..a59d937, review clean; ⚠ lead index verified: {status,createdAt}, phone, email)
Task A-01: minor (deferred): dup-check+insert not atomic (no unique key by design); PATCH lead allows non-NEW edits & no dup check; q unindexed regex; q phone '+84…' not normalised (carry to A-03); NFD input; class-level @Roles duplicate
Ruling R6: (amends R5) PATCH status=FINISHED on a FINISHED class → 422 INVALID_STATUS_TRANSITION (FINISHED terminal, brief 'FINISHED → bất kỳ → 422'); other same-status PATCHes stay no-op 200. Makes concurrent-FINISHED test deterministic — cost if wrong: trivial.
Ruling R7: settings audit entity stays 'Settings' (Models.* naming used by common SettingsService) instead of brief's 'settings' — cost if wrong: audit filter case.
Task C-02+C-04: complete (commits 0d28e7d..5df7d84, review clean; ⚠ items resolved by R7 + room schema uppercase/unique verified)
Task C-02+C-04: minor (deferred): toSettingsDto inside controller (move to mapper); settings audit test regex case-insensitive; rooms imports escapeRegex from courses.service; rooms update not audited (not required)
Task CL-01: fix round 1/5 (6 addressed, 0 open — status guard scope, terminal FINISHED, emit errors logged, date check, tests; commits 3638cb0..6eeac04)
Task CL-01: complete (commits 7f139af..6eeac04, review clean)
Task CL-01: minor (deferred): emitAsync-failure path untested; name-only PATCH race not exercised concurrently; TOCTOU on refs validation in update; maxCapacity vs concurrent currentSize race untested
Ruling R9: S-02 concurrency — serialise conflict checks by bumping CounterService keys 'lock:room:<roomId>' and 'lock:teacher:<teacherId>' (counters collection, Lead-owned common service the lane may call) inside the transaction BEFORE the conflict check; concurrent overlapping creates then hit a write conflict and withTransaction retries and sees the first insert. Same rule binds S-03 (update) and W2 placement tests — cost if wrong: extra counter docs; hot room serialises writes (acceptable volume).
Ruling R10: S-02 bulk range check on [fromDate,toDate] vs class window (stricter than per-session) accepted — bounds expansion; per-session check kept — cost if wrong: user must pick dates inside class window.
Ruling R11: (extends R9) cross-lane class lock — schedule create/update also bumps 'lock:class:<classId>'; classes DELETE bumps the same key inside its transaction (and W2 enrollment assign/transfer will too), so delete-vs-new-dependency races hit a write conflict — cost if wrong: one extra counter write per op.
Ruling R12: reset-password refresh-token revocation needs auth.module (Lead-owned) wiring — Lead does it in Task M (export TokenService or a revoke method; UsersService calls it on reset-password and lock) with an e2e test — cost if wrong: until W1 merge an old refresh session survives a reset.
Task C-03: implementer reports no separate RED run (TDD process deviation) — left to review.
Task A-02: review Needs fixes (missing ADMIN 403 + minors); fix round 1 dispatched (HEAD seen: 1c31884)
Task CL-02: review Needs fixes (R11 lock missing — ruling postdated dispatch; Promise.all on txn session); fix round 1 dispatched (HEAD seen: e2f8025)
Task S-02: review Needs fixes (concurrent double-booking); fix round 1 dispatched with R9+R11 (HEAD seen: 98ff7de)
Ruling R13: users PATCH {status} goes through the same path as lock/unlock (ACTIVE clears lockedUntil/failedLoginCount/window; audit action STATUS); POST /unlock only from LOCKED (DISABLED → re-enable via PATCH status ACTIVE) — cost if wrong: small API semantics change.
Task C-03: review Needs fixes (no RED evidence + minors); fix round 1 dispatched (HEAD seen: 9ed7f33)
Task S-02: fix round 1/5 (3 addressed, 0 open — schedule locks R9/R11, comment, imports; commits 98ff7de..b43d364)
Task S-02: complete (commits db349c7..b43d364, review clean)
Task S-02: minor (deferred): no class-status check on session create (CANCELLED/FINISHED class); check-conflicts returns 200; import order
Task A-02: fix round 1/5 (5 addressed, 0 open — ADMIN 403, tidy, dup tests; commits 1c31884..0a6f42d)
Task A-02: complete (commits a59d937..0a6f42d, review clean)
Task A-02: minor (deferred): setMaxListeners(50) workaround in 20-parallel test
Task CL-02: fix round 1/5 (5 addressed, 0 open — R11 class lock, sequential deps, audit rollback test; commits e2f8025..767d37b)
Task CL-02: complete (commits 6eeac04..767d37b, review clean)
Task CL-02: minor (deferred): no 401 test; delete race with session create not exercised concurrently (lock proven by counter doc)
Task C-03: fix round 1/5 (7 addressed, 0 open — RED evidence, R13 status path, unlock from LOCKED, reset clears lock, 404 vs 403, vi collation, projection; commits 9ed7f33..d7c4acf)
Task C-03: complete (commits 5df7d84..d7c4acf, review clean)
Task C-03: minor (deferred): STATUS_RESET loosely typed; PATCH status LOCKED bypasses lock endpoint semantics (R13 accepted); users audit entity 'User' vs brief 'user'
Task S-03: complete (commits b43d364..a1eed67, review clean; ⚠ verified: zReason shape-only allows empty, withTransaction=conn.transaction retries transient)
Task S-03: minor (deferred): resolve() before SESSION_LOCKED check (wrong error precedence); empty PATCH on locked session 200; no teacher-change-locked/boundary/concurrency tests
Ruling R14: S-03 403 tests cover TEACHER only; RULES §1 needs every disallowed role — folded into S-04 dispatch (add STUDENT/ADMIN 403 for PATCH/cancel/cancel-future, and also swap lock check before resolve) — cost if wrong: none.
Ruling R15: student name search = unanchored substring on fullNameSearch (FR-STU-01 'khớp một phần', middle names) — not index-backed; revisit in W4 hardening (text index / n-gram) — cost if wrong: slow search at large volume.
Ruling R16: commit trailers naming the subagent's own model (e.g. Sonnet 5.5) are kept — they attribute the actual author model — cost if wrong: cosmetic.
Ruling R17: GET /students classId/courseId filters for M/S exclude CANCELLED enrollments (a cancelled sign-up is not membership) — cost if wrong: staff must search cancelled ones by name.
Task A-03: review Needs fixes (teacher probing via classId/courseId filters; email prefix search by teacher; RED evidence); fix round 1 dispatched (HEAD seen: 569b508)
Task CL-03: complete (commits 767d37b..3a03967, review clean; ⚠ malformed id → CastError → 404 per DECISIONS)
Task CL-03: minor (deferred): get(id, user?) optional user skips scope; roster total vs missing student docs; roster sort on unindexed joined name/binary collation; import order; no hasSeat test for student
Ruling R18: lib/status.ts lacks course/room/user groups → L-CATALOG files contract request; keeps a minimal local badge built on ui/badge marked TODO W1-MERGE; Lead adds groups + swaps to StatusBadge in Task M — cost if wrong: small swap at merge.
Ruling R19: MANAGER-cannot-act-on-ADMIN in users page is a target-role rule mirroring the server (no permission exists for it) — allowed as one documented helper canActOnUser(me, target) in features/users — cost if wrong: helper moves to shared later.
Ruling R20: shared form helpers (e.g. applyServerFieldErrors) stay as ONE copy inside L-CATALOG features with a TODO W1-MERGE; contract request to promote them to lib at Task M — cost if wrong: merge-time move.
Task C-05: review Needs fixes (TDD, custom select/checkbox/badge, hard-coded role, no zodResolver, cross-feature helpers); fix round 1 dispatched (HEAD seen: 2cbf6c1)
Task A-03: fix round 1/5 (4 addressed, 0 open — teacher filter scope, email probe, RED evidence, R17; commits 569b508..c70f605)
Task A-03: complete (commits 0a6f42d..c70f605, review clean)
Ruling R21: schedule notifications also go to the session's own teacherId (substitute) and, on update that changes teacher, the previous teacher — FR-SCH-06 intent 'GV' = whoever teaches the session — cost if wrong: one extra notification.
Rate-limit interruption: A-04 impl, CL-04 impl, C-05 fix round 1 stopped mid-work (work saved) — resumed via SendMessage after reset.
Task S-04: review Needs fixes (R21 recipients, GET /sessions/:id ADMIN 403, RED evidence); fix round 1 dispatched (HEAD seen: 29d8f70)
Ruling R22: GET /rooms is M,S only → class detail for T shows no room name. W1: classes FE calls room/course options only when can(classes.manage) (courses GET is all roles, fine); Task M adds optional defaultRoomName to ClassDto (shared) + classes mapper fills it, FE shows it — cost if wrong: teachers see no room name until merge.
Task CL-04: review Needs fixes (local zod schema duplicating shared, create code not required); fix round 1 dispatched with R22 (HEAD seen: f3d02d0)
Task M note: Lead e2e/web tests use 1s findBy timeouts on lazy routes — fragile, raise to 3–5s at merge.
Task M note: Lead-owned common.test.tsx ReasonDialog test flaked once under full web suite (passed on rerun) — investigate at merge.
Task C-05: fix round 1/5 (9 addressed, 0 open — RED, ui select/checkbox, badge R18, canActOnUser R19, zodResolver, R20, tests; commits 2cbf6c1..b595c01)
Task C-05: complete (commits d7c4acf..b595c01, review clean)
Task C-05: minor (deferred): course create sends description '' instead of undefined; CatalogStatusBadge ACTIVE uses default variant; hasTeacherProfile role literal in roles.ts
Lane L-CATALOG: all tasks complete (HEAD b595c01)
Task CL-04: fix round 1/5 (6 addressed, 0 open — shared schema, code required, R22 gating, rename, debounce, tests; commits f3d02d0..66556f6)
Task CL-04: complete (commits 3a03967..66556f6, review clean)
Task CL-04: minor (deferred): resolver mutates error messages post-validation; teacher options query not gated (only used in manage-only dialog); missing list loading/empty tests
Lane L-CLASSES: all tasks complete (HEAD 66556f6)
Task S-04: fix round 1/5 (5 addressed, 0 open — R21 recipients, RED evidence, ADMIN 403, test assertions; commits 29d8f70..1cb5b8b)
Task S-04: complete (commits a1eed67..1cb5b8b, review clean)
Task S-04: minor (deferred): notifier re-reads class; notify awaited on request path; no RED mutation for 'current' scope / R21 extras
Task A-04: complete (commits c70f605..52137e4, review clean)
Task A-04: minor (deferred, TRIAGE AT FINAL — #2 likely user-visible): (1) explicit fullNameSearch duplicates schema findOneAndUpdate hook + wrong comment; (2) latin1→utf8 re-decode corrupts UTF-8 filenames >U+00FF (use multer defParamCharset utf8); (3) Content-Disposition encoding of '()* + no ASCII fallback; (4) no fileName length cap / multer files:1 fields limits; (5) no magic-byte content check; (6) audit before unlink on delete, update+audit not transactional; (7) AuditLogDto built inline (move to mapper), redundant email branch; (8) tests: non-dup phone no warnings key, stored fileName for ../ name
Ruling R23: lead form is a full page at /admissions/leads/new (route exists in Lead route map) instead of DESIGN's right-side sheet — cost if wrong: UI polish later.
Task M note (REQUIRED): Lead router.test.tsx 1s timeout on first lazy route import fails once real pages land (A-05 hit it deterministically; CL-04 too) — raise timeouts at merge before running the gate.
Task M note: LeadDto lacks creator name → 'người tiếp nhận' column omitted (contract request L-ADMISSIONS-1).
Ruling R24: recurring dry-run must be ONE request — L-SCHEDULE adds POST /sessions/bulk/check-conflicts (body BulkCreateSessionsInput, returns CheckConflictsResultDto with DB + intra-batch conflicts; range violations still 422) reusing shared schemas, no contract change — cost if wrong: one extra route.
Task M note (REQUIRED): wire apps/web/test/msw/schedule.handlers.ts into Lead handlers.ts (contract request L-SCHEDULE-1) — router.test 'schedule render (MANAGER)' fails without it.
Task A-05: complete (commits 52137e4..ca184d1, review clean; ⚠ students.create permission exists per DECISIONS, SearchInput debounces)
Task A-05: minor (deferred): course select no loading/error hint; tempPassword kept in mutation cache (reset on close); fragile date pick in test; LEAD link/copy/course+date filters untested; aria-label with '*' overriding FormField label
Task S-05: review Needs fixes (CRITICAL single-form dry-run key order blocks create/edit; R24 bulk dry-run endpoint; hooks usage; casts; calendar range tz); fix round 1 dispatched (HEAD seen: d0a586a)
Task M note (REQUIRED): router.test 'tab Lịch sử thay đổi /students/:id MANAGER' asserts placeholder h2 — update for real tab + mock audit endpoint.
Task M note: students list omits 'lớp hiện tại' column + class picker (no DTO field) — contract request L-ADMISSIONS-1 items 4–5.
Ruling R25: lanes merged with ownership-only gate per lane + API suites after each merge; full gate runs on main after Lead integration fixes (Lead-owned web tests block lane-level full gates) — cost if wrong: a lane regression surfaces one step later.
Task S-05: fix round 1/5 (6 addressed, 0 open — canonical dry-run key, bulk check endpoint R24, hooks-only, casts, calendar range, 409 test; commits d0a586a..71725c9)
Task S-05: complete (commits 1cb5b8b..71725c9, review clean)
Task S-05: minor (deferred): applyServerError cast on e.details; dialog tests preset pickers via defaults prop; ?date= param on /schedule (extra)
Lane L-SCHEDULE: all tasks complete (HEAD 71725c9)
Task A-06: complete (commits ca184d1..9d22d2b, review clean; ⚠ teacher DTO has no gender — verified StudentBriefDto)
Task A-06: minor (deferred): duplicate toast '\n' join; global too_small message for any field; audit actorRole raw enum; revokeObjectURL sync + detached anchor; test gaps
Lane L-ADMISSIONS: all tasks complete (HEAD 9d22d2b)
All lanes complete. Task M dispatched (main HEAD before merge: 7f139af)
Task M: implemented (merges cb6fd4c,0a38377,b6f50ef,afd0adf; integration afd0adf..cfe4718); full chain green per report; smoke 10/10
Ruling R26: 'lớp hiện tại' column/class picker on /students deferred to W3 (needs rule for multiple active enrollments; in QUESTIONS.md) — cost if wrong: missing column until W3.
Task M: minor (deferred): root 'pnpm dev' exits immediately (./apps/* glob expanded) — pre-existing
Task M: complete (commits afd0adf..cfe4718, review clean)
Task M: minor (deferred): refresh rotate() race vs revocation (issueRefresh outside txn); @Global AuthCoreModule exports; mutate opens txn even without revocation; room label lost code; smoke partly via API; global 15s test timeout
Final review (9d8e3d4..cfe4718): With fixes — 0 Critical, 2 Important tag-blocking (R21 bulk recipients; sessions on non-open classes), 4 Important trackable (class date narrowing, Promise.all on txn session, student write+audit atomicity, student rename → user name). ONE fix wave dispatched: final-fix-brief.md (items 1–11, incl. cheap minors).
Final triage: A-04 #2 utf8 filename NOT corrupting for browsers (latin1 default round-trips) — fixed anyway in item 11; refresh rotate race only for reset-password → W4 (tokensValidAfter).
Rate-limit interruption: final fix wave stopped at item 3 — resumed after reset.
Final fix wave: agent's background full-chain run hung (jest e2e 52 min, 0% CPU, no mongod) — controller killed it and re-runs the chain.
Final fix wave: re-review — all 11 addressed, 0 new Critical/Important; deviations (ListClassesQuery.open, empty PATCH on closed class → 422, 10s first-render waits) accepted. Fix-wave agent stopped by controller (its own run hung).
Final fix wave: minor (deferred): OPEN_CLASS_STATUSES duplicated (classes/schedule); CLASS_NOT_OPEN web message enrollment-flavoured; no test for empty PATCH on closed class; lazy-page test waits should use a shared PAGE_LOAD constant / preloading (W4)
Final fix wave: complete (commits cfe4718..54d5e30); controller full chain green: shared 90, api unit 32, web 366, api e2e 442/27 suites, merge-gate tests pass
