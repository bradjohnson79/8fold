ALTER TYPE "public"."JobStatus"
  ADD VALUE IF NOT EXISTS 'JOB_STARTED';

ALTER TABLE "public"."jobs"
  ADD COLUMN IF NOT EXISTS "contractor_marked_complete_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "poster_marked_complete_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;
