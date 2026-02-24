# Schema Drift — Phase A Only (Tier 1/2 Surface Area)

Filtered from full scan. Only issues affecting tables/columns in `phaseA_used_surface_area.json`.

## Phase A Tables

jobs, job_photos, JobPayment, routers, User, JobDispatch, JobAssignment, Contractor, AuditLog

## Phase A — In Scope (Fix These)

### CRITICAL (1) — FIXED

| Kind | Table | Column | Detail | Status |
|------|-------|--------|--------|--------|
| MISSING_TABLE_IN_DB | JobPhoto | - | Drizzle expected "JobPhoto", DB has job_photos | **FIXED** — Drizzle updated to job_photos |

### MEDIUM (3) — Migration 0063

| Kind | Table | Column | Detail |
|------|-------|--------|--------|
| EXTRA_COLUMN_IN_DB | jobs | amountcents, paymentstatus, publicstatus | Legacy columns. Drop via 0063. |
| TYPE_MISMATCH | jobs | payment_status, public_status | May be text. Cast to enum via 0063. |

### HIGH (jobs nullability) — Code null-tolerance, no DB change

| Kind | Table | Column | Detail |
|------|-------|--------|--------|
| NULLABLE_MISMATCH | jobs | currency, ai_appraisal_status, is_mock, job_source, repeat_contractor_discount_cents, payout_status, payment_currency, pricing_version, updated_at, posted_at, routing_status, failsafe_routing | Drizzle NOT NULL, DB allows NULL. **Phase A: Code tolerates null.** |

## Phase B Backlog (Not Used by Tier 1/2)

- Contractor.stripeAccountId, Contractor.stripePayoutsEnabled — **not referenced**
- RouterProfile.address/city/stateProvince/postalCode/country — **not referenced** (routable uses routers + users)
- LedgerEntry.escrowId/currency/stripeRef — **not referenced**
- admin_router_contexts, clerk_webhook_events, internal_account_flags
- job_draft, JobFlag, JobHold, JobPosterCredit, job_posters
- ContractorPayout, MaterialsEscrow, MaterialsPayment, etc.
- User nullable mismatches — **prefer code null-tolerance**
- RouterProfile extra columns (state, status, phone, etc.) — **not referenced**

## Phase A Fix Summary

1. **0063** — Drop jobs legacy columns, cast payment_status/public_status to enum
2. **Drizzle jobPhoto** — Use job_photos (already done)
3. **No 0065** — No missing columns referenced by Tier 1/2
4. **No nullable fixes** — Code null-tolerance for Phase A
