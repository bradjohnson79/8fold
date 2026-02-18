-- Add releasedAt to Escrow (job escrow lifecycle lock)
-- Used for RELEASED payout integrity invariants.

ALTER TABLE IF EXISTS "8fold_test"."Escrow"
  ADD COLUMN IF NOT EXISTS "releasedAt" timestamp without time zone;

CREATE INDEX IF NOT EXISTS "Escrow_releasedAt_idx"
  ON "8fold_test"."Escrow" ("releasedAt" desc);

