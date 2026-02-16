-- Adds application-managed updatedAt to Job for admin bulk rewrites traceability.
-- Safe to run multiple times.

ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();

-- Backfill for existing rows (preserve time ordering).
UPDATE "Job"
SET "updatedAt" = COALESCE("updatedAt", "publishedAt", "createdAt", now())
WHERE "updatedAt" IS NULL;

