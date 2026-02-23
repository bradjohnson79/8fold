-- Add structured address line 1 for job posting flow.
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS address_line1 text;
