#!/usr/bin/env bash
# Self-asserting test for scripts/merge-gate.sh --ownership-only.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAILS=0

assert() { # name, expected exit, actual exit
  if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1 (expected exit $2, got $3)"; FAILS=$((FAILS + 1)); fi
}
assert_contains() { # name, haystack, needle
  case "$2" in *"$3"*) echo "ok   - $1" ;; *) echo "FAIL - $1 (missing '$3')"; FAILS=$((FAILS + 1)) ;; esac
}
assert_not_contains() {
  case "$2" in *"$3"*) echo "FAIL - $1 (unexpected '$3')"; FAILS=$((FAILS + 1)) ;; *) echo "ok   - $1" ;; esac
}

cd "$TMP"
git init -q -b main .
git config user.email t@example.com
git config user.name t
git config commit.gpgsign false
mkdir -p scripts packages/shared/src apps/api/src/modules/classes
cp "$SRC/merge-gate.sh" "$SRC/lane-owners.json" scripts/
echo base > packages/shared/src/enums.ts
echo base > README.md
git add -A && git commit -q -m base

run() { set +e; OUT="$(bash scripts/merge-gate.sh "$@" 2>&1)"; RC=$?; set -e; }

# 1. lane edits Lead-only shared file -> fail and list it
git checkout -q -b lane/L-CLASSES
echo changed >> packages/shared/src/enums.ts
git commit -qam "touch shared"
run L-CLASSES --ownership-only
assert "shared edit rejected" 1 "$RC"
assert_contains "offender listed" "$OUT" "packages/shared/src/enums.ts"

# 2. add an owned file too; shared edit still fails but owned is not listed
echo x > apps/api/src/modules/classes/x.ts
git add -A && git commit -qm "owned file"
run L-CLASSES --ownership-only
assert "mixed still rejected" 1 "$RC"
assert_not_contains "owned file not listed" "$OUT" "modules/classes/x.ts"

# 3. only owned + always-allowed files -> pass
git checkout -q main
git checkout -q -b lane/L-CLASSES-OK
mkdir -p apps/api/src/modules/classes docs/contract-requests
echo x > apps/api/src/modules/classes/x.ts
echo r > docs/contract-requests/L-CLASSES-1.md
echo q > docs/QUESTIONS.md
git add -A && git commit -qm "owned"
git branch -q -f lane/L-CLASSES lane/L-CLASSES-OK
run L-CLASSES --ownership-only
assert "owned + allowed files accepted" 0 "$RC"

# 4. a lane touching another lane's module is rejected
git checkout -q main
git checkout -q -b lane/L-FEES
mkdir -p apps/api/src/modules/grades
echo y > apps/api/src/modules/grades/y.ts
git add -A && git commit -qm "cross-lane"
run L-FEES --ownership-only
assert "cross-lane edit rejected" 1 "$RC"
assert_contains "cross-lane offender listed" "$OUT" "apps/api/src/modules/grades/y.ts"

# 5. unknown lane
run L-NOPE --ownership-only
assert "unknown lane rejected" 2 "$RC"

# 6. MERGE_BASE override
git checkout -q lane/L-CLASSES
set +e; OUT="$(MERGE_BASE=lane/L-CLASSES bash scripts/merge-gate.sh L-CLASSES --ownership-only 2>&1)"; RC=$?; set -e
assert "MERGE_BASE override (empty diff passes)" 0 "$RC"

# 7. rename from Lead-only path into owned path -> rejected (old path listed)
git checkout -q main
git checkout -q -b lane/L-CLASSES-MV
mkdir -p apps/api/src/modules/classes
git mv packages/shared/src/enums.ts apps/api/src/modules/classes/enums.ts
git commit -qm "rename"
git branch -q -f lane/L-CLASSES lane/L-CLASSES-MV
run L-CLASSES --ownership-only
assert "rename out of Lead path rejected" 1 "$RC"
assert_contains "rename old path listed" "$OUT" "packages/shared/src/enums.ts"

# 8. deletion of Lead-only file -> rejected
git checkout -q main
git checkout -q -b lane/L-GRADES
git rm -q packages/shared/src/enums.ts
git commit -qm "delete"
run L-GRADES --ownership-only
assert "delete of Lead-only file rejected" 1 "$RC"

# 9. "!" exclusions
git checkout -q main
mkdir -p apps/web/src/features/admissions/pages apps/web/src/features/home
echo a > apps/web/src/features/admissions/pages/placement-page.tsx
echo a > apps/web/src/features/admissions/pages/leads-page.tsx
echo a > apps/web/src/features/home/home-router.tsx
git add -A && git commit -qm "web files"
git checkout -q -b lane/L-ADMISSIONS
echo b >> apps/web/src/features/admissions/pages/leads-page.tsx
git commit -qam "leads ok"
run L-ADMISSIONS --ownership-only
assert "admissions may edit leads page" 0 "$RC"
echo b >> apps/web/src/features/admissions/pages/placement-page.tsx
git commit -qam "placement"
run L-ADMISSIONS --ownership-only
assert "admissions editing placement page rejected" 1 "$RC"
git checkout -q main
git checkout -q -b lane/L-STUDENT-PORTAL
echo b >> apps/web/src/features/home/home-router.tsx
git commit -qam "router"
run L-STUDENT-PORTAL --ownership-only
assert "student-portal editing home-router rejected" 1 "$RC"

# 10. glob semantics: classes*.e2e-spec.ts must not match classes/x
git checkout -q main
git checkout -q -b lane/L-CLASSES-GLOB
mkdir -p apps/api/test/e2e/classes
echo z > apps/api/test/e2e/classes-list.e2e-spec.ts
echo z > apps/api/test/e2e/classes/x.e2e-spec.ts
git add -A && git commit -qm "globs"
git branch -q -f lane/L-CLASSES lane/L-CLASSES-GLOB
run L-CLASSES --ownership-only
assert "nested e2e path rejected" 1 "$RC"
assert_contains "nested listed" "$OUT" "apps/api/test/e2e/classes/x.e2e-spec.ts"
assert_not_contains "flat e2e accepted" "$OUT" "classes-list.e2e-spec.ts"

# 11. missing lane branch / base -> exit 2
run L-SCHEDULE --ownership-only
assert "missing lane branch exits 2" 2 "$RC"
set +e; OUT="$(MERGE_BASE=nope bash scripts/merge-gate.sh L-CLASSES --ownership-only 2>&1)"; RC=$?; set -e
assert "missing base exits 2" 2 "$RC"

# 12. cross-lane DI contracts (apps/api/src/common/contracts/**) are Lead-only, even for the implementing lane
git checkout -q main
git checkout -q -b lane/L-FEES-CONTRACT
mkdir -p apps/api/src/common/contracts
echo c > apps/api/src/common/contracts/invoice-creator.ts
git add -A && git commit -qm "contract edit"
git branch -q -f lane/L-FEES lane/L-FEES-CONTRACT
run L-FEES --ownership-only
assert "lane editing common/contracts rejected" 1 "$RC"
assert_contains "contract offender listed" "$OUT" "apps/api/src/common/contracts/invoice-creator.ts"

# 13. Wave 4 ownership (D32): e2e/a11y belongs to L-HARDENING, not L-E2E; docs/** no longer L-HARDENING
git checkout -q main
git checkout -q -b lane/L-E2E
mkdir -p e2e/a11y e2e/flows
echo a > e2e/a11y/x.spec.ts
git add -A && git commit -qm "a11y from e2e lane"
run L-E2E --ownership-only
assert "L-E2E editing e2e/a11y/x.spec.ts rejected" 1 "$RC"
assert_contains "a11y offender listed" "$OUT" "e2e/a11y/x.spec.ts"
git checkout -q main
git checkout -q -b lane/L-E2E-OK
mkdir -p e2e/flows
echo f > e2e/flows/x01-admissions.spec.ts
git add -A && git commit -qm "flow"
git branch -q -f lane/L-E2E lane/L-E2E-OK
run L-E2E --ownership-only
assert "L-E2E editing e2e/flows accepted" 0 "$RC"

git checkout -q main
git checkout -q -b lane/L-HARDENING
mkdir -p e2e/a11y apps/api/src/openapi
echo a > e2e/a11y/x.spec.ts
echo r >> README.md
echo o > apps/api/src/openapi/a.ts
git add -A && git commit -qm "hardening files"
run L-HARDENING --ownership-only
assert "L-HARDENING editing e2e/a11y/x.spec.ts, README.md, apps/api/src/openapi/a.ts accepted" 0 "$RC"
git checkout -q main
git checkout -q -b lane/L-HARDENING-DOCS
mkdir -p docs/superpowers
echo d > docs/superpowers/x.md
git add -A && git commit -qm "docs outside hardening"
git branch -q -f lane/L-HARDENING lane/L-HARDENING-DOCS
run L-HARDENING --ownership-only
assert "L-HARDENING editing docs/superpowers/x.md rejected" 1 "$RC"
assert_contains "docs offender listed" "$OUT" "docs/superpowers/x.md"

# 14. L-LEAD may edit Lead files but not the two W4 lanes' files
git checkout -q main
git checkout -q -b lane/L-LEAD
mkdir -p apps/api/src/common/scope
echo s > apps/api/src/common/scope/scope.service.ts
echo b >> packages/shared/src/enums.ts
git add -A && git commit -qm "lead files"
run L-LEAD --ownership-only
assert "L-LEAD editing common/scope + shared accepted" 0 "$RC"
mkdir -p e2e/flows
echo f > e2e/flows/x01.spec.ts
git add -A && git commit -qm "lead touches e2e"
run L-LEAD --ownership-only
assert "L-LEAD editing e2e/flows rejected" 1 "$RC"
assert_contains "lead offender listed" "$OUT" "e2e/flows/x01.spec.ts"

# 15. full gate runs the security suite after test:e2e
GATE="$(cat "$SRC/merge-gate.sh")"
assert_contains "gate runs pnpm test:security after pnpm test:e2e" "$GATE" "pnpm test:e2e
pnpm test:security"

if [ "$FAILS" -ne 0 ]; then echo "$FAILS assertion(s) failed"; exit 1; fi
echo "all merge-gate assertions passed"
