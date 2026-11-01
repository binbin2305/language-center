#!/usr/bin/env bash
# E2E harness (D29): fresh local mongod :27027 -> seed:demo --reset -> real builds -> api :3100 -> web preview :4173
# -> playwright. Everything started here is stopped, and the temp dir removed, on exit. Exit code = playwright's.
# Usage: pnpm e2e [playwright args...]   e.g. pnpm e2e e2e/harness.spec.ts
set -euo pipefail

# The Mac idle-sleeps mid-run otherwise (W4 Task 0 root cause).
if command -v caffeinate >/dev/null 2>&1 && [ -z "${LC_E2E_CAFFEINATED:-}" ]; then
  LC_E2E_CAFFEINATED=1 exec caffeinate -i bash "$0" "$@"
fi

export PATH="/opt/homebrew/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MONGO_PORT=27027
API_PORT=3100
WEB_PORT=4173
# Single source of truth for the controlled clock (D30): e2e/fixtures/accounts.ts CLOCK_START.
CLOCK_START="$(sed -n "s/^export const CLOCK_START = '\([^']*\)';.*/\1/p" e2e/fixtures/accounts.ts)"
[ -n "$CLOCK_START" ] || { echo "e2e: cannot read CLOCK_START from e2e/fixtures/accounts.ts" >&2; exit 1; }

for port in "$MONGO_PORT" "$API_PORT" "$WEB_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "e2e: port $port is already in use (another pnpm e2e running?)" >&2
    exit 1
  fi
done

TMP_BASE="${TMPDIR:-/tmp}"
TMP="$(mktemp -d "${TMP_BASE%/}/lc-e2e.XXXXXX")"
mkdir -p "$TMP/mongo" "$TMP/uploads"
MONGO_PID=''
API_PID=''
WEB_PID=''
FG_PID=''

# Background jobs get their own process group, so a whole tree (pnpm/vite children) can be signalled.
set -m

stop() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || return 0
  for _ in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.2
  done
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
}

cleanup() {
  local rc=$?
  set +e
  stop "$FG_PID"
  stop "$WEB_PID"
  stop "$API_PID"
  stop "$MONGO_PID"
  if [ "$rc" -ne 0 ] && [ -z "${PW_DONE:-}" ]; then
    for f in mongo api web; do
      [ -f "$TMP/$f.log" ] && { echo "---- $f.log (tail) ----" >&2; tail -n 40 "$TMP/$f.log" >&2; }
    done
  fi
  rm -rf "$TMP"
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Foreground step run as a background job + wait, so the INT/TERM traps fire at once and cleanup can
# signal its whole process group (under set -m a true foreground child would not get our TERM).
run_fg() {
  "$@" &
  FG_PID=$!
  local rc=0
  wait "$FG_PID" || rc=$?
  FG_PID=''
  return "$rc"
}

# wait_for <seconds> <description> "<pids that must stay alive>" <command...>
wait_for() {
  local secs="$1" what="$2" pids="$3"
  shift 3
  for _ in $(seq 1 $((secs * 2))); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    for pid in $pids; do
      if ! kill -0 "$pid" 2>/dev/null; then
        echo "e2e: process $pid exited while waiting for $what" >&2
        return 1
      fi
    done
    sleep 0.5
  done
  echo "e2e: timed out after ${secs}s waiting for $what" >&2
  return 1
}

# Common env for seed + api (D29/D30). Set explicitly so apps/api/.env (dev values) never leaks in.
export NODE_ENV=e2e
export JWT_ACCESS_SECRET='e2e-access-secret-0123456789abcdef0123456789abcdef'
export LOGIN_RATE_LIMIT=1000
export WEB_ORIGIN="http://localhost:$WEB_PORT"
export UPLOAD_DIR="$TMP/uploads"
export APP_CLOCK_START="$CLOCK_START"
export BCRYPT_COST=10
export TRUST_PROXY=false

echo "e2e: [1/5] mongod :$MONGO_PORT (data $TMP/mongo)"
(cd apps/api && MONGO_DEV_PORT="$MONGO_PORT" MONGO_DATA_DIR="$TMP/mongo" exec ./node_modules/.bin/ts-node scripts/dev-mongo.ts) >"$TMP/mongo.log" 2>&1 &
MONGO_PID=$!
wait_for 180 "MongoDB ready" "$MONGO_PID" grep -q 'MongoDB ready' "$TMP/mongo.log"
MONGODB_URI="$(sed -n 's/^MONGODB_URI=//p' "$TMP/mongo.log" | head -n 1)"
[ -n "$MONGODB_URI" ] || { echo "e2e: no MONGODB_URI in mongo.log" >&2; exit 1; }
export MONGODB_URI
echo "e2e:       $MONGODB_URI"

echo "e2e: [2/5] seed:demo --reset"
run_fg pnpm --filter api seed:demo --reset

echo "e2e: [3/5] clean real build"
rm -rf apps/api/dist apps/web/dist
run_fg env -u NODE_ENV pnpm build # NODE_ENV=e2e would make vite bundle React in development mode

echo "e2e: [4/5] api :$API_PORT, web preview :$WEB_PORT"
(cd apps/api && PORT="$API_PORT" exec node dist/main) >"$TMP/api.log" 2>&1 &
API_PID=$!
(cd apps/web && API_PROXY_TARGET="http://localhost:$API_PORT" exec env -u NODE_ENV ./node_modules/.bin/vite preview --port "$WEB_PORT" --strictPort) >"$TMP/web.log" 2>&1 &
WEB_PID=$!
wait_for 90 "http://localhost:$WEB_PORT/api/v1/health" "$MONGO_PID $API_PID $WEB_PID" curl -sf "http://localhost:$WEB_PORT/api/v1/health"

echo "e2e: [5/5] playwright test $*"
PW_RC=0
run_fg pnpm exec playwright test -c e2e/playwright.config.ts "$@" || PW_RC=$?
PW_DONE=1
exit "$PW_RC"
