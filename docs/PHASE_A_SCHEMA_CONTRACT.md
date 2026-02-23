# Phase A Schema Contract

**Frozen as of Phase A completion.** Any change to these tables requires running `hygiene:guard` before merge.

## Canonical Runtime Tables

| Table | DB Name | Used By |
|-------|---------|---------|
| jobs | `jobs` | recent, routable-jobs, contractor/appointment, admin/jobs/[id] |
| job_photos | `job_photos` | recent, job detail, image audit |
| JobPayment | `JobPayment` | routable-jobs |
| routers | `routers` | routable-jobs |
| User | `User` | contractor/appointment, routable-jobs |
| JobDispatch | `JobDispatch` | routable-jobs |
| JobAssignment | `JobAssignment` | contractor/appointment, admin/jobs/[id] |
| Contractor | `Contractor` | contractor/appointment, admin/jobs/[id] |
| AuditLog | `AuditLog` | audit trails |

## Canonical Runtime Columns

### jobs (Tier 1/2 used)

- id
- status
- public_status
- payment_status
- created_at
- updated_at
- archived
- title
- scope
- region
- country
- country_code
- state_code
- region_code
- city
- is_mock
- claimed_by_user_id
- posted_at
- published_at
- routing_status
- router_approved_at
- contractor_completed_at
- customer_approved_at
- job_poster_user_id
- trade_category
- service_type
- job_type
- labor_total_cents
- contractor_payout_cents
- router_earnings_cents
- broker_fee_cents
- materials_total_cents
- transaction_fee_cents
- amount_cents
- availability

### Contractor (Tier 1/2 used)

- id
- businessName
- trade
- regionCode
- email
- phone

### job_photos

- id
- job_id
- kind
- url
- created_at

## Enforcement

**Any change to these tables requires running `hygiene:guard` before merge.**

```bash
pnpm -C apps/api hygiene:guard
```

This runs:

1. `validate:jobs-schema` — fails on column/type/enum mismatch for `jobs`
2. `hygiene:phaseA:check` — fails if Tier 1/2 query tests fail

CI runs this on push and pull_request. Non-zero exit blocks merge.

## Optional: Runtime Smoke Test

After deploy, run (API must be running):

```bash
API_ORIGIN=http://localhost:3003 pnpm -C apps/api smoke:test
```

Validates: `/api/public/jobs/recent` → 200, `/api/web/router/routable-jobs` → 401 or 200 (not 500).
