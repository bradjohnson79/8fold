-- Strengthen idempotency indexes for Escrow funding ledger entries.
-- Extends the partial unique index to cover both ESCROW_FUND and PNM_FUND.

-- Drop the earlier, narrower index (if present).
DROP INDEX IF EXISTS "8fold_test"."LedgerEntry_escrow_fund_once";

-- Ensure only one funding CREDIT entry per escrow, regardless of kind.
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_escrow_fund_once"
  ON "8fold_test"."LedgerEntry" ("escrowId")
  WHERE ("escrowId" IS NOT NULL)
    AND ("type" IN ('ESCROW_FUND'::"8fold_test"."LedgerEntryType", 'PNM_FUND'::"8fold_test"."LedgerEntryType"))
    AND ("direction" = 'CREDIT'::"8fold_test"."LedgerDirection");

