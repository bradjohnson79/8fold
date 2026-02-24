-- Add address_line1 to jobs table for Job Post v3 structured address flow.
-- Idempotent: safe to run if column already exists.

BEGIN;

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS address_line1 text;

COMMIT;
