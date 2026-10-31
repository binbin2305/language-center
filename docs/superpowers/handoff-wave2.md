# Handoff: Language Center (Wave 1 done; next is Wave 2)

## Who / how to talk
- The user writes **Vietnamese**; reply in Vietnamese.
- They work action-first ("làm tiếp đi") and want continuous execution with TDD and an agent swarm (parallel lanes).
- Give a recommendation; ask at most one question.
- They check progress often ("xong chưa"), so answer with the current state in 2–4 lines.

## Where things are (read, don't re-derive)
- **Repo:** `/Users/huybin2305/language-center`, branch **`main`**, tags `w0` and `w1` (`w1` = `2bef770`).
- **Remote:** `origin` = https://github.com/binbin2305/language-center.git.
  - **Pushed on 2026-10-31:** `main` plus tags `w0` and `w1`. `main` tracks `origin/main`.
  - GitHub credentials now work on this machine, so `git push` runs non-interactively.
- **Specs** (user-approved): `PRD.md`, `ARCHITECTURE.md`, `BACKEND_SCHEMA.md`, `DESIGN.md`, `RULES.md`, `TASK.md`. W0 and W1 boxes are ticked.
- **Plans:**
  - `docs/superpowers/plans/2026-10-26-wave0-foundation.md`
  - `docs/superpowers/plans/2026-10-29-wave1-domain-lanes.md` (format to copy for W2)
- **Ledgers:** `docs/superpowers/wave0-ledger.md` and `docs/superpowers/wave1-ledger.md`.
  - The W1 ledger holds rulings R1–R26 (there is no R8), the deferred minors per task, and "Task M note" lines.
  - **Read the W1 ledger before planning W2.**
- **Conventions:** `docs/DECISIONS.md`. It now also holds:
  - the **lock-key protocol**: `lock:class/room/teacher` keys bumped through `CounterService.next` inside the transaction, before reading the invariant;
  - the W1 decisions D2–D10;
  - `ListClassesQuery.open`.
- **Open questions:** `docs/QUESTIONS.md`. It holds D8 (student login by email) and R26 (the "lớp hiện tại" column on /students), both for W3.
- **Swarm tooling:**
  - `scripts/lane-start.sh <LANE>` creates the worktree `../lc-<LANE>` from `main`.
  - `scripts/merge-gate.sh <LANE> [--ownership-only]`
  - `scripts/lane-owners.json`
  - `scripts/fr-coverage.sh` (26/68 FRs after W1)

## State at handoff
1. **Verification on `main`:**
   - The last full chain was green on `54d5e30`: lint, typecheck, shared 90, api unit 32, web 366, api e2e 442 (27 suites), merge-gate tests.
   - The only commits after it are docs-only.
   - A UI smoke test of 11 steps across MANAGER, STAFF, TEACHER and STUDENT, run with Playwright and system Chrome on `w1`, **PASSED**. No 5xx.
2. **Lane branches** `lane/L-{CATALOG,ADMISSIONS,CLASSES,SCHEDULE}` still exist locally. They are merged and not pushed. The worktrees are removed.
3. **Dev Mongo data** (`apps/api/.mongo-data/`) contains the smoke-test data. Run `pnpm --filter api seed:demo --reset` to clean it.
4. All dev servers are stopped.

## Next work: Wave 2
- **Lanes (TASK.md):** L-ENROLL, L-ATTENDANCE, L-GRADES, L-FEES, all in parallel.
- **Flow that worked:**
  1. `superpowers:writing-plans`, producing a plan with a Lead Task 0 for contract prep, lane tasks, and a Task M for merge and integration.
  2. User approval.
  3. `superpowers:subagent-driven-development`: lanes in parallel, one worktree per lane, one implementer at a time per lane, a task review after every task, a fix loop.
  4. Task M: merge in order, then Lead integration, then the full chain.
  5. A final opus review, then **one** fix wave, a re-review, the full chain, tag `w2`, a UI smoke test, and a push.
- **W2 obligations already recorded:**
  - Placement tests and enrollment assign/transfer must follow the lock-key protocol: bump `lock:class` (and room/teacher for placement).
  - The `class.finished` event payload is `{ classId, at, actorId }` and is emitted after commit. L-ENROLL listens and sets ENROLLED to COMPLETED.
  - Consumers of `SCHEDULE_CONFLICT_CHECKER` (placement) must import `ScheduleModule` explicitly.
  - Contract tokens `INVOICE_CREATOR` and `OUTSTANDING_CHECKER` are implemented by L-FEES. Lead wires them at the W2 merge (R11 of the W0 ledger).
  - The attendance roster must use `ScopeService.teacherCanTakeAttendance`, because substitute teachers get 404 on `/classes/:id/students` by design.
  - Use the `absenceRate()` and `attendanceRate()` helpers in `@lc/shared` (D6).
  - Student detail `summary.averageScore` and `outstandingBalance` are placeholders (D7). They get wired with real data in W3.
- **Deferred to W4 hardening:**
  - the refresh `rotate()` vs reset-password race (add a `tokensValidAfter` field);
  - lazy-page web tests that need 10s first-render waits (preload, or a shared `PAGE_LOAD` constant);
  - lead and student search indexing;
  - magic-byte check on uploads;
  - root `pnpm dev` exits immediately because the `./apps/*` glob gets expanded.

## Environment gotchas
- Every shell needs `export PATH=/opt/homebrew/bin:$PATH` (Node 26 via Homebrew). pnpm 9. No Docker.
- **Stale shared dist:** `packages/shared/dist` is gitignored. After shared schema changes, run `pnpm --filter @lc/shared build`, or `pnpm install`, which builds it, before `pnpm --filter api dev`. Otherwise the API dev compile fails (seen in the W1 smoke run).
- **Dev run:** root `pnpm dev` is broken. Run each in its own background process: `pnpm --filter api dev:mongo`, then `pnpm --filter api dev`, then `pnpm --filter web dev`. The app is at http://localhost:5173. Demo accounts are in README. The seeded ADMIN password was changed earlier, so use the MANAGER, STAFF, TEACHER and STUDENT accounts.
- **Headless UI:** `require('<repo>/node_modules/@playwright/test').chromium.launch({ channel: 'chrome' })`.
- **Git:** `git -c user.name=huybin2305 -c user.email=huybin2305@gmail.com commit …`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **zsh:** avoid `echo =====`.
- **e2e:** it hung once (jest stayed alive with no mongod, 0% CPU). If a full-chain run sits idle for many minutes, check `ps -o etime,%cpu` and kill/re-run rather than wait. Do not run two full chains at once, because the web lazy-page tests time out under contention.
- **Rate limits:** subagents can die on a session limit. Resume them with SendMessage after the reset; their work is saved.
- **Temp dir:** handoff files under `/var/folders/.../T/` get purged. Keep handoffs in the repo (this file).

## Model usage that worked (SDD)
- Implementers: sonnet.
- Task reviewers: sonnet; opus for security, concurrency or scope-heavy tasks.
- Scoped re-reviews: sonnet or haiku.
- Task M and the final review: opus.
- Put common prompt files in the SDD workspace (`.superpowers/sdd/<plan>/common-implementer.md`, `common-reviewer.md`, `common-re-reviewer.md`), and rebuild them for the W2 plan.
- Generate per-task briefs as plan header + lane intro + task section. The stock `task-brief` script only matches numeric "Task N" headings.
- Recurring implementer failure: skipping the RED step. Require RED output in the report up front.

## Suggested skills
`superpowers:writing-plans` → `superpowers:subagent-driven-development` → `superpowers:finishing-a-development-branch`; `run` for smoke tests; `mattpocock-skills:pr` if the user wants a PR description.
