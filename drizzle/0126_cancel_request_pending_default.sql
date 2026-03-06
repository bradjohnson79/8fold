-- Normalize existing NULL cancel_request_pending rows to false
UPDATE jobs
SET cancel_request_pending = false
WHERE cancel_request_pending IS NULL;

-- Set default so future inserts never produce NULL
ALTER TABLE jobs
ALTER COLUMN cancel_request_pending
SET DEFAULT false;
