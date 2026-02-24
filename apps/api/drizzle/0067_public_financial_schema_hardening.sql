-- 0067: Canonicalize production schema to public
-- Makes public the hardened financial schema (TransferRecord + LedgerEntry stripeRef + uniqueness).
-- DO NOT EXECUTE until reviewed. Generated from 8fold_test canonical definitions.
--
-- Pre-flight: Run pre-migration-duplicate-audit.ts against public schema before applying.
--
-- Context:
--   public.LedgerEntry: legacy (no stripeRef, no partial unique)
--   public.TransferRecord: does not exist
--   8fold_test: hardened (has both tables, stripeRef, uniqueness indexes)
--
-- This migration:
--   1. Creates public."TransferRecord" identical to 8fold_test version (with public FK refs)
--   2. Adds stripeRef to public."LedgerEntry" if missing
--   3. Adds UNIQUE (jobId, role) on public."TransferRecord"
--   4. Adds partial UNIQUE (jobId, type, stripeRef) WHERE stripeRef IS NOT NULL on public."LedgerEntry"

-- =============================================================================
-- 1. CREATE public."TransferRecord"
-- =============================================================================
CREATE TABLE IF NOT EXISTS public."TransferRecord" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "jobId" text NOT NULL,
  role text NOT NULL,
  "userId" text NOT NULL,
  "amountCents" integer NOT NULL,
  currency text NOT NULL,
  method text NOT NULL,
  "stripeTransferId" text,
  "externalRef" text,
  status text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "releasedAt" timestamptz,
  "failureReason" text,
  PRIMARY KEY (id),
  CONSTRAINT "TransferRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public.jobs(id),
  CONSTRAINT "TransferRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id),
  CONSTRAINT "TransferRecord_method_stripe_only" CHECK (method = 'STRIPE')
);

-- Indexes for TransferRecord (matching 8fold_test)
CREATE INDEX IF NOT EXISTS "TransferRecord_jobId_idx" ON public."TransferRecord" ("jobId");
CREATE INDEX IF NOT EXISTS "TransferRecord_userId_idx" ON public."TransferRecord" ("userId");
CREATE INDEX IF NOT EXISTS "TransferRecord_status_idx" ON public."TransferRecord" (status);
CREATE INDEX IF NOT EXISTS "TransferRecord_method_idx" ON public."TransferRecord" (method);
CREATE INDEX IF NOT EXISTS "TransferRecord_role_idx" ON public."TransferRecord" (role);
CREATE INDEX IF NOT EXISTS "TransferRecord_createdAt_idx" ON public."TransferRecord" ("createdAt" DESC);

-- UNIQUE (jobId, role) on TransferRecord
CREATE UNIQUE INDEX IF NOT EXISTS "TransferRecord_job_role_uniq" ON public."TransferRecord" ("jobId", role);

-- =============================================================================
-- 2. ALTER public."LedgerEntry" — add stripeRef if missing
-- =============================================================================
ALTER TABLE public."LedgerEntry"
  ADD COLUMN IF NOT EXISTS "stripeRef" text;

-- =============================================================================
-- 3. Partial UNIQUE (jobId, type, stripeRef) WHERE stripeRef IS NOT NULL
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_job_type_stripeRef_uniq"
  ON public."LedgerEntry" ("jobId", type, "stripeRef")
  WHERE ("jobId" IS NOT NULL AND "stripeRef" IS NOT NULL);
