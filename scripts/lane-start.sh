#!/usr/bin/env bash
# Usage: scripts/lane-start.sh <lane>   e.g. L-CLASSES
# Creates worktree ../lc-<lane> on new branch lane/<lane> from main.
set -euo pipefail
LANE="${1:-}"
if [ -z "$LANE" ]; then echo "usage: $0 <lane>" >&2; exit 2; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! command -v node >/dev/null 2>&1; then export PATH="/opt/homebrew/bin:$PATH"; fi
LANE="$LANE" OWNERS="$ROOT/scripts/lane-owners.json" node -e '
  const o = JSON.parse(require("fs").readFileSync(process.env.OWNERS, "utf8"));
  const l = process.env.LANE;
  if (l.startsWith("_") || !Array.isArray(o[l])) { console.error("unknown lane: " + l + " (known: " + Object.keys(o).filter((k) => !k.startsWith("_")).join(", ") + ")"); process.exit(2); }
'
git worktree add "../lc-$LANE" -b "lane/$LANE" main
echo "Worktree: $(cd "../lc-$LANE" && pwd)"
echo "Next: cd ../lc-$LANE && pnpm install"
