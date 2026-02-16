-- Job poster onboarding state (idempotent).
-- Used by apps/web job-poster layout for wizard gating.
-- Schema: 8fold_test (local dev).

CREATE TABLE IF NOT EXISTS "8fold_test"."job_poster_accounts" (
  "userId" text PRIMARY KEY,
  "wizardCompleted" boolean NOT NULL DEFAULT false,
  "termsAccepted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
