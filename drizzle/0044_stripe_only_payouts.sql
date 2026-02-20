-- Stripe-only payout standardization
-- Normalizes legacy payout provider/method values to STRIPE and
-- enforces Stripe-only writes at the database layer.

DO $$
BEGIN
  -- PayoutMethod.provider (enum)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = '8fold_test' AND table_name = 'PayoutMethod' AND column_name = 'provider'
  ) THEN
    UPDATE "8fold_test"."PayoutMethod"
    SET "provider" = 'STRIPE'
    WHERE "provider"::text <> 'STRIPE';
  END IF;

  -- TransferRecord.method (text)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = '8fold_test' AND table_name = 'TransferRecord' AND column_name = 'method'
  ) THEN
    UPDATE "8fold_test"."TransferRecord"
    SET "method" = 'STRIPE'
    WHERE upper(coalesce("method", '')) <> 'STRIPE';
  END IF;

  -- JobPosterProfile payout fields
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = '8fold_test' AND table_name = 'JobPosterProfile' AND column_name = 'payoutMethod'
  ) THEN
    UPDATE "8fold_test"."JobPosterProfile"
    SET "payoutMethod" = 'STRIPE'
    WHERE "payoutMethod" IS NULL OR "payoutMethod"::text <> 'STRIPE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = '8fold_test' AND table_name = 'JobPosterProfile' AND column_name = 'paypalEmail'
  ) THEN
    UPDATE "8fold_test"."JobPosterProfile"
    SET "paypalEmail" = NULL
    WHERE "paypalEmail" IS NOT NULL;
  END IF;

  -- contractor_accounts payout fields
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = '8fold_test' AND table_name = 'contractor_accounts' AND column_name = 'payoutMethod'
  ) THEN
    UPDATE "8fold_test"."contractor_accounts"
    SET "payoutMethod" = 'STRIPE'
    WHERE "payoutMethod" IS NULL OR upper("payoutMethod") <> 'STRIPE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = '8fold_test' AND table_name = 'contractor_accounts' AND column_name = 'paypalEmail'
  ) THEN
    UPDATE "8fold_test"."contractor_accounts"
    SET "paypalEmail" = NULL
    WHERE "paypalEmail" IS NOT NULL;
  END IF;
END $$;

ALTER TABLE IF EXISTS "8fold_test"."TransferRecord"
  DROP CONSTRAINT IF EXISTS "TransferRecord_method_stripe_only";
ALTER TABLE IF EXISTS "8fold_test"."TransferRecord"
  ADD CONSTRAINT "TransferRecord_method_stripe_only" CHECK ("method" = 'STRIPE');

ALTER TABLE IF EXISTS "8fold_test"."contractor_accounts"
  DROP CONSTRAINT IF EXISTS "contractor_accounts_payoutMethod_stripe_only";
ALTER TABLE IF EXISTS "8fold_test"."contractor_accounts"
  ADD CONSTRAINT "contractor_accounts_payoutMethod_stripe_only" CHECK ("payoutMethod" IS NULL OR upper("payoutMethod") = 'STRIPE');

