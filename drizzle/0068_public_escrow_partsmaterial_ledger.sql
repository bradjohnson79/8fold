-- 0068: Public schema financial alignment
-- Brings Escrow, PartsMaterialRequest, and LedgerEntry into public schema.
-- 0008 targeted test schema only; production/preview use public.
--
-- Preconditions: public.jobs, public."Contractor" exist.
-- Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

-- =============================================================================
-- 1. Enums (create in public if missing)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'EscrowKind'
  ) THEN
    CREATE TYPE public."EscrowKind" AS ENUM ('JOB_ESCROW', 'PARTS_MATERIALS');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'EscrowStatus'
  ) THEN
    CREATE TYPE public."EscrowStatus" AS ENUM ('PENDING', 'FUNDED', 'RELEASED', 'REFUNDED', 'FAILED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PartsMaterialStatus'
  ) THEN
    CREATE TYPE public."PartsMaterialStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED');
  END IF;
END $$;

-- =============================================================================
-- 2. Escrow table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public."Escrow" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobId" text NOT NULL REFERENCES public.jobs(id),
  "kind" public."EscrowKind" NOT NULL,
  "amountCents" integer NOT NULL,
  "currency" public."CurrencyCode" NOT NULL,
  "status" public."EscrowStatus" NOT NULL DEFAULT 'PENDING'::public."EscrowStatus",
  "stripeCheckoutSessionId" text UNIQUE,
  "stripePaymentIntentId" text UNIQUE,
  "webhookProcessedAt" timestamp without time zone,
  "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Escrow_amountCents_positive" CHECK ("amountCents" > 0)
);

CREATE INDEX IF NOT EXISTS "Escrow_jobId_idx" ON public."Escrow" ("jobId");
CREATE INDEX IF NOT EXISTS "Escrow_status_idx" ON public."Escrow" ("status");
CREATE INDEX IF NOT EXISTS "Escrow_stripeCheckoutSessionId_idx" ON public."Escrow" ("stripeCheckoutSessionId");
CREATE INDEX IF NOT EXISTS "Escrow_stripePaymentIntentId_idx" ON public."Escrow" ("stripePaymentIntentId");

-- =============================================================================
-- 3. PartsMaterialRequest table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public."PartsMaterialRequest" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobId" text NOT NULL REFERENCES public.jobs(id),
  "contractorId" text NOT NULL REFERENCES public."Contractor"("id"),
  "amountCents" integer NOT NULL,
  "description" text NOT NULL,
  "status" public."PartsMaterialStatus" NOT NULL,
  "escrowId" uuid REFERENCES public."Escrow"("id"),
  "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartsMaterialRequest_amountCents_positive" CHECK ("amountCents" > 0)
);

CREATE INDEX IF NOT EXISTS "PartsMaterialRequest_jobId_idx" ON public."PartsMaterialRequest" ("jobId");
CREATE INDEX IF NOT EXISTS "PartsMaterialRequest_contractorId_idx" ON public."PartsMaterialRequest" ("contractorId");
CREATE INDEX IF NOT EXISTS "PartsMaterialRequest_status_idx" ON public."PartsMaterialRequest" ("status");

-- =============================================================================
-- 4. LedgerEntry: upgrade if id is text (legacy) or add missing columns
-- =============================================================================
DO $$
DECLARE
  col_id_type text;
  has_escrow_id boolean;
  has_currency boolean;
  has_stripe_ref boolean;
BEGIN
  SELECT data_type INTO col_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'LedgerEntry' AND column_name = 'id';

  IF col_id_type IS NULL THEN
    CREATE TABLE public."LedgerEntry" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "userId" text NOT NULL,
      "jobId" text REFERENCES public.jobs(id),
      "escrowId" uuid REFERENCES public."Escrow"("id"),
      "type" public."LedgerEntryType" NOT NULL,
      "direction" public."LedgerDirection" NOT NULL,
      "bucket" public."LedgerBucket" NOT NULL,
      "amountCents" integer NOT NULL,
      "currency" public."CurrencyCode" NOT NULL DEFAULT 'USD'::public."CurrencyCode",
      "stripeRef" text,
      "memo" text,
      CONSTRAINT "LedgerEntry_amountCents_positive" CHECK ("amountCents" > 0)
    );
    CREATE INDEX IF NOT EXISTS "LedgerEntry_jobId_idx" ON public."LedgerEntry" ("jobId");
    CREATE INDEX IF NOT EXISTS "LedgerEntry_escrowId_idx" ON public."LedgerEntry" ("escrowId");
    CREATE INDEX IF NOT EXISTS "LedgerEntry_type_idx" ON public."LedgerEntry" ("type");
    CREATE INDEX IF NOT EXISTS "LedgerEntry_stripeRef_idx" ON public."LedgerEntry" ("stripeRef");
    RETURN;
  END IF;

  IF col_id_type = 'text' THEN
    ALTER TABLE public."LedgerEntry" RENAME TO "LedgerEntry_old";
    CREATE TABLE public."LedgerEntry" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "userId" text NOT NULL,
      "jobId" text REFERENCES public.jobs(id),
      "escrowId" uuid REFERENCES public."Escrow"("id"),
      "type" public."LedgerEntryType" NOT NULL,
      "direction" public."LedgerDirection" NOT NULL,
      "bucket" public."LedgerBucket" NOT NULL,
      "amountCents" integer NOT NULL,
      "currency" public."CurrencyCode" NOT NULL DEFAULT 'USD'::public."CurrencyCode",
      "stripeRef" text,
      "memo" text,
      CONSTRAINT "LedgerEntry_amountCents_positive" CHECK ("amountCents" > 0)
    );
    INSERT INTO public."LedgerEntry" ("createdAt", "userId", "jobId", "type", "direction", "bucket", "amountCents", "currency", "memo")
    SELECT "createdAt", "userId", "jobId", "type", "direction", "bucket", "amountCents", 'USD'::public."CurrencyCode", "memo"
    FROM public."LedgerEntry_old";
    DROP TABLE public."LedgerEntry_old";
    CREATE INDEX IF NOT EXISTS "LedgerEntry_jobId_idx" ON public."LedgerEntry" ("jobId");
    CREATE INDEX IF NOT EXISTS "LedgerEntry_escrowId_idx" ON public."LedgerEntry" ("escrowId");
    CREATE INDEX IF NOT EXISTS "LedgerEntry_type_idx" ON public."LedgerEntry" ("type");
    CREATE INDEX IF NOT EXISTS "LedgerEntry_stripeRef_idx" ON public."LedgerEntry" ("stripeRef");
  ELSE
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LedgerEntry' AND column_name = 'escrowId') INTO has_escrow_id;
    IF NOT has_escrow_id THEN
      ALTER TABLE public."LedgerEntry" ADD COLUMN "escrowId" uuid REFERENCES public."Escrow"("id");
      CREATE INDEX IF NOT EXISTS "LedgerEntry_escrowId_idx" ON public."LedgerEntry" ("escrowId");
    END IF;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LedgerEntry' AND column_name = 'currency') INTO has_currency;
    IF NOT has_currency THEN
      ALTER TABLE public."LedgerEntry" ADD COLUMN "currency" public."CurrencyCode" NOT NULL DEFAULT 'USD'::public."CurrencyCode";
    END IF;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LedgerEntry' AND column_name = 'stripeRef') INTO has_stripe_ref;
    IF NOT has_stripe_ref THEN
      ALTER TABLE public."LedgerEntry" ADD COLUMN "stripeRef" text;
      CREATE INDEX IF NOT EXISTS "LedgerEntry_stripeRef_idx" ON public."LedgerEntry" ("stripeRef");
    END IF;
  END IF;
END $$;
