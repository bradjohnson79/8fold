-- Drop legacy columns and fix payment_status/public_status type if text.
-- Run after 0061. Idempotent.

BEGIN;

ALTER TABLE public.jobs DROP COLUMN IF EXISTS amountcents;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS paymentstatus;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS publicstatus;

-- Fix payment_status/public_status if stored as text (cast to enum)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'payment_status'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE public.jobs ALTER COLUMN payment_status TYPE "PaymentStatus" USING payment_status::text::"PaymentStatus";
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'payment_status alter skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'public_status'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE public.jobs ALTER COLUMN public_status TYPE "PublicJobStatus" USING public_status::text::"PublicJobStatus";
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'public_status alter skipped: %', SQLERRM;
END $$;

COMMIT;
