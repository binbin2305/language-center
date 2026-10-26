#!/usr/bin/env bash
# Lists FR ids from PRD.md that appear in no test file. Exit 1 only with --strict.
set -euo pipefail
STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALL="$(grep -oE 'FR-[A-Z]+-[0-9]+' PRD.md | sort -u)"
COVERED="$(find . \( -name node_modules -o -name dist -o -name .git -o -name .superpowers \) -prune -o -type f \
  \( -name '*.spec.ts' -o -name '*.e2e-spec.ts' -o -name '*.test.ts' -o -name '*.test.tsx' -o -path './e2e/*' \) -print0 \
  | xargs -0 grep -ohE 'FR-[A-Z]+-[0-9]+' 2>/dev/null | sort -u || true)"

MISSING="$(comm -23 <(printf '%s\n' "$ALL") <(printf '%s\n' "$COVERED"))"
TOTAL="$(printf '%s\n' "$ALL" | grep -c . || true)"
NMISS="$(printf '%s' "$MISSING" | grep -c . || true)"
echo "FR coverage: $((TOTAL - NMISS))/$TOTAL covered"
if [ "$NMISS" -gt 0 ]; then
  echo "Missing FRs:"
  printf '%s\n' "$MISSING" | sed 's/^/  /'
  [ "$STRICT" = 1 ] && exit 1
fi
exit 0
