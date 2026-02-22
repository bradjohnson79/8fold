-- Stripe Connect onboarding fields for payouts
-- Schema-agnostic: uses current_schema()

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('ALTER TABLE %I."Contractor" ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS "stripeAccountId" text', s);
  EXECUTE format('ALTER TABLE %I."RouterProfile" ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS "stripeAccountId" text', s);
  EXECUTE format('CREATE INDEX IF NOT EXISTS "Contractor_stripeAccountId_idx" ON %I."Contractor" ("stripeAccountId")', s);
  EXECUTE format('CREATE INDEX IF NOT EXISTS "RouterProfile_stripeAccountId_idx" ON %I."RouterProfile" ("stripeAccountId")', s);
END $$;
