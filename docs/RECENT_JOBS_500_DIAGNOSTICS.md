# Production 500 on /api/public/jobs/recent — Diagnostics

## STEP 1 — Route Change (Done)

The route `apps/api/app/api/public/jobs/recent/route.ts` has been temporarily modified:

- Added `console.error("RECENT_JOBS_PROD_ERROR", error)` in the catch block
- Response now returns `_diagnostic: errMsg` in JSON for temporary diagnostics
- **Deploy to preview branch only. Do not deploy to production alias.**

---

## STEP 2 — SQL: List All Columns in public.jobs

Run this against the **production** database:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jobs'
ORDER BY ordinal_position;
```

---

## STEP 3 — Drizzle Schema Expected Columns (job.ts)

From `apps/api/db/schema/job.ts`, the expected columns are:

| column_name | data_type (Drizzle) |
|-------------|---------------------|
| id | text |
| status | JobStatus enum |
| archived | boolean |
| title | text |
| scope | text |
| region | text |
| country | CountryCode enum |
| country_code | CountryCode enum |
| state_code | text |
| currency | CurrencyCode enum |
| region_code | text |
| region_name | text |
| city | text |
| postal_code | text |
| address_full | text |
| ai_appraisal_status | AiAppraisalStatus enum |
| ai_appraised_at | timestamp |
| ai_suggested_total | integer |
| ai_price_range_low | integer |
| ai_price_range_high | integer |
| ai_confidence | text |
| ai_reasoning | text |
| pricing_intel | jsonb |
| pricing_intel_generated_at | timestamp |
| pricing_intel_model | text |
| superseded_by_job_id | text |
| is_mock | boolean |
| mock_seed_batch | text |
| public_status | PublicJobStatus enum |
| job_source | JobSource enum |
| repeat_contractor_discount_cents | integer |
| service_type | text |
| trade_category | TradeCategory enum |
| time_window | text |
| router_earnings_cents | integer |
| broker_fee_cents | integer |
| contractor_payout_cents | integer |
| labor_total_cents | integer |
| materials_total_cents | integer |
| transaction_fee_cents | integer |
| payment_status | PaymentStatus enum |
| payout_status | JobPayoutStatus enum |
| amount_cents | integer |
| payment_currency | text |
| stripe_payment_intent_id | text |
| stripe_charge_id | text |
| stripe_customer_id | text |
| stripe_payment_method_id | text |
| accepted_at | timestamp |
| authorization_expires_at | timestamp |
| funds_secured_at | timestamp |
| completion_deadline_at | timestamp |
| funded_at | timestamp |
| released_at | timestamp |
| refunded_at | timestamp |
| contractor_transfer_id | text |
| router_transfer_id | text |
| escrow_locked_at | timestamp |
| payment_captured_at | timestamp |
| payment_released_at | timestamp |
| price_median_cents | integer |
| price_adjustment_cents | integer |
| pricing_version | text |
| junk_hauling_items | jsonb |
| availability | jsonb |
| job_type | JobType enum |
| lat | double precision |
| lng | double precision |
| created_at | timestamp |
| published_at | timestamp |
| updated_at | timestamp |
| job_poster_user_id | text |
| contacted_at | timestamp |
| guarantee_eligible_at | timestamp |
| claimed_at | timestamp |
| claimed_by_user_id | text |
| admin_routed_by_id | text |
| contractor_user_id | text |
| posted_at | timestamp |
| routing_due_at | timestamp |
| first_routed_at | timestamp |
| routing_status | RoutingStatus enum |
| failsafe_routing | boolean |
| routed_at | timestamp |
| contractor_completed_at | timestamp |
| contractor_completion_summary | text |
| customer_approved_at | timestamp |
| customer_rejected_at | timestamp |
| customer_reject_reason | CustomerRejectReason enum |
| customer_reject_notes | text |
| customer_feedback | text |
| customer_completion_summary | text |
| router_approved_at | timestamp |
| router_approval_notes | text |
| completion_flagged_at | timestamp |
| completion_flag_reason | text |
| contractor_action_token_hash | text |
| customer_action_token_hash | text |
| estimated_completion_date | timestamp |
| estimate_set_at | timestamp |
| estimate_updated_at | timestamp |
| estimate_update_reason | EcdUpdateReason enum |
| estimate_update_other_text | text |

**Note:** Postgres stores enum columns as `USER-DEFINED` in `information_schema.columns`. The `udt_name` will match the enum type name (e.g. `JobStatus`, `TradeCategory`).

---

## STEP 4 — SQL: Inspect Enums Used by jobs

Run this against the **production** database:

```sql
SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname LIKE '%job%'
ORDER BY t.typname, e.enumsortorder;
```

Optional: include other enums referenced by jobs (CountryCode, CurrencyCode, PaymentStatus, etc.):

```sql
SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN (
  'JobStatus', 'PublicJobStatus', 'JobSource', 'JobType',
  'TradeCategory', 'CountryCode', 'CurrencyCode', 'PaymentStatus',
  'JobPayoutStatus', 'RoutingStatus', 'AiAppraisalStatus',
  'CustomerRejectReason', 'EcdUpdateReason'
)
ORDER BY t.typname, e.enumsortorder;
```

---

## Side-by-Side Comparison (After Running SQL)

1. Run STEP 2 SQL and paste the production column list here.
2. Compare each row: column name and data_type/udt_name.
3. Run STEP 4 SQL and compare enum labels with `apps/api/db/schema/enums.ts`.

### Common Mismatch Causes

- **Missing column:** Drizzle expects a column that doesn't exist in production.
- **Wrong enum values:** Production enum has different labels or order than Drizzle.
- **CamelCase vs snake_case:** Old Prisma schema used camelCase; Drizzle expects snake_case.
- **Different table name:** Production might still have `Job` (PascalCase) instead of `jobs`.
