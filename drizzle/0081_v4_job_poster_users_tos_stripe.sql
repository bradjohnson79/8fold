-- V4 Job Poster: users TOS + Stripe columns (NULL-safe for existing rows).
-- All new columns allow NULL. No NOT NULL without defaults.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tosVersion" text;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "acceptedTosAt" timestamptz;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" text;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeDefaultPaymentMethodId" text;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeStatus" text;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeUpdatedAt" timestamptz;
