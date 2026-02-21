-- Parts & Materials (P&M) Sub-Escrow System
-- Separate from main job escrow. P&M only active when Job.status = IN_PROGRESS.

-- Add PM ledger entry types (add-only)
DO $$
DECLARE
  s TEXT := current_schema();
BEGIN
  BEGIN
    EXECUTE format('ALTER TYPE %I."LedgerEntryType" ADD VALUE IF NOT EXISTS ''PM_ESCROW_FUNDED''', s);
    EXECUTE format('ALTER TYPE %I."LedgerEntryType" ADD VALUE IF NOT EXISTS ''PM_RELEASE''', s);
    EXECUTE format('ALTER TYPE %I."LedgerEntryType" ADD VALUE IF NOT EXISTS ''PM_REFUND''', s);
    EXECUTE format('ALTER TYPE %I."LedgerEntryType" ADD VALUE IF NOT EXISTS ''PM_CREDIT''', s);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
DECLARE
  s TEXT := current_schema();
BEGIN
  -- PMRequestStatus enum for new P&M state machine
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'PMRequestStatus' AND n.nspname = s) THEN
    EXECUTE format('CREATE TYPE %I."PMRequestStatus" AS ENUM (
      ''DRAFT'', ''SUBMITTED'', ''AMENDMENT_REQUESTED'', ''APPROVED'',
      ''PAYMENT_PENDING'', ''FUNDED'', ''RECEIPTS_SUBMITTED'', ''VERIFIED'',
      ''RELEASED'', ''CLOSED'', ''REJECTED''
    )', s);
  END IF;

  -- PmRequest table (P&M sub-escrow request)
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I."PmRequest" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "jobId" text NOT NULL REFERENCES %I."Job"("id"),
      "contractorId" text NOT NULL,
      "jobPosterUserId" text NOT NULL,
      "initiatedBy" text NOT NULL,
      "status" "PMRequestStatus" NOT NULL DEFAULT ''DRAFT''::"PMRequestStatus",
      "autoTotal" decimal(12,2) NOT NULL DEFAULT 0,
      "manualTotal" decimal(12,2),
      "approvedTotal" decimal(12,2),
      "taxAmount" decimal(12,2),
      "currency" text NOT NULL DEFAULT ''USD'',
      "stripePaymentIntentId" text,
      "escrowId" uuid REFERENCES %I."Escrow"("id"),
      "amendReason" text,
      "proposedBudget" decimal(12,2),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )',
    s, s, s
  );

  EXECUTE format('CREATE INDEX IF NOT EXISTS "PmRequest_jobId_idx" ON %I."PmRequest" ("jobId")', s);
  EXECUTE format('CREATE INDEX IF NOT EXISTS "PmRequest_status_idx" ON %I."PmRequest" ("status")', s);

  -- PmLineItem table
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I."PmLineItem" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "pmRequestId" uuid NOT NULL REFERENCES %I."PmRequest"("id") ON DELETE CASCADE,
      "description" text NOT NULL,
      "quantity" integer NOT NULL,
      "unitPrice" decimal(12,2) NOT NULL,
      "url" text,
      "lineTotal" decimal(12,2) NOT NULL
    )',
    s, s
  );

  EXECUTE format('CREATE INDEX IF NOT EXISTS "PmLineItem_pmRequestId_idx" ON %I."PmLineItem" ("pmRequestId")', s);

  -- PmReceipt table
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I."PmReceipt" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "pmRequestId" uuid NOT NULL REFERENCES %I."PmRequest"("id") ON DELETE CASCADE,
      "fileBase64" text NOT NULL,
      "extractedTotal" decimal(12,2),
      "verified" boolean NOT NULL DEFAULT false,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )',
    s, s
  );

  EXECUTE format('CREATE INDEX IF NOT EXISTS "PmReceipt_pmRequestId_idx" ON %I."PmReceipt" ("pmRequestId")', s);

  -- Add pmRequestId to ContractorPayout for P&M release tracking
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = s AND table_name = 'ContractorPayout') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ContractorPayout' AND column_name = 'pmRequestId'
    ) THEN
      EXECUTE format('ALTER TABLE %I."ContractorPayout" ADD COLUMN "pmRequestId" uuid REFERENCES %I."PmRequest"("id")', s, s);
    END IF;
  END IF;
END $$;
