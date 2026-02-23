#!/usr/bin/env bash
# Financial Schema Guard — CI step
# Fails if:
#   1. Runtime code (apps/api/src, apps/api/app) contains 8fold_test (excl. __tests__)
#   2. New migrations (drizzle/0068_*.sql and later) contain 8fold_test
# See docs/FINANCIAL_SCHEMA_GUARDS.md

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FAILED=0

# 1. Runtime: no 8fold_test in src or app (excl. __tests__)
RUNTIME_MATCHES=$(grep -R '8fold_test' apps/api/src apps/api/app 2>/dev/null \
  --exclude-dir=__tests__ \
  --include='*.ts' --include='*.tsx' \
  || true)
if [ -n "$RUNTIME_MATCHES" ]; then
  echo "ERROR: Runtime code must not reference 8fold_test. Use getResolvedSchema()."
  echo "$RUNTIME_MATCHES"
  FAILED=1
fi

# 2. New migrations (0068-0999): no 8fold_test (0000-0067 and 1000+ grandfathered)
for f in drizzle/*.sql; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .sql)
  num=$(echo "$base" | sed -n 's/^\([0-9]*\)_.*/\1/p')
  [ -n "$num" ] || continue
  if [ "$num" -ge 68 ] 2>/dev/null && [ "$num" -lt 1000 ] 2>/dev/null; then
    if grep '8fold_test' "$f" 2>/dev/null | grep -v '^[[:space:]]*--' | grep -q .; then
      echo "ERROR: Migration $f (0068+) must not target 8fold_test. Use public schema."
      grep -n '8fold_test' "$f" || true
      FAILED=1
    fi
  fi
done

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "See docs/FINANCIAL_SCHEMA_GUARDS.md"
  exit 1
fi

echo "Financial schema guard: PASS"
exit 0
