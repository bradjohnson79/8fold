-- Add photo_urls jsonb to jobs for fallback when job_photos table does not exist.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS photo_urls jsonb;
