-- Canonicalize public."Job" to Drizzle schema (Path A).
-- Adds all missing columns. Preserves existing data.
-- Does NOT drop columns. All new columns NULLABLE.
-- Does NOT drop legacy: amountcents, paymentstatus, publicstatus.
-- SKIP if public."Job" does not exist (0054 may have renamed it to jobs).

DO $$
BEGIN
  CREATE TYPE public."AiAppraisalStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'APPLIED', 'SUPERSEDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public."JobPayoutStatus" AS ENUM ('NOT_READY', 'READY', 'RELEASED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public."JobSource" AS ENUM ('MOCK', 'REAL', 'AI_REGENERATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public."PaymentStatus" AS ENUM (
    'UNPAID', 'REQUIRES_ACTION', 'FUNDED', 'FAILED', 'REFUNDED',
    'AUTHORIZED', 'FUNDS_SECURED', 'EXPIRED_UNFUNDED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public."PublicJobStatus" AS ENUM ('OPEN', 'IN_PROGRESS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public."RoutingStatus" AS ENUM ('UNROUTED', 'ROUTED_BY_ROUTER', 'ROUTED_BY_ADMIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2) Add missing columns (all NULLABLE; IF NOT EXISTS) - only if Job exists
--    (0054 may have renamed Job to jobs; skip if so)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Job') THEN
    RAISE NOTICE 'Skipping 0057 column adds: public.Job does not exist (likely renamed to jobs by 0054)';
    RETURN;
  END IF;

  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "countryCode" public."CountryCode";
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "stateCode" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "currency" public."CurrencyCode";
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "regionCode" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "regionName" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "postalCode" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "addressFull" text;

  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "aiAppraisalStatus" public."AiAppraisalStatus";
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "aiAppraisedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "aiSuggestedTotal" integer;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "aiPriceRangeLow" integer;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "aiPriceRangeHigh" integer;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "aiConfidence" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "aiReasoning" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "pricingIntel" jsonb;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "pricingIntelGeneratedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "pricingIntelModel" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "supersededByJobId" text;

  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "isMock" boolean;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "mockSeedBatch" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "jobSource" public."JobSource";
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "repeatContractorDiscountCents" integer;

  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "payoutStatus" public."JobPayoutStatus";
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "paymentCurrency" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "stripeChargeId" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "stripeCustomerId" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "stripePaymentMethodId" text;

  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "acceptedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "authorizationExpiresAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "fundsSecuredAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "completionDeadlineAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "fundedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "releasedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "refundedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "contractorTransferId" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "routerTransferId" text;

  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "escrowLockedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "paymentCapturedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "paymentReleasedAt" timestamptz;

  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "priceMedianCents" integer;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "priceAdjustmentCents" integer;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "pricingVersion" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "junkHaulingItems" jsonb;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "availability" jsonb;

  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "contactedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "guaranteeEligibleAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "adminRoutedById" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "contractorUserId" text;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "postedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "routingDueAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "firstRoutedAt" timestamptz;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "routingStatus" public."RoutingStatus";
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "failsafeRouting" boolean;
  ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "customerCompletionSummary" text;

  CREATE INDEX IF NOT EXISTS "Job_archived_idx" ON public."Job" ("archived");
END $$;
