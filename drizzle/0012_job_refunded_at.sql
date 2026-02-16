-- Add refundedAt to Job for refund semantics (distinct from releasedAt).
-- refundedAt = when payment was refunded; releasedAt = when payout was released.
ALTER TABLE "8fold_test"."Job"
  ADD COLUMN IF NOT EXISTS "refundedAt" timestamp with time zone NULL;
