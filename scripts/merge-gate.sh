#!/usr/bin/env bash
# Usage: scripts/merge-gate.sh [lane] [--ownership-only]
#   lane              e.g. L-CLASSES; checks `git diff main...lane/<lane>` against scripts/lane-owners.json
#   --ownership-only  skip install/lint/typecheck/test, only run the file-ownership check (needs a lane)
# Env: MERGE_BASE overrides the base ref (default: main).
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then export PATH="/opt/homebrew/bin:$PATH"; fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LANE=""
OWNERSHIP_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --ownership-only) OWNERSHIP_ONLY=1 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) LANE="$arg" ;;
  esac
done

if [ "$OWNERSHIP_ONLY" = 1 ] && [ -z "$LANE" ]; then
  echo "--ownership-only requires a lane" >&2; exit 2
fi

check_ownership() {
  local base="${MERGE_BASE:-main}"
  local ref="lane/$LANE"
  cd "$ROOT"
  git rev-parse --verify -q "$ref" >/dev/null || { echo "branch $ref not found" >&2; exit 2; }
  git rev-parse --verify -q "$base" >/dev/null || { echo "base $base not found" >&2; exit 2; }
  git diff --name-only --no-renames -z "$base...$ref" | LANE="$LANE" OWNERS="$ROOT/scripts/lane-owners.json" node -e '
    const fs = require("fs");
    const owners = JSON.parse(fs.readFileSync(process.env.OWNERS, "utf8"));
    const lane = process.env.LANE;
    const globs = owners[lane];
    if (lane.startsWith("_") || !Array.isArray(globs)) { console.error("unknown lane: " + lane); process.exit(2); }
    const ALWAYS = ["TASK.md", "docs/DECISIONS.md", "docs/QUESTIONS.md", "docs/contract-requests/**"];
    const toRe = (g) => {
      let r = "";
      for (let i = 0; i < g.length; i++) {
        const c = g[i];
        if (c === "*" && g[i + 1] === "*") {
          if (g[i + 2] === "/") { r += "(?:.*/)?"; i += 2; } else { r += ".*"; i += 1; }
        } else if (c === "*") r += "[^/]*";
        else if (c === "?") r += "[^/]";
        else r += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      }
      return new RegExp("^" + r + "$");
    };
    const pos = [...ALWAYS, ...globs.filter((g) => !g.startsWith("!"))].map(toRe);
    const neg = globs.filter((g) => g.startsWith("!")).map((g) => toRe(g.slice(1)));
    const files = fs.readFileSync(0, "utf8").split("\0").filter(Boolean);
    const bad = files.filter((f) => !pos.some((r) => r.test(f)) || neg.some((r) => r.test(f)));
    if (bad.length) {
      console.error("Ownership violations for " + lane + ":");
      bad.forEach((f) => console.error("  " + f));
      process.exit(1);
    }
    console.log("Ownership OK for " + lane + " (" + files.length + " files)");
  '
}

if [ -n "$LANE" ]; then check_ownership; fi
if [ "$OWNERSHIP_ONLY" = 1 ]; then exit 0; fi

cd "$ROOT"
pnpm i --frozen-lockfile
pnpm --filter @lc/shared build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
echo "merge gate: green"
