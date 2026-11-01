# Handoff: Language Center (Wave 4 done → TASK.md complete)

## Who / how to talk
The user writes Vietnamese; reply in Vietnamese, action-first, short status (2–4 lines). Swarm via SDD (subagent-driven-development) with TDD. **When the full chain is green, tag and push without asking.**

## Where things are
- Repo `/Users/huybin2305/language-center`, branch `main`, tags `w0`–`w4`, pushed to `origin`.
- Plans: `docs/superpowers/plans/2026-11-02-wave4-hardening-e2e.md` (latest format).
- Ledgers: `docs/superpowers/wave{0..4}-ledger.md`. The W4 ledger holds rulings R1–R15 and every deferred minor with the final-review triage ("post-W4").
- Decisions: `docs/DECISIONS.md` (D29–D39 + "Wave 4 hardening notes"; R9 scope, R11 counts, R12 attendance.startAt, R15 theme, AA token changes).
- Hardening reports: `docs/hardening/{perf-report,a11y-report}.md`; CR history `docs/contract-requests/L-HARDENING-1..7.md`, `L-07-status.md`.

## State at handoff
- Full gate green on main after the W4 final fix wave (counts at the end of the W4 ledger): lint, typecheck, shared/api unit/web, api e2e, security, merge-gate tests, fr-coverage `--strict` 68/68; coverage api ≈98.9% / web ≈95.3% lines; `pnpm e2e` (Playwright, 34 tests) green twice in a row; `pnpm --filter api perf` NFR-02 PASS (p95 ≤ ~20ms, 0 COLLSCAN).
- Lane branches `lane/L-{E2E,HARDENING,LEAD}` merged; worktrees removed.

## Deploy notes (also in README)
- Set `NODE_ENV=production` (OpenAPI docs and `APP_CLOCK_START` only work for development/e2e/test).
- Before traffic on existing data: `pnpm --filter api migrate:class-history` and `pnpm --filter api migrate:attendance-start-at` (idempotent, batched; low-traffic window). New indexes build via autoIndex at first boot.

## Next (no further waves in TASK.md) — post-W4 backlog
From the W4 final-review triage (see W4 ledger), highest value first:
- Normalise audit entity names codebase-wide (`'grade'` vs `Models.Grade`, `'attendance'` vs `'Attendance'`, …).
- `/reports` default range ("Tháng này" is empty early in the month); warning-token visual check (AA darkening made amber brownish — consider a separate tint-text token).
- Attendance amend upsert should read the session inside the transaction (latent if reschedule rules loosen).
- Test-strength polish: e2e locators/read-backs, security sweep strict 403 for staff-only routes, coverage `--detectOpenHandles` instead of `--forceExit`.

## Environment gotchas
- `export PATH=/opt/homebrew/bin:$PATH`; Node 26, pnpm 9, no Docker.
- **Wrap long runs in `caffeinate -i`** — the Mac idle-sleeps mid-run and jest then times out at 0% CPU.
- `rm -rf apps/api/dist apps/web/dist` before a real build (stale tsbuildinfo → 500).
- `pnpm e2e` uses fixed ports 27027/3100/4173 — one run at a time.
- Subagents hit the 5-hour limit several times; resume them with SendMessage after reset.
- When several implementers share one worktree, they must commit with explicit paths (never `git add -A`).
