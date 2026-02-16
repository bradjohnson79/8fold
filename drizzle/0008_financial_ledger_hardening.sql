-- Financial ledger hardening (bank-ledger foundations)
-- Schema: 8fold_test (authoritative via DATABASE_URL ?schema=...)
-- Goals:
-- - Introduce Escrow + PartsMaterialRequest tables
-- - Upgrade LedgerEntry to UUID PK + add escrowId/currency/stripeRef
-- - Enforce amountCents > 0
-- - Add minimal idempotency guardrails for escrow funding

-- 1) Extend existing LedgerEntryType enum with bank-ledger values (add-only).
-- IMPORTANT: New enum values must be COMMITTED before they can be referenced
-- (e.g. by partial indexes). So we do this in its own transaction.
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = '8fold_test' AND t.typname = 'LedgerEntryType'
  ) THEN
    -- Add values if missing (order is append-only in Postgres).
    BEGIN
      ALTER TYPE "8fold_test"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'ESCROW_FUND';
      ALTER TYPE "8fold_test"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'PNM_FUND';
      ALTER TYPE "8fold_test"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'ESCROW_RELEASE';
      ALTER TYPE "8fold_test"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'ESCROW_REFUND';
      ALTER TYPE "8fold_test"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'PLATFORM_FEE';
      ALTER TYPE "8fold_test"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'ROUTER_EARN';
      ALTER TYPE "8fold_test"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'CONTRACTOR_EARN';
    EXCEPTION
      WHEN duplicate_object THEN
        -- ignore
        NULL;
    END;
  END IF;
END $$;
COMMIT;

-- Everything else can be done transactionally.
BEGIN;

-- 2) Create new enums for Escrow + Parts/Materials requests (safe create).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = '8fold_test' AND t.typname = 'EscrowKind'
  ) THEN
    CREATE TYPE "8fold_test"."EscrowKind" AS ENUM ('JOB_ESCROW', 'PARTS_MATERIALS');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = '8fold_test' AND t.typname = 'EscrowStatus'
  ) THEN
    CREATE TYPE "8fold_test"."EscrowStatus" AS ENUM ('PENDING', 'FUNDED', 'RELEASED', 'REFUNDED', 'FAILED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = '8fold_test' AND t.typname = 'PartsMaterialStatus'
  ) THEN
    CREATE TYPE "8fold_test"."PartsMaterialStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED');
  END IF;
END $$;

-- 3) Create Escrow table.
CREATE TABLE IF NOT EXISTS "8fold_test"."Escrow" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobId" text NOT NULL REFERENCES "8fold_test"."Job"("id"),
  "kind" "8fold_test"."EscrowKind" NOT NULL,
  "amountCents" integer NOT NULL,
  "currency" "8fold_test"."CurrencyCode" NOT NULL,
  "status" "8fold_test"."EscrowStatus" NOT NULL DEFAULT 'PENDING'::"8fold_test"."EscrowStatus",
  "stripeCheckoutSessionId" text UNIQUE,
  "stripePaymentIntentId" text UNIQUE,
  "webhookProcessedAt" timestamp without time zone,
  "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Escrow_amountCents_positive" CHECK ("amountCents" > 0)
);

CREATE INDEX IF NOT EXISTS "Escrow_jobId_idx" ON "8fold_test"."Escrow" ("jobId");
CREATE INDEX IF NOT EXISTS "Escrow_status_idx" ON "8fold_test"."Escrow" ("status");
CREATE INDEX IF NOT EXISTS "Escrow_stripeCheckoutSessionId_idx" ON "8fold_test"."Escrow" ("stripeCheckoutSessionId");
CREATE INDEX IF NOT EXISTS "Escrow_stripePaymentIntentId_idx" ON "8fold_test"."Escrow" ("stripePaymentIntentId");

-- 4) Create PartsMaterialRequest table.
CREATE TABLE IF NOT EXISTS "8fold_test"."PartsMaterialRequest" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobId" text NOT NULL REFERENCES "8fold_test"."Job"("id"),
  "contractorId" text NOT NULL REFERENCES "8fold_test"."Contractor"("id"),
  "amountCents" integer NOT NULL,
  "description" text NOT NULL,
  "status" "8fold_test"."PartsMaterialStatus" NOT NULL,
  "escrowId" uuid REFERENCES "8fold_test"."Escrow"("id"),
  "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartsMaterialRequest_amountCents_positive" CHECK ("amountCents" > 0)
);

CREATE INDEX IF NOT EXISTS "PartsMaterialRequest_jobId_idx" ON "8fold_test"."PartsMaterialRequest" ("jobId");
CREATE INDEX IF NOT EXISTS "PartsMaterialRequest_contractorId_idx" ON "8fold_test"."PartsMaterialRequest" ("contractorId");
CREATE INDEX IF NOT EXISTS "PartsMaterialRequest_status_idx" ON "8fold_test"."PartsMaterialRequest" ("status");

-- 5) Upgrade LedgerEntry to be closer to a bank ledger.
-- Current LedgerEntry PK is text (Prisma cuid). We rebuild into a UUID PK table
-- because ids are not UUID-castable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = '8fold_test' AND table_name = 'LedgerEntry' AND column_name = 'id'
      AND data_type = 'text'
  ) THEN
    -- Rename existing table out of the way.
    ALTER TABLE "8fold_test"."LedgerEntry" RENAME TO "LedgerEntry_old";

    -- Recreate table with hardened shape (keeping wallet columns used by the app).
    CREATE TABLE "8fold_test"."LedgerEntry" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "userId" text NOT NULL,
      "jobId" text REFERENCES "8fold_test"."Job"("id"),
      "escrowId" uuid REFERENCES "8fold_test"."Escrow"("id"),
      "type" "8fold_test"."LedgerEntryType" NOT NULL,
      "direction" "8fold_test"."LedgerDirection" NOT NULL,
      "bucket" "8fold_test"."LedgerBucket" NOT NULL,
      "amountCents" integer NOT NULL,
      "currency" "8fold_test"."CurrencyCode" NOT NULL DEFAULT 'USD'::"8fold_test"."CurrencyCode",
      "stripeRef" text,
      "memo" text,
      CONSTRAINT "LedgerEntry_amountCents_positive" CHECK ("amountCents" > 0)
    );

    -- Copy historical rows (assign new UUID ids, default currency=USD).
    INSERT INTO "8fold_test"."LedgerEntry" (
      "createdAt","userId","jobId","type","direction","bucket","amountCents","memo"
    )
    SELECT
      "createdAt","userId","jobId","type","direction","bucket","amountCents","memo"
    FROM "8fold_test"."LedgerEntry_old";

    -- Drop old table.
    DROP TABLE "8fold_test"."LedgerEntry_old";

    -- Recreate immutability triggers (used by existing tests).
    DROP TRIGGER IF EXISTS ledger_entry_no_update ON "8fold_test"."LedgerEntry";
    DROP TRIGGER IF EXISTS ledger_entry_no_delete ON "8fold_test"."LedgerEntry";

    CREATE TRIGGER ledger_entry_no_update
      BEFORE UPDATE ON "8fold_test"."LedgerEntry"
      FOR EACH ROW EXECUTE FUNCTION ledger_entry_immutable();
    CREATE TRIGGER ledger_entry_no_delete
      BEFORE DELETE ON "8fold_test"."LedgerEntry"
      FOR EACH ROW EXECUTE FUNCTION ledger_entry_immutable();

    -- Indexes for reads + audit.
    CREATE INDEX IF NOT EXISTS "LedgerEntry_jobId_idx" ON "8fold_test"."LedgerEntry" ("jobId");
    CREATE INDEX IF NOT EXISTS "LedgerEntry_escrowId_idx" ON "8fold_test"."LedgerEntry" ("escrowId");
    CREATE INDEX IF NOT EXISTS "LedgerEntry_type_idx" ON "8fold_test"."LedgerEntry" ("type");
    CREATE INDEX IF NOT EXISTS "LedgerEntry_stripeRef_idx" ON "8fold_test"."LedgerEntry" ("stripeRef");

    -- Idempotency guardrail: only one ESCROW_FUND credit per escrow.
    CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_escrow_fund_once"
      ON "8fold_test"."LedgerEntry" ("escrowId")
      WHERE ("escrowId" IS NOT NULL)
        AND ("type" = 'ESCROW_FUND'::"8fold_test"."LedgerEntryType")
        AND ("direction" = 'CREDIT'::"8fold_test"."LedgerDirection");
  END IF;
END $$;

COMMIT;

