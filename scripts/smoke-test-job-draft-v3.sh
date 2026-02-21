#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://8fold.app}"
TOKEN="${TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "TOKEN is required"
  exit 1
fi

echo "1) GET draft"
curl -sS -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/job-draft" | tee /tmp/job-draft-v3-get.json

echo
echo "2) PATCH draft details"
curl -sS -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dataPatch":{"details":{"title":"Sink Repair","category":"HANDYMAN","description":"Repair leaking sink","region":"BC","stateCode":"BC","countryCode":"CA","city":"Langley","isRegional":true}}}' \
  "${BASE_URL}/api/job-draft" | tee /tmp/job-draft-v3-patch.json

echo
echo "3) POST appraise"
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/job-draft/appraise" | tee /tmp/job-draft-v3-appraise.json

echo
echo "4) POST payment-intent"
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"selectedPrice":10000,"isRegional":true}' \
  "${BASE_URL}/api/job-draft/payment-intent" | tee /tmp/job-draft-v3-payment-intent.json

echo
echo "5) POST submit (requires confirmed payment hold)"
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/job-draft/submit" | tee /tmp/job-draft-v3-submit.json

echo
echo "Done."
