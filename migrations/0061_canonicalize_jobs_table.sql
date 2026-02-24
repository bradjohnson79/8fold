-- =============================================================================
-- PHASE 2 + 3 — Canonicalize jobs table + enum reconciliation
-- public.jobs becomes the single source of truth.
-- Idempotent where possible. Forward migrations only.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PHASE 3 — Enum reconciliation (add-only, never drop)
-- Add missing enum values to match apps/api/db/schema/enums.ts
-- =============================================================================

-- JobStatus: COMPLETED, DISPUTED (add-only)
DO $$ BEGIN ALTER TYPE "JobStatus" ADD VALUE 'COMPLETED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "JobStatus" ADD VALUE 'DISPUTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PaymentStatus: AUTHORIZED, FUNDS_SECURED, EXPIRED_UNFUNDED (add-only)
DO $$ BEGIN ALTER TYPE "PaymentStatus" ADD VALUE 'AUTHORIZED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "PaymentStatus" ADD VALUE 'FUNDS_SECURED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED_UNFUNDED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure enums exist (create if missing)
DO $$
BEGIN
  CREATE TYPE "AiAppraisalStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'APPLIED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE TYPE "JobPayoutStatus" AS ENUM ('NOT_READY', 'READY', 'RELEASED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE TYPE "JobSource" AS ENUM ('MOCK', 'REAL', 'AI_REGENERATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE TYPE "PublicJobStatus" AS ENUM ('OPEN', 'IN_PROGRESS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE TYPE "RoutingStatus" AS ENUM ('UNROUTED', 'ROUTED_BY_ROUTER', 'ROUTED_BY_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE TYPE "CountryCode" AS ENUM ('CA', 'US');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE TYPE "CurrencyCode" AS ENUM ('CAD', 'USD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE TYPE "TradeCategory" AS ENUM (
    'PLUMBING', 'ELECTRICAL', 'HVAC', 'APPLIANCE', 'HANDYMAN', 'PAINTING',
    'CARPENTRY', 'DRYWALL', 'ROOFING', 'JANITORIAL_CLEANING', 'LANDSCAPING',
    'FENCING', 'SNOW_REMOVAL', 'JUNK_REMOVAL', 'MOVING', 'AUTOMOTIVE', 'FURNITURE_ASSEMBLY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE TYPE "JobType" AS ENUM ('urban', 'regional');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE TYPE "CustomerRejectReason" AS ENUM ('QUALITY_ISSUE', 'INCOMPLETE_WORK', 'DAMAGE', 'NO_SHOW', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE TYPE "EcdUpdateReason" AS ENUM ('AWAITING_PARTS_MATERIALS', 'SCOPE_EXPANDED', 'SCHEDULING_DELAY', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- PHASE 2 — Create public.jobs if it does not exist
-- Structure matches apps/api/db/schema/job.ts (snake_case)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.jobs (
  id text PRIMARY KEY,
  status "JobStatus" NOT NULL DEFAULT 'PUBLISHED',
  archived boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  scope text NOT NULL,
  region text NOT NULL,
  country "CountryCode" NOT NULL DEFAULT 'US',
  country_code "CountryCode" NOT NULL DEFAULT 'US',
  state_code text NOT NULL DEFAULT '',
  currency "CurrencyCode" NOT NULL DEFAULT 'USD',
  region_code text,
  region_name text,
  city text,
  postal_code text,
  address_full text,
  ai_appraisal_status "AiAppraisalStatus" NOT NULL DEFAULT 'PENDING',
  ai_appraised_at timestamptz,
  ai_suggested_total integer,
  ai_price_range_low integer,
  ai_price_range_high integer,
  ai_confidence text,
  ai_reasoning text,
  pricing_intel jsonb,
  pricing_intel_generated_at timestamptz,
  pricing_intel_model text,
  superseded_by_job_id text,
  is_mock boolean NOT NULL DEFAULT false,
  mock_seed_batch text,
  public_status "PublicJobStatus" NOT NULL DEFAULT 'OPEN',
  job_source "JobSource" NOT NULL DEFAULT 'REAL',
  repeat_contractor_discount_cents integer NOT NULL DEFAULT 0,
  service_type text NOT NULL DEFAULT 'handyman',
  trade_category "TradeCategory" NOT NULL DEFAULT 'HANDYMAN',
  time_window text,
  router_earnings_cents integer NOT NULL DEFAULT 0,
  broker_fee_cents integer NOT NULL DEFAULT 0,
  contractor_payout_cents integer NOT NULL DEFAULT 0,
  labor_total_cents integer NOT NULL DEFAULT 0,
  materials_total_cents integer NOT NULL DEFAULT 0,
  transaction_fee_cents integer NOT NULL DEFAULT 0,
  payment_status "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  payout_status "JobPayoutStatus" NOT NULL DEFAULT 'NOT_READY',
  amount_cents integer NOT NULL DEFAULT 0,
  payment_currency text NOT NULL DEFAULT 'cad',
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_customer_id text,
  stripe_payment_method_id text,
  accepted_at timestamptz,
  authorization_expires_at timestamptz,
  funds_secured_at timestamptz,
  completion_deadline_at timestamptz,
  funded_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  contractor_transfer_id text,
  router_transfer_id text,
  escrow_locked_at timestamptz,
  payment_captured_at timestamptz,
  payment_released_at timestamptz,
  price_median_cents integer,
  price_adjustment_cents integer,
  pricing_version text NOT NULL DEFAULT 'v1-median-delta',
  junk_hauling_items jsonb,
  availability jsonb,
  job_type "JobType" NOT NULL,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  job_poster_user_id text,
  contacted_at timestamptz,
  guarantee_eligible_at timestamptz,
  claimed_at timestamptz,
  claimed_by_user_id text,
  admin_routed_by_id text,
  contractor_user_id text,
  posted_at timestamptz NOT NULL DEFAULT now(),
  routing_due_at timestamptz,
  first_routed_at timestamptz,
  routing_status "RoutingStatus" NOT NULL DEFAULT 'UNROUTED',
  failsafe_routing boolean NOT NULL DEFAULT false,
  routed_at timestamptz,
  contractor_completed_at timestamptz,
  contractor_completion_summary text,
  customer_approved_at timestamptz,
  customer_rejected_at timestamptz,
  customer_reject_reason "CustomerRejectReason",
  customer_reject_notes text,
  customer_feedback text,
  customer_completion_summary text,
  router_approved_at timestamptz,
  router_approval_notes text,
  completion_flagged_at timestamptz,
  completion_flag_reason text,
  contractor_action_token_hash text,
  customer_action_token_hash text,
  estimated_completion_date timestamptz,
  estimate_set_at timestamptz,
  estimate_updated_at timestamptz,
  estimate_update_reason "EcdUpdateReason",
  estimate_update_other_text text
);

-- job_type has no default in Drizzle; legacy may have null. Use COALESCE on copy.
-- For fresh table, we need a default. Add it if column allows.
ALTER TABLE public.jobs ALTER COLUMN job_type SET DEFAULT 'urban'::"JobType";

-- Indexes
CREATE INDEX IF NOT EXISTS jobs_archived_idx ON public.jobs(archived);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_routing_status ON public.jobs(routing_status);
CREATE INDEX IF NOT EXISTS idx_jobs_payout_status ON public.jobs(payout_status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at);

-- =============================================================================
-- PHASE 2 — Copy data from legacy public."Job" if it exists and has rows
-- public.jobs is empty or has fewer rows. Column mapping: camelCase → snake_case.
-- =============================================================================

DO $$
DECLARE
  legacy_count bigint;
  canonical_count bigint;
  copy_count bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Job') THEN
    RAISE NOTICE 'Legacy public."Job" does not exist. Skip copy.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public."Job"' INTO legacy_count;
  EXECUTE 'SELECT count(*) FROM public.jobs' INTO canonical_count;

  IF legacy_count = 0 THEN
    RAISE NOTICE 'Legacy public."Job" has 0 rows. Skip copy.';
    RETURN;
  END IF;

  -- Copy only if canonical has fewer rows (avoid duplicate inserts)
  IF canonical_count >= legacy_count THEN
    RAISE NOTICE 'public.jobs already has % rows, legacy has %. Skip copy.', canonical_count, legacy_count;
    RETURN;
  END IF;

  -- Insert from legacy with column mapping (camelCase → snake_case)
  -- Use ON CONFLICT DO NOTHING to be idempotent
  INSERT INTO public.jobs (
    id, status, archived, title, scope, region, country, country_code, state_code, currency,
    region_code, region_name, city, postal_code, address_full,
    ai_appraisal_status, ai_appraised_at, ai_suggested_total, ai_price_range_low, ai_price_range_high,
    ai_confidence, ai_reasoning, pricing_intel, pricing_intel_generated_at, pricing_intel_model,
    superseded_by_job_id, is_mock, mock_seed_batch, public_status, job_source,
    repeat_contractor_discount_cents, service_type, trade_category, time_window,
    router_earnings_cents, broker_fee_cents, contractor_payout_cents,
    labor_total_cents, materials_total_cents, transaction_fee_cents,
    payment_status, payout_status, amount_cents, payment_currency,
    stripe_payment_intent_id, stripe_charge_id, stripe_customer_id, stripe_payment_method_id,
    accepted_at, authorization_expires_at, funds_secured_at, completion_deadline_at,
    funded_at, released_at, refunded_at, contractor_transfer_id, router_transfer_id,
    escrow_locked_at, payment_captured_at, payment_released_at,
    price_median_cents, price_adjustment_cents, pricing_version, junk_hauling_items, availability,
    job_type, lat, lng,
    created_at, published_at, updated_at, job_poster_user_id,
    contacted_at, guarantee_eligible_at, claimed_at, claimed_by_user_id,
    admin_routed_by_id, contractor_user_id, posted_at, routing_due_at, first_routed_at,
    routing_status, failsafe_routing, routed_at,
    contractor_completed_at, contractor_completion_summary,
    customer_approved_at, customer_rejected_at, customer_reject_reason, customer_reject_notes,
    customer_feedback, customer_completion_summary,
    router_approved_at, router_approval_notes,
    completion_flagged_at, completion_flag_reason,
    contractor_action_token_hash, customer_action_token_hash,
    estimated_completion_date, estimate_set_at, estimate_updated_at,
    estimate_update_reason, estimate_update_other_text
  )
  SELECT
    j.id,
    COALESCE(j.status::text::"JobStatus", 'PUBLISHED'),
    COALESCE(j."archived", false),
    j.title, j.scope, j.region,
    COALESCE(j.country::text::"CountryCode", 'US'),
    COALESCE(j."countryCode"::text::"CountryCode", 'US'),
    COALESCE(j."stateCode", ''),
    COALESCE(j.currency::text::"CurrencyCode", 'USD'),
    j."regionCode", j."regionName", j.city, j."postalCode", j."addressFull",
    COALESCE(j."aiAppraisalStatus"::text::"AiAppraisalStatus", 'PENDING'),
    j."aiAppraisedAt", j."aiSuggestedTotal", j."aiPriceRangeLow", j."aiPriceRangeHigh",
    j."aiConfidence", j."aiReasoning", j."pricingIntel", j."pricingIntelGeneratedAt", j."pricingIntelModel",
    j."supersededByJobId",
    COALESCE(j."isMock", false), j."mockSeedBatch",
    COALESCE(j."publicStatus"::text::"PublicJobStatus", 'OPEN'),
    COALESCE(j."jobSource"::text::"JobSource", 'REAL'),
    COALESCE(j."repeatContractorDiscountCents", 0),
    COALESCE(j."serviceType", 'handyman'),
    COALESCE(j."tradeCategory"::text::"TradeCategory", 'HANDYMAN'),
    j."timeWindow",
    COALESCE(j."routerEarningsCents", 0), COALESCE(j."brokerFeeCents", 0), COALESCE(j."contractorPayoutCents", 0),
    COALESCE(j."laborTotalCents", 0), COALESCE(j."materialsTotalCents", 0), COALESCE(j."transactionFeeCents", 0),
    COALESCE(j."paymentStatus"::text::"PaymentStatus", 'UNPAID'),
    COALESCE(j."payoutStatus"::text::"JobPayoutStatus", 'NOT_READY'),
    COALESCE(j."amountCents", 0),
    COALESCE(j."paymentCurrency", 'cad'),
    j."stripePaymentIntentId", j."stripeChargeId", j."stripeCustomerId", j."stripePaymentMethodId",
    j."acceptedAt", j."authorizationExpiresAt", j."fundsSecuredAt", j."completionDeadlineAt",
    j."fundedAt", j."releasedAt", j."refundedAt",
    j."contractorTransferId", j."routerTransferId",
    j."escrowLockedAt", j."paymentCapturedAt", j."paymentReleasedAt",
    j."priceMedianCents", j."priceAdjustmentCents",
    COALESCE(j."pricingVersion", 'v1-median-delta'),
    j."junkHaulingItems", j.availability,
    COALESCE(j."jobType"::text::"JobType", 'urban'),
    j.lat, j.lng,
    COALESCE(j."createdAt", now()), COALESCE(j."publishedAt", now()), COALESCE(j."updatedAt", now()),
    j."jobPosterUserId", j."contactedAt", j."guaranteeEligibleAt",
    j."claimedAt", j."claimedByUserId", j."adminRoutedById", j."contractorUserId",
    COALESCE(j."postedAt", now()), j."routingDueAt", j."firstRoutedAt",
    COALESCE(j."routingStatus"::text::"RoutingStatus", 'UNROUTED'),
    COALESCE(j."failsafeRouting", false), j."routedAt",
    j."contractorCompletedAt", j."contractorCompletionSummary",
    j."customerApprovedAt", j."customerRejectedAt",
    j."customerRejectReason"::text::"CustomerRejectReason",
    j."customerRejectNotes", j."customerFeedback", j."customerCompletionSummary",
    j."routerApprovedAt", j."routerApprovalNotes",
    j."completionFlaggedAt", j."completionFlagReason",
    j."contractorActionTokenHash", j."customerActionTokenHash",
    j."estimatedCompletionDate", j."estimateSetAt", j."estimateUpdatedAt",
    j."estimateUpdateReason"::text::"EcdUpdateReason", j."estimateUpdateOtherText"
  FROM public."Job" j
  WHERE NOT EXISTS (SELECT 1 FROM public.jobs c WHERE c.id = j.id);

  GET DIAGNOSTICS copy_count = ROW_COUNT;
  RAISE NOTICE 'Copied % rows from public."Job" to public.jobs', copy_count;

  -- Validate row counts
  EXECUTE 'SELECT count(*) FROM public.jobs' INTO canonical_count;
  IF canonical_count < legacy_count THEN
    RAISE WARNING 'Row count mismatch: jobs=%, legacy=%', canonical_count, legacy_count;
  END IF;

  -- Rename legacy table (do NOT drop)
  ALTER TABLE public."Job" RENAME TO "_Job_legacy_backup";
  RAISE NOTICE 'Renamed public."Job" to public._Job_legacy_backup';
END $$;

-- 8fold_test."Job": production migration targets public schema only.
-- If 8fold_test."Job" exists (local/dev), run diagnose script and handle separately.

COMMIT;
