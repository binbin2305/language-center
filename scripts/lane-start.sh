#!/usr/bin/env bash
# Usage: scripts/lane-start.sh <lane>   e.g. L-CLASSES
# Creates worktree ../lc-<lane> on new branch lane/<lane> from main.
set -euo pipefail
LANE="${1:-}"
if [ -z "$LANE" ]; then echo "usage: $0 <lane>" >&2; exit 2; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git worktree add "../lc-$LANE" -b "lane/$LANE" main
echo "Worktree: $(cd "../lc-$LANE" && pwd)"
echo "Next: cd ../lc-$LANE && pnpm install"
