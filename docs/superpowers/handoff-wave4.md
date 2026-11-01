# Handoff: Language Center (Wave 3 done → next is Wave 4)

## Who / how to talk
Same as before: the user writes Vietnamese, reply in Vietnamese, action-first, swarm with TDD via SDD (subagent-driven-development), one recommendation, short status answers (2–4 lines). **When the full chain is green, tag and push without asking.**

## Where things are
- Repo `/Users/huybin2305/language-center`, branch `main`, tags `w0`–`w3`, pushed to `origin`.
- Plans: `docs/superpowers/plans/2026-11-01-wave3-reports-portal-integration.md` (format to copy for W4).
- Ledgers: `docs/superpowers/wave{0,1,2,3}-ledger.md`. **Read the W3 ledger before planning W4**: rulings R1–R3, deferred minors per task (triaged "W4" by the final review), Task M + smoke notes.
- Decisions: `docs/DECISIONS.md` (W3 D22–D28; D26 addendum = Ruling R2 + finance overdue scope).
- SDD tooling for W3 lived in `.superpowers/sdd/2026-11-01-wave3-reports-portal-integration/` (git-ignored, deleted at wave end). For W4 recreate: `brief.sh <ID>` (plan header + lane intro + task), `common-implementer.md`, `common-reviewer.md`, `common-re-reviewer.md` — copy the wording from the W3 ledger/plan conventions.

## State at handoff
- Full chain green on main after the W3 final fix wave (see the end of the W3 ledger for counts).
- UI smoke (system Chrome) 17/17 PASS incl. T2a (attendance save bar at 375px, real pointer click).
- Lane branches `lane/L-{REPORTS,STUDENT-PORTAL,LEAD}` merged into main; worktrees removed.
- Dev DB holds `seed:demo --reset` data; demo "today" in the seed is **2026-11-02** (Monday). On other real dates "sessions today" on the dashboard / teacher home may be empty — Task M used a temporary api clock shift for smoke (no permanent clock override exists).

## Next: Wave 4 (TASK.md)
Carry from the W3 ledger "W4" triage, notably:
- Hardening from W2: classHistory backfill + index before production data; teacherStudentIds classId-only.
- Reports: academic rows not limited to classes overlapping [from,to]; finance "Quá hạn" hint "trên hóa đơn tạo trong khoảng"; academic tab teacher filter in UI; chart colours hard-coded hex (no dark tokens); R-03 literal `'sessions'` in `$lookup`, single `$facet`; missing web tests (classId/groupBy/non-admissions export/error-retry/role redirect/to<from).
- Portal: `now` frozen per mount (midnight rollover); results/invoices limit 100 unpaginated; roster capped at 100 in attendance matrix; roster error blocks matrix.
- Seed: README note on demo date; seed-large missing-actor error untested; Timeline.drain O(n² log n).

## Environment gotchas
- `export PATH=/opt/homebrew/bin:$PATH`; Node 26, pnpm 9, no Docker. After shared changes `pnpm --filter @lc/shared build`.
- **Before a smoke: `rm -rf apps/api/dist`** — incremental `nest build` (tsbuildinfo) left a stale `grades.service.js` and caused a 500 in W3.
- Dev run: `pnpm --filter api dev:mongo`, `pnpm --filter api dev`, `pnpm --filter web dev` in separate background processes.
- Never run two full chains at once; kill idle jest (0% CPU) and re-run.
- `git rebase` ignores `git -c user.*` — use GIT_AUTHOR_*/GIT_COMMITTER_* env vars.
- Subagents hit the 5-hour limit again in W3; resume them with SendMessage after reset (work is saved).
- Implementers still forget raw RED, and once pasted RED from another lane's test run (shared scratch file). Require raw RED from the task's own test command; reviewers check the test file name in the RED block.
- recharts in jsdom: mock `ResponsiveContainer` to a fixed size (see dashboard/reports tests) to keep output clean.
