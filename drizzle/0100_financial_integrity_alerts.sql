DO $$
BEGIN
  CREATE TYPE "FinancialIntegrityAlertType" AS ENUM (
    'MISSING_CHARGE',
    'MISSING_TRANSFER',
    'MISSING_REFUND',
    'STRIPE_REFUND_NOT_IN_LEDGER',
    'LEDGER_REFUND_NOT_IN_STRIPE',
    'STRIPE_AMOUNT_MISMATCH',
    'DOUBLE_TRANSFER',
    'ESCROW_RELEASE_WITHOUT_STRIPE_CAPTURE',
    'NEGATIVE_BALANCE_DRIFT',
    'UNRECONCILED_PAYMENT_AFTER_24H'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "FinancialIntegritySeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "FinancialIntegrityAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS financial_integrity_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text REFERENCES jobs(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  alert_type "FinancialIntegrityAlertType" NOT NULL,
  severity "FinancialIntegritySeverity" NOT NULL DEFAULT 'WARNING',
  internal_total_cents integer NOT NULL DEFAULT 0,
  stripe_total_cents integer NOT NULL DEFAULT 0,
  difference_cents integer NOT NULL DEFAULT 0,
  status "FinancialIntegrityAlertStatus" NOT NULL DEFAULT 'OPEN',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_admin_id uuid REFERENCES admins(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS financial_integrity_alerts_status_idx
  ON financial_integrity_alerts(status);
CREATE INDEX IF NOT EXISTS financial_integrity_alerts_created_at_idx
  ON financial_integrity_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS financial_integrity_alerts_job_id_idx
  ON financial_integrity_alerts(job_id);

-- Enforce dedupe rule: only one OPEN alert per job + alert_type.
CREATE UNIQUE INDEX IF NOT EXISTS financial_integrity_alerts_open_job_type_uq
  ON financial_integrity_alerts (job_id, alert_type)
  WHERE status = 'OPEN' AND job_id IS NOT NULL;
