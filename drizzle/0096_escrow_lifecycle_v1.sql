ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'AUTH_HOLD';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'CAPTURE';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'ESCROW_AVAILABLE';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'PAYABLE_CONTRACTOR';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'PAYABLE_ROUTER';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'TAX_BUCKET';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'AUTH_EXPIRED';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'CHARGE';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'ESCROW_HELD';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'REFUND';

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_regional boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS appraisal_subtotal_cents integer NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS regional_fee_cents integer NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tax_rate_bps integer NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tax_amount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS total_amount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stripe_payment_intent_status text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stripe_capture_deadline_at timestamp;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stripe_authorized_at timestamp;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stripe_captured_at timestamp;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stripe_canceled_at timestamp;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stripe_paid_at timestamp;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stripe_refunded_at timestamp;

ALTER TABLE "LedgerEntry" ADD COLUMN IF NOT EXISTS metadata jsonb;

DROP INDEX IF EXISTS idx_jobs_open_auth_capture_deadline;
CREATE INDEX IF NOT EXISTS idx_jobs_refund_stale_unassigned
  ON jobs (stripe_paid_at)
  WHERE status = 'OPEN_FOR_ROUTING'
    AND payment_status IN ('FUNDS_SECURED', 'FUNDED')
    AND stripe_refunded_at IS NULL
    AND contractor_user_id IS NULL
    AND stripe_paid_at IS NOT NULL;
