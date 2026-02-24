-- Admin finance adjustment idempotency (duplicate request protection).
-- Schema-agnostic: uses current_schema().

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I."AdminAdjustmentIdempotency" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "idempotencyKey" text NOT NULL UNIQUE,
      "ledgerEntryId" uuid NOT NULL,
      "createdByUserId" text NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )',
    s
  );
END $$;
