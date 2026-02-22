-- Stripe-only payout standardization
-- Normalizes legacy payout provider/method values to STRIPE and
-- enforces Stripe-only writes at the database layer.
-- Schema-agnostic: uses current_schema().

DO $$
DECLARE
  s text := current_schema();
BEGIN
  -- PayoutMethod.provider (enum)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'PayoutMethod' AND column_name = 'provider'
  ) THEN
    EXECUTE format('UPDATE %I."PayoutMethod" SET "provider" = ''STRIPE'' WHERE "provider"::text <> ''STRIPE''', s);
  END IF;

  -- TransferRecord.method (text)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'TransferRecord' AND column_name = 'method'
  ) THEN
    EXECUTE format('UPDATE %I."TransferRecord" SET "method" = ''STRIPE'' WHERE upper(coalesce("method", '''')) <> ''STRIPE''', s);
  END IF;

  -- JobPosterProfile payout fields
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'JobPosterProfile' AND column_name = 'payoutMethod'
  ) THEN
    EXECUTE format('UPDATE %I."JobPosterProfile" SET "payoutMethod" = ''STRIPE'' WHERE "payoutMethod" IS NULL OR "payoutMethod"::text <> ''STRIPE''', s);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'JobPosterProfile' AND column_name = 'paypalEmail'
  ) THEN
    EXECUTE format('UPDATE %I."JobPosterProfile" SET "paypalEmail" = NULL WHERE "paypalEmail" IS NOT NULL', s);
  END IF;

  -- contractor_accounts payout fields (payoutMethod may be enum; use ::text for upper)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'contractor_accounts' AND column_name = 'payoutMethod'
  ) THEN
    EXECUTE format('UPDATE %I."contractor_accounts" SET "payoutMethod" = ''STRIPE'' WHERE "payoutMethod" IS NULL OR upper("payoutMethod"::text) <> ''STRIPE''', s);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'contractor_accounts' AND column_name = 'paypalEmail'
  ) THEN
    EXECUTE format('UPDATE %I."contractor_accounts" SET "paypalEmail" = NULL WHERE "paypalEmail" IS NOT NULL', s);
  END IF;
END $$;

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('ALTER TABLE IF EXISTS %I."TransferRecord" DROP CONSTRAINT IF EXISTS "TransferRecord_method_stripe_only"', s);
  EXECUTE format('ALTER TABLE IF EXISTS %I."TransferRecord" ADD CONSTRAINT "TransferRecord_method_stripe_only" CHECK ("method" = ''STRIPE'')', s);
  EXECUTE format('ALTER TABLE IF EXISTS %I."contractor_accounts" DROP CONSTRAINT IF EXISTS "contractor_accounts_payoutMethod_stripe_only"', s);
  EXECUTE format('ALTER TABLE IF EXISTS %I."contractor_accounts" ADD CONSTRAINT "contractor_accounts_payoutMethod_stripe_only" CHECK ("payoutMethod" IS NULL OR upper("payoutMethod"::text) = ''STRIPE'')', s);
END $$;
