#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RUNTIME_DIRS=(
  "$ROOT/apps/web/src"
  "$ROOT/apps/api/app"
  "$ROOT/apps/api/src"
)

PATTERNS=(
  # Legacy wizard draft/payment endpoints that must never be reintroduced.
  "/job-poster/drafts/save"
  "/job-poster/drafts/"
  "/job-poster/payments/verify"
  "wizard-step"
  "resumeJobId"
  "NEXT_PUBLIC_JOB_WIZARD_V2"
  # Alternate job-poster creation/payment paths that bypass drafts-v2 canonical flow.
  "/job-poster/jobs/create-draft"
  "/job-poster/jobs/[id]/retry-payment"
  "/api/web/jobs/[id]/payment-intent"
)

echo "Running legacy job wizard guard..."

FAILED=0
for pattern in "${PATTERNS[@]}"; do
  for dir in "${RUNTIME_DIRS[@]}"; do
    if [[ ! -d "$dir" ]]; then
      continue
    fi
    if rg -n --fixed-strings --glob '*.{ts,tsx,js,jsx,mjs,cjs}' "$pattern" "$dir" >/tmp/no_legacy_job_wizard_hits.txt; then
      echo "ERROR: legacy pattern found: $pattern"
      cat /tmp/no_legacy_job_wizard_hits.txt
      FAILED=1
    fi
  done
done

if [[ "$FAILED" -ne 0 ]]; then
  exit 1
fi

echo "Legacy job wizard guard passed."
