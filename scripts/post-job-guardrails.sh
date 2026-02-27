#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

POST_JOB_PAGE="$ROOT/apps/web/src/app/post-job/page.tsx"
LEGACY_ROUTE="$ROOT/apps/web/src/app/app/job-poster/(app)/post-a-job/page.tsx"
LEGACY_V3_ROUTE="$ROOT/apps/web/src/app/app/job-poster/(app)/post-a-job-v3/page.tsx"
SUBMIT_ROUTE="$ROOT/apps/api/app/api/job-draft/submit/route.ts"
PI_ROUTE="$ROOT/apps/api/app/api/job-draft/payment-intent/route.ts"

echo "Running post-job guardrails..."

if [[ ! -f "$POST_JOB_PAGE" ]]; then
  echo "ERROR: Missing canonical post-job page: $POST_JOB_PAGE"
  exit 1
fi

if rg -n --fixed-strings "Stateless Intake Version" "$POST_JOB_PAGE" >/tmp/post_job_guard_hits.txt; then
  echo "ERROR: legacy text found in post-job page: Stateless Intake Version"
  cat /tmp/post_job_guard_hits.txt
  exit 1
fi
if rg -n --fixed-strings "v4 Portal" "$POST_JOB_PAGE" >/tmp/post_job_guard_hits.txt; then
  echo "ERROR: legacy text found in post-job page: v4 Portal"
  cat /tmp/post_job_guard_hits.txt
  exit 1
fi

if ! rg -n --fixed-strings 'redirect("/post-job")' "$LEGACY_ROUTE" >/tmp/post_job_guard_hits.txt; then
  echo "ERROR: post-a-job route must redirect to /post-job"
  exit 1
fi
if ! rg -n --fixed-strings 'redirect("/post-job")' "$LEGACY_V3_ROUTE" >/tmp/post_job_guard_hits.txt; then
  echo "ERROR: post-a-job-v3 route must redirect to /post-job"
  exit 1
fi

if ! rg -n --fixed-strings 'status: "OPEN_FOR_ROUTING"' "$SUBMIT_ROUTE" >/tmp/post_job_guard_hits.txt; then
  echo "ERROR: job submit route must set status OPEN_FOR_ROUTING"
  exit 1
fi
if rg -n --fixed-strings 'status: "PUBLISHED"' "$SUBMIT_ROUTE" >/tmp/post_job_guard_hits.txt; then
  echo "ERROR: submit route contains PUBLISHED status assignment"
  cat /tmp/post_job_guard_hits.txt
  exit 1
fi

if ! rg -n --fixed-strings "Payment hold is required before submit." "$SUBMIT_ROUTE" >/tmp/post_job_guard_hits.txt; then
  echo "ERROR: submit route must hard-gate on Stripe confirmation"
  exit 1
fi
if ! rg -n --fixed-strings "Stripe Integration Summary" "$POST_JOB_PAGE" >/tmp/post_job_guard_hits.txt; then
  echo "ERROR: post-job page missing Stripe summary section"
  exit 1
fi
if ! rg -n --fixed-strings "resolveTax" "$PI_ROUTE" >/tmp/post_job_guard_hits.txt; then
  echo "ERROR: payment-intent route must compute tax summary"
  exit 1
fi

echo "Post-job guardrails passed."
