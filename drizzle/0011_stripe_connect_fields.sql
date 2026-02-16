-- Stripe Connect onboarding fields for payouts (8fold_test)

ALTER TABLE "8fold_test"."Contractor"
  ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "8fold_test"."RouterProfile"
  ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Contractor_stripeAccountId_idx" ON "8fold_test"."Contractor" ("stripeAccountId");
CREATE INDEX IF NOT EXISTS "RouterProfile_stripeAccountId_idx" ON "8fold_test"."RouterProfile" ("stripeAccountId");

