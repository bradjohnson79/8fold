CREATE TABLE IF NOT EXISTS "public"."v4_financial_ledger" (
  "id" text PRIMARY KEY NOT NULL,
  "job_id" text NOT NULL,
  "type" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'CAD',
  "stripe_ref" text,
  "meta_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "v4_financial_ledger_job_created_idx"
  ON "public"."v4_financial_ledger" ("job_id", "created_at" desc);

CREATE INDEX IF NOT EXISTS "v4_financial_ledger_type_created_idx"
  ON "public"."v4_financial_ledger" ("type", "created_at" desc);

CREATE INDEX IF NOT EXISTS "v4_financial_ledger_stripe_ref_idx"
  ON "public"."v4_financial_ledger" ("stripe_ref");

CREATE UNIQUE INDEX IF NOT EXISTS "v4_financial_ledger_job_type_ref_uq"
  ON "public"."v4_financial_ledger" ("job_id", "type", "stripe_ref")
  WHERE "stripe_ref" IS NOT NULL;
