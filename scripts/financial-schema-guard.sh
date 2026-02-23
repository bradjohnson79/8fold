#!/usr/bin/env bash
# Financial Schema Guard — CI step. See docs/FINANCIAL_SCHEMA_GUARDS.md
set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
FAILED=0

RUNTIME_MATCHES=$(grep -R '8fold_test' apps/api/src apps/api/app 2>/dev/null --exclude-dir=__tests__ --include='*.ts' --include='*.tsx' || true)
if [ -n "$RUNTIME_MATCHES" ]; then
  echo "ERROR: Runtime code must not reference 8fold_test. Use getResolvedSchema()."
  echo "$RUNTIME_MATCHES"
  FAILED=1
fi

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
  echo ""; echo "See docs/FINANCIAL_SCHEMA_GUARDS.md"
  exit 1
fi
echo "Financial schema guard: PASS"
exit 0
