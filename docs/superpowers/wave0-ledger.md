# SDD ledger — plan: docs/superpowers/plans/2026-10-26-wave0-foundation.md

Spec: PRD.md, ARCHITECTURE.md, BACKEND_SCHEMA.md, DESIGN.md, RULES.md, TASK.md (repo root). Branch: wave0 (base fe31e9c on main).

## Preflight scan

| Pair / Task | Produces → Consumes | Finding |
|---|---|---|
| T1 ↔ controller setup | .gitignore already created (.superpowers/, node_modules/) | T1 must extend, not overwrite |
| T2 ↔ T5 | ErrorCode → filter mapping | Plan self-review adds CONFLICT(409), INTERNAL(500) but T2 text omits them → Ruling R1 |
| T4 ↔ T5 | CreateLeadInput → test route | ok (T4 before T5) |
| T1 ↔ T6 | health test temp memory mongo → createTestApp | ok, T6 migrates |
| T5 ↔ T7..T10 | ClockService/FakeClock | ok |
| T7 ↔ T8 | AuthUser def in T7, guard populates in T8 | ok |
| T8 ↔ T9 | JWT claim `mcp` blocks non-/auth routes; change-password must clear it | T9 text doesn't say how client gets token without mcp → Ruling R2 |
| T4 ↔ T12 | MeDto used by web auth | T4 list doesn't name MeDto → Ruling R3 |
| T4 ↔ T13 | SessionConflictDto used by ConflictList | not named in T4 → Ruling R3 |
| T9 ↔ T11 | /auth/refresh response shape used by api client | Ruling R2 covers |
| T10 | INVOICE_CREATOR provided by FeesModule, consumed by EnrollmentsModule | enrollments imports FeesModule; ok |
| T14 ↔ T1 | root scripts test, test:e2e | ok |
| Each task self-consistency | T1–T14 checked: tests vs code vs files | T6 creates `database/models.ts` not listed in file tree — fine |

Ruling R1: Task 2 adds `CONFLICT` (409) and `INTERNAL` (500) to ErrorCode — plan self-review already decided; omission in T2 text — cost if wrong: trivial rename.
Ruling R2: `POST /auth/login`, `/auth/refresh`, `/auth/change-password` all return `{ data: { accessToken, user: MeDto } }`; change-password also rotates the refresh cookie; new access token has no `mcp` claim — client needs a clean token after password change — cost if wrong: small API change.
Ruling R3: Task 4 also defines `MeDto` (id, username, fullName, role, email?, studentId?, teacherProfile?, mustChangePassword) in schemas/auth.ts and `SessionConflictDto` ({ sessionId|placementTestId, kind:'ROOM'|'TEACHER', classId?, classCode?, startAt, endAt, roomId, teacherId }) in schemas/sessions.ts — consumers in T12/T13 — cost if wrong: field rename later.

## Progress
Task 1: complete (commits fe31e9c..77a2b0b, review clean)
Task 1: minor (deferred): AppModule/main.ts untested until T6; engines node >=22 vs .nvmrc 26; api tsconfig includes missing scripts dir; prettier inert (no format script); minified nest-cli.json/tsconfig.build.json; eslint flat config instead of .eslintrc.cjs (accepted)
Task 2: complete (commits 77a2b0b..09fa56a, review clean)
Task 2: minor (deferred): error-status test only spot-checks 5 codes; settings.update extra permission (MANAGER only, justified by FR-SET-01)
Ruling R4: Task 3 brief expects applyDiscount(1_555_555, 10%) === 1_400_000 — arithmetic error; correct is 1_555_555 − round(155_555.5)=155_556 → 1_399_999. Implementer uses 1_399_999 — cost if wrong: none (math).
Task 3: fix round 1/5 (1 addressed, 0 open — weightedAverage tie rounding; commits 4dba091..848b7cc)
Task 3: complete (commits 09fa56a..848b7cc, review clean)
Task 3: minor (deferred): addVnDays no integer check on n; weightedAverage no validation of negative weights/out-of-range scores; formatVnd(NaN) → "NaN ₫"; coverage runs in every test run
Task 4: complete (commits 848b7cc..4162071, review clean)
Task 4: minor (deferred): overrideReason min(5) → VALIDATION_FAILED not REASON_REQUIRED (spec §3.4); WithdrawEnrollmentInput enum; zBoolQuery input type unknown; mixed nullish/nullable; no nested param schemas (:studentId, :docId); weekdays dupes not rejected; ExportReportQuery requires from/to; RoomStatus in schemas/rooms.ts not enums; UpdateUserInput has no role change
Task 5: fix round 1/5 (3 addressed, 0 open — non-Nest 4xx errors, unmapped 4xx code, zod _root; commits bc71de1..aba7eca)
Task 5: complete (commits 4162071..aba7eca, review clean)
Task 5: minor (deferred): loadEnv not wired into main/setupApp/AppModule (carry to Task 9); SEED_* '' treated as set; 413 body-parser path not e2e tested
Task 6: complete (commits aba7eca..8d74ce8, review clean)
Task 6: minor (deferred): fullNameSearch not refreshed by findOneAndUpdate (students service must set it — L-ADMISSIONS note); process.env.MONGODB_URI mutated per createTestApp; lead/student email no format validator at schema level; discount PERCENT must be integer
Ruling R5: replace `sparse` unique indexes (users.email, users.studentId, students.leadId) with partialFilterExpression {$type:'string'|'objectId'} and promote RoomStatus/AuditAction to @lc/shared enums — folded into Task 7 dispatch (small, Lead-owned files, before lanes start) — cost if wrong: one index def change; BACKEND_SCHEMA §2.1/§2.6 wording updated by controller.
Task 7: fix round 1/5 (counter txn tests, minors addressed; 1 open — settings get/update stale cache race; commits b26c317..0231c47)
Task 7: fix round 2/5 (1 addressed, 0 open — settings cache version guard; commits 0231c47..14dab6f)
Task 7: complete (commits 89ca7ab..14dab6f, review clean)
Task 7: minor (deferred): settings cache per-process (multi-instance staleness); concurrent update-vs-update cache ordering; AuditService.redact skips hydrated docs (pass lean objects); paginate sort keys not whitelisted (callers validate)
Task 8: complete (commits 14dab6f..09df2fe, review clean)
Ruling R6: Task 8 hardening minors (pin HS256 in verify+sign, mcp fail-closed for non-boolean, strict 24-hex ObjectId claim check, negative guard tests: alg none/HS384/unknown role/non-Bearer/Public+Roles/empty Roles/class Public, JWT secret min length 32 in loadEnv) folded into Task 9 dispatch — same files area, Lead-owned, cheap — cost if wrong: none.
Task 8: minor (deferred): @CurrentUser throws plain Error when no req.user (programmer error, fails closed); handler @Roles overrides class @Roles (document); no iss/aud check
Ruling R7: Task 9 choices accepted — wrong currentPassword on change-password → 400 INVALID_CREDENTIALS (not 401, no lockout count); seeded ADMIN mustChangePassword=true; logout 204 no body; LOGIN_RATE_LIMIT env — cost if wrong: small API tweaks.
Task 9: review Needs fixes — Important: lockout bypass via parallel correct guess; password rule in controller not shared zPassword. Fix round 1 dispatched to same implementer (HEAD seen by review: 791dac9)
Task 9: minor (deferred → web auth Task 11/12): web api client must dedupe concurrent /auth/refresh calls (two-tab reuse revokes all sessions); trust proxy needed in prod for throttler; 423 path faster than 401 (accepted)
Task 9: fix round 1/5 (2 addressed + minors, 0 open; commits 791dac9..45677fe)
Task 9: complete (commits 09df2fe..45677fe, review clean)
Task 9: minor (deferred): setup-app reads process.env.WEB_ORIGIN directly; JWT_REFRESH_SECRET reserved/unused; 4-wrong+1-correct test weak
Task 10: note for L-ENROLL: unique partial index uniq_active_student_course — transfer must mark old enrollment TRANSFERRED before inserting new ENROLLED (same txn); resume RESERVED→WAITING_CLASS fails if another active enrollment for same course exists (intended). Production needs syncIndexes/autoIndex at boot.
Task 10: complete (commits 45677fe..dede1cd, review clean)
Task 10: minor (deferred): no createPending-inside-withTransaction test (A-02 lane covers); Mongo ≥6 required for $in partial index (docker-compose mongo:7 ok; document); admissions @Controller('') needs explicit prefixes when lane adds routes
Task 11: review Needs fixes (staggered 401 double refresh/onAuthFailure); fix round 1 dispatched (HEAD seen: c8e5358)
Task 11: fix round 1/5 (2 addressed + minors, 0 open; commits c8e5358..7b1feb1)
Task 11: complete (commits dede1cd..7b1feb1, review clean)
Task 11: minor (deferred): request sent with null token + staggered 401 can still refresh twice (anonymous request edge); TimeoutError mapped to network error; calendar.tsx (react-day-picker 9) not visually checked
Ruling R8: Task 12 — notification refType strings (CLASS, SESSION, STUDENT, INVOICE, ASSESSMENT) accepted as the contract; should move to @lc/shared as a const before lanes emit notifications (Lead, Wave 1 start) — Ctrl+K command palette deferred to a later Lead task (DESIGN §3) — BrowserRouter+useRoutes instead of data router (jsdom AbortSignal issue) — cost if wrong: small refactor.
Task 12: review Needs fixes (boot race vs login; no logout on forced change-password; mobile nav gap; role-matrix test). Fix round 1 dispatched (HEAD seen: 39c5922). Server-side mcp enforcement already exists (Task 8) — reviewer item 3 no action.
Task 12: fix round 1/5 (all addressed, 0 open; commits 39c5922..f74da15)
Task 12: complete (commits 7b1feb1..f74da15, review clean)
Task 12: minor (deferred): no test for boot network-error toast; sessionToken not updated by mid-session refresh (stale boot edge); Thêm button lacks aria/active state; STUDENT "Học phí của tôi" moved into Thêm sheet
Task 13: review Needs fixes (DataTable sort + row selection per DESIGN §5; picker aria pass-through). Fix round 1 dispatched (HEAD seen: b5db35b)
Task 13: fix round 1/5 (all addressed, 0 open; commits b5db35b..586bcf5)
Task 13: complete (commits f74da15..586bcf5, review clean)
Task 13: minor (deferred): row checkbox label uses index without getRowId; selection fully controlled (document); MoneyInput caret jumps on reformat; ₫ adornment fixed top-2; no AlertDialog (uses Dialog)
Ruling R9: Task 14 does NOT create `git tag w0` — tag after final review + merge to main (finishing step) — cost if wrong: none.
Task 14: review Needs fixes (rename/delete bypass in merge-gate; CI head_ref injection; missing gate tests). Fix round 1 dispatched (HEAD seen: 0313828)
Task 14: fix round 1/5 (all addressed, 0 open; commits 0313828..e8a689b)
Task 14: complete (commits 586bcf5..e8a689b, review clean)
Task 14: minor (deferred): MONGO_DEV_PORT "" → port 0 (use ||) and undocumented in README; lane-start without node → exit 127; CI lane ownership step untested on a real runner; commit e8a689b author identity set via -c (user email)
Final review (fe31e9c..e8a689b): With fixes — 1 Critical (fresh checkout can't resolve @lc/shared dist), 11 Important. ONE fix wave dispatched: final-fix-brief.md
Ruling R10: two-tab refresh race — 10s server grace window (no revoke-all within window after rotation) + web navigator.locks + BroadcastChannel token share — trades a slightly weaker reuse detection for not logging users out on multi-tab — cost if wrong: tune window / revert.
Ruling R11: cross-lane DI contracts (INVOICE_CREATOR, OUTSTANDING_CHECKER, SCHEDULE_CONFLICT_CHECKER) moved to Lead-owned common/contracts with no-op defaults — cost if wrong: move files.
Ruling R12: Lead pre-installs lane libraries (FullCalendar MIT, recharts, exceljs, pdfmake, multer, swagger, playwright) now — cost if wrong: unused deps.
Final fix wave: DONE (commits e8a689b..76712b9, 14 commits); clean-clone merge gate green per report
Final fix wave re-review: all 12 + one-liners ADDRESSED. Residuals parked:
Ruling R13: parked — refresh race residuals (race 401 clears lc_rt cookie in auth.controller; claim→replacedBy gap in rotate() takes revoke-all path; web treats race 401 as auth failure) — only affects browsers without navigator.locks (Web Lock path is primary protection) — Lead follow-up before production; cost if wrong: occasional multi-tab logout on old browsers.
Ruling R14: parked — clockHolder is process-global (safe with runInBand + one app per file; document for lanes); contract tokens not yet injected by any consumer (wired at W2 merge per R11); staff username without '@' latent case issue — cost if wrong: test flake / later wiring.
