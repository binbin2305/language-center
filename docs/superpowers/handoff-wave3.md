# Handoff: Language Center (Wave 2 done → next is Wave 3)

## Who / how to talk
Same as `handoff-wave2.md`: the user writes Vietnamese, reply in Vietnamese, action-first, swarm with TDD, one recommendation, short status answers (2–4 lines).

## Where things are
- Repo `/Users/huybin2305/language-center`, branch `main`, tags `w0`, `w1`, `w2`. Pushed to `origin` (main + tags).
- Plans: `docs/superpowers/plans/2026-10-31-wave2-domain-lanes.md` (format to copy for W3).
- Ledgers: `docs/superpowers/wave{0,1,2}-ledger.md`. **Read the W2 ledger before planning W3**: rulings R1–R24, deferred minors per task, Task M notes.
- Decisions: `docs/DECISIONS.md` (Wave 2 decisions D11–D21, R22 history scope via `enrollments.classHistory` + class-stamped ENROLLED history entries, R23 late-assignment due date, lock-key protocol).
- Questions: `docs/QUESTIONS.md` (D8 email login, R26 "lớp hiện tại" column — both W3 Lead).
- SDD tooling used in W2: `.superpowers/sdd/2026-10-31-wave2-domain-lanes/` (git-ignored; `brief.sh <ID>` builds briefs = plan header + lane intro + task; `common-implementer.md`, `common-reviewer.md`, `common-re-reviewer.md`). Copy and adapt for W3.

## State at handoff
- Full chain green on 77fc1cc (docs commits after): shared 98, api unit 44, web 443, api e2e 761 (49 suites), merge-gate tests, fr-coverage 54/68.
- UI smoke 13/13 PASS on d9a7a60 (before the fix wave; fix wave covered by tests — ruling R24).
- Lane branches `lane/L-{ENROLL,ATTENDANCE,GRADES,FEES}` exist locally, merged, not pushed; worktrees removed.
- Dev Mongo holds smoke data; `pnpm --filter api seed:demo --reset` cleans it. Dev servers may still be running from an earlier session — check ports 27017/3000/5173.

## Next: Wave 3 (TASK.md)
- Lead W3-L1 wiring is mostly done in W2 Task M (tokens, warningFlags). Remaining Lead items: W3-L2 flow tests (several already exist in `apps/api/test/e2e/flows/w2-*.e2e-spec.ts` — extend, don't duplicate), W3-L3 full seed through services + `seed:large`, D7 student summary (`averageScore`, `outstandingBalance`) with real data, D8 email login decision, R26 current-class column.
- Lanes: L-REPORTS (R-01..R-07), L-STUDENT-PORTAL (P-01, P-02). Teacher home needs "today's sessions → Điểm danh" link (Task M note).
- Carry into W3/W4 from the W2 ledger: classHistory backfill + index before production data; teacherStudentIds classId-only; /results course/student filters; attendance matrix rows from roster; deferred test-coverage minors.

## Environment gotchas (unchanged from W2, plus)
- `export PATH=/opt/homebrew/bin:$PATH`; Node 26, pnpm 9, no Docker. After shared changes `pnpm --filter @lc/shared build`.
- Dev run: `pnpm --filter api dev:mongo`, `pnpm --filter api dev`, `pnpm --filter web dev` in separate background processes.
- Never run two full chains at once; kill idle jest (0% CPU) and re-run.
- `git rebase` ignores `git -c user.*` — use GIT_AUTHOR_*/GIT_COMMITTER_* env vars.
- Subagents hit the 5-hour limit twice in W2; resume them with SendMessage after reset (work is saved).
- Recurring implementer failure in W2: writing code before RED / pasting only summarised RED. Require raw RED output; for FE, failing behavioural assertions, not just "page not found".
