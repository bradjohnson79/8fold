-- Add job + parts/materials payment/payout state columns (Stripe integration foundation)
-- Schema: 8fold_test

-- 1) Enums (safe create)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = '8fold_test' AND t.typname = 'PaymentStatus'
  ) THEN
    CREATE TYPE "8fold_test"."PaymentStatus" AS ENUM ('UNPAID', 'REQUIRES_ACTION', 'FUNDED', 'FAILED', 'REFUNDED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = '8fold_test' AND t.typname = 'JobPayoutStatus'
  ) THEN
    CREATE TYPE "8fold_test"."JobPayoutStatus" AS ENUM ('NOT_READY', 'READY', 'RELEASED', 'FAILED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = '8fold_test' AND t.typname = 'PartsMaterialReleaseStatus'
  ) THEN
    CREATE TYPE "8fold_test"."PartsMaterialReleaseStatus" AS ENUM ('NOT_READY', 'READY', 'RELEASED', 'FAILED');
  END IF;
END $$;

-- 2) Job table columns (additive, safe)
ALTER TABLE "8fold_test"."Job"
  ADD COLUMN IF NOT EXISTS "paymentStatus" "8fold_test"."PaymentStatus" NOT NULL DEFAULT 'UNPAID'::"8fold_test"."PaymentStatus",
  ADD COLUMN IF NOT EXISTS "payoutStatus" "8fold_test"."JobPayoutStatus" NOT NULL DEFAULT 'NOT_READY'::"8fold_test"."JobPayoutStatus",
  ADD COLUMN IF NOT EXISTS "amountCents" integer NOT NULL DEFAULT 0,
  -- Stripe currency is lowercase per Stripe API (e.g. "cad"). Keep existing Job.currency (CurrencyCode enum) unchanged.
  ADD COLUMN IF NOT EXISTS "paymentCurrency" text NOT NULL DEFAULT 'cad',
  ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" text,
  ADD COLUMN IF NOT EXISTS "stripeChargeId" text,
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" text,
  ADD COLUMN IF NOT EXISTS "stripePaymentMethodId" text,
  ADD COLUMN IF NOT EXISTS "fundedAt" timestamp without time zone,
  ADD COLUMN IF NOT EXISTS "releasedAt" timestamp without time zone,
  ADD COLUMN IF NOT EXISTS "contractorTransferId" text,
  ADD COLUMN IF NOT EXISTS "routerTransferId" text;

CREATE INDEX IF NOT EXISTS "Job_paymentStatus_idx" ON "8fold_test"."Job" ("paymentStatus");
CREATE INDEX IF NOT EXISTS "Job_payoutStatus_idx" ON "8fold_test"."Job" ("payoutStatus");
CREATE INDEX IF NOT EXISTS "Job_stripePaymentIntentId_idx" ON "8fold_test"."Job" ("stripePaymentIntentId");

-- 3) PartsMaterialRequest columns (additive, safe)
ALTER TABLE "8fold_test"."PartsMaterialRequest"
  ADD COLUMN IF NOT EXISTS "paymentStatus" "8fold_test"."PaymentStatus" NOT NULL DEFAULT 'UNPAID'::"8fold_test"."PaymentStatus",
  ADD COLUMN IF NOT EXISTS "currency" text NOT NULL DEFAULT 'cad',
  ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" text,
  ADD COLUMN IF NOT EXISTS "fundedAt" timestamp without time zone,
  ADD COLUMN IF NOT EXISTS "releaseStatus" "8fold_test"."PartsMaterialReleaseStatus" NOT NULL DEFAULT 'NOT_READY'::"8fold_test"."PartsMaterialReleaseStatus",
  ADD COLUMN IF NOT EXISTS "contractorTransferId" text;

CREATE INDEX IF NOT EXISTS "PartsMaterialRequest_paymentStatus_idx" ON "8fold_test"."PartsMaterialRequest" ("paymentStatus");
CREATE INDEX IF NOT EXISTS "PartsMaterialRequest_releaseStatus_idx" ON "8fold_test"."PartsMaterialRequest" ("releaseStatus");
CREATE INDEX IF NOT EXISTS "PartsMaterialRequest_stripePaymentIntentId_idx" ON "8fold_test"."PartsMaterialRequest" ("stripePaymentIntentId");

-- NOTE:
-- Stripe webhook idempotency is already implemented via "8fold_test"."StripeWebhookEvent" (id is Stripe event id PK).

