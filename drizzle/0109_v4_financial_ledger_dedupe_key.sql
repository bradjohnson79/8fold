ALTER TABLE "public"."v4_financial_ledger"
  ADD COLUMN IF NOT EXISTS "dedupe_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "v4_financial_ledger_dedupe_key_uq"
  ON "public"."v4_financial_ledger" ("dedupe_key")
  WHERE "dedupe_key" IS NOT NULL;
