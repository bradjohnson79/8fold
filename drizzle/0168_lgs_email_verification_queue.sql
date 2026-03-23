ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS email_verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_verification_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_score integer,
  ADD COLUMN IF NOT EXISTS email_verification_provider text,
  ADD COLUMN IF NOT EXISTS priority_score integer NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS email_verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_verification_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_score integer,
  ADD COLUMN IF NOT EXISTS email_verification_provider text,
  ADD COLUMN IF NOT EXISTS priority_score integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS directory_engine.email_verification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email text NOT NULL,
  original_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  checked_at timestamptz,
  provider text,
  result_status text,
  result_score integer,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_verification_queue_normalized_email_idx
  ON directory_engine.email_verification_queue (normalized_email);
