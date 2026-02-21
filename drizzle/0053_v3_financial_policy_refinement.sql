-- V3 financial policy refinement (non-destructive, additive).
-- - Add payment lifecycle enum values
-- - Add job lifecycle timing columns

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentStatus' AND e.enumlabel = 'AUTHORIZED'
  ) THEN
    ALTER TYPE "PaymentStatus" ADD VALUE 'AUTHORIZED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentStatus' AND e.enumlabel = 'FUNDS_SECURED'
  ) THEN
    ALTER TYPE "PaymentStatus" ADD VALUE 'FUNDS_SECURED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentStatus' AND e.enumlabel = 'EXPIRED_UNFUNDED'
  ) THEN
    ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED_UNFUNDED';
  END IF;
END $$;

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "acceptedAt" timestamp with time zone;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "authorizationExpiresAt" timestamp with time zone;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "fundsSecuredAt" timestamp with time zone;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "completionDeadlineAt" timestamp with time zone;
