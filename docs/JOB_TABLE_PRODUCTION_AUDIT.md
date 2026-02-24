# Production Job Table Audit

## STEP 1 — Production Job Table

**Table name:** `jobs` (lowercase; 0054 renamed from "Job")

**Columns (from information_schema):**

| column_name | data_type | udt_name |
|-------------|-----------|----------|
| id | text | text |
| status | USER-DEFINED | JobStatus |
| title | text | text |
| scope | text | text |
| region | text | text |
| service_type | text | text |
| time_window | text | text |
| router_earnings_cents | integer | int4 |
| broker_fee_cents | integer | int4 |
| created_at | timestamp without time zone | timestamp |
| published_at | timestamp without time zone | timestamp |
| claimed_at | timestamp without time zone | timestamp |
| claimed_by_user_id | text | text |
| routed_at | timestamp without time zone | timestamp |
| contractor_completed_at | timestamp without time zone | timestamp |
| contractor_completion_summary | text | text |
| customer_approved_at | timestamp without time zone | timestamp |
| customer_rejected_at | timestamp without time zone | timestamp |
| customer_reject_reason | USER-DEFINED | CustomerRejectReason |
| customer_reject_notes | text | text |
| customer_feedback | text | text |
| router_approved_at | timestamp without time zone | timestamp |
| router_approval_notes | text | text |
| completion_flagged_at | timestamp without time zone | timestamp |
| completion_flag_reason | text | text |
| contractor_action_token_hash | text | text |
| customer_action_token_hash | text | text |
| job_type | USER-DEFINED | JobType |
| lat | double precision | float8 |
| lng | double precision | float8 |
| contractor_payout_cents | integer | int4 |
| job_poster_user_id | text | text |
| trade_category | USER-DEFINED | TradeCategory |
| estimated_completion_date | timestamp without time zone | timestamp |
| estimate_set_at | timestamp without time zone | timestamp |
| estimate_updated_at | timestamp without time zone | timestamp |
| estimate_update_reason | USER-DEFINED | EcdUpdateReason |
| estimate_update_other_text | text | text |
| labor_total_cents | integer | int4 |
| materials_total_cents | integer | int4 |
| transaction_fee_cents | integer | int4 |
| country | USER-DEFINED | CountryCode |
| city | text | text |
| amountcents | integer | int4 |
| paymentstatus | text | text |
| publicstatus | text | text |
| archived | boolean | bool |
| amount_cents | integer | int4 |
| payment_status | text | text |
| public_status | text | text |
| country_code | USER-DEFINED | CountryCode |
| state_code | text | text |
| currency | USER-DEFINED | CurrencyCode |
| region_code | text | text |
| region_name | text | text |
| postal_code | text | text |
| address_full | text | text |
| ai_appraisal_status | USER-DEFINED | AiAppraisalStatus |
| ai_appraised_at | timestamp with time zone | timestamptz |
| ai_suggested_total | integer | int4 |
| ai_price_range_low | integer | int4 |
| ai_price_range_high | integer | int4 |
| ai_confidence | text | text |
| ai_reasoning | text | text |
| pricing_intel | jsonb | jsonb |
| pricing_intel_generated_at | timestamp with time zone | timestamptz |
| pricing_intel_model | text | text |
| superseded_by_job_id | text | text |
| is_mock | boolean | bool |
| mock_seed_batch | text | text |
| job_source | USER-DEFINED | JobSource |
| repeat_contractor_discount_cents | integer | int4 |
| payout_status | USER-DEFINED | JobPayoutStatus |
| payment_currency | text | text |
| stripe_payment_intent_id | text | text |
| stripe_charge_id | text | text |
| stripe_customer_id | text | text |
| stripe_payment_method_id | text | text |
| accepted_at | timestamp with time zone | timestamptz |
| authorization_expires_at | timestamp with time zone | timestamptz |
| funds_secured_at | timestamp with time zone | timestamptz |
| completion_deadline_at | timestamp with time zone | timestamptz |
| funded_at | timestamp with time zone | timestamptz |
| released_at | timestamp with time zone | timestamptz |
| refunded_at | timestamp with time zone | timestamptz |
| contractor_transfer_id | text | text |
| router_transfer_id | text | text |
| escrow_locked_at | timestamp with time zone | timestamptz |
| payment_captured_at | timestamp with time zone | timestamptz |
| payment_released_at | timestamp with time zone | timestamptz |
| price_median_cents | integer | int4 |
| price_adjustment_cents | integer | int4 |
| pricing_version | text | text |
| junk_hauling_items | jsonb | jsonb |
| availability | jsonb | jsonb |
| updated_at | timestamp with time zone | timestamptz |
| contacted_at | timestamp with time zone | timestamptz |
| guarantee_eligible_at | timestamp with time zone | timestamptz |
| admin_routed_by_id | text | text |
| contractor_user_id | text | text |
| posted_at | timestamp with time zone | timestamptz |
| routing_due_at | timestamp with time zone | timestamptz |
| first_routed_at | timestamp with time zone | timestamptz |
| routing_status | USER-DEFINED | RoutingStatus |
| failsafe_routing | boolean | bool |
| customer_completion_summary | text | text |

---

## STEP 2 — Drizzle Job Schema

**File:** `apps/api/db/schema/job.ts`

**Table:** `"Job"` (quoted camelCase)

**Key fields:**

| Drizzle column | Type |
|----------------|------|
| id | text |
| status | jobStatusEnum |
| archived | boolean |
| region | text |
| country | countryCodeEnum |
| countryCode | countryCodeEnum |
| stateCode | text |
| estimatedCompletionDate | timestamp |
| currency | currencyCodeEnum |
| routerEarningsCents | integer |
| brokerFeeCents | integer |
| contractorPayoutCents | integer |
| laborTotalCents | integer |
| materialsTotalCents | integer |
| transactionFeeCents | integer |
| amountCents | integer |
| paymentStatus | paymentStatusEnum |
| payoutStatus | jobPayoutStatusEnum |
| escrowLockedAt | timestamp |
| paymentCapturedAt | timestamp |
| paymentReleasedAt | timestamp |
| stripePaymentIntentId | text |
| stripeChargeId | text |
| etc. | |

---

## STEP 3 — Diff

```json
{
  "missing_in_production": [
    "Table name: Drizzle expects \"Job\", production has \"jobs\"",
    "Column naming: Drizzle uses camelCase (countryCode, stateCode, etc.), production uses snake_case (country_code, state_code, etc.)"
  ],
  "extra_in_production": [
    "amountcents",
    "paymentstatus",
    "publicstatus"
  ],
  "type_mismatches": [
    "payment_status: production text vs Drizzle paymentStatusEnum",
    "public_status: production text vs Drizzle publicJobStatusEnum",
    "timestamp vs timestamptz: some production columns use timestamp without time zone (created_at, published_at, etc.)"
  ]
}
```

---

## Reconciliation Summary

| Aspect | Production | Drizzle |
|-------|------------|---------|
| Table name | `jobs` | `"Job"` |
| Column names | snake_case | camelCase |
| Legacy columns | amountcents, paymentstatus, publicstatus | (none) |
| payment_status | text | PaymentStatus enum |
| public_status | text | PublicJobStatus enum |

**Root cause:** Migration 0054 renamed `Job` → `jobs` and columns to snake_case. Drizzle schema was not updated to match; it still expects `"Job"` and camelCase. This is a schema/ORM mismatch requiring reconciliation (either update Drizzle to use jobs + snake_case, or add a migration to revert 0054 changes in production).
