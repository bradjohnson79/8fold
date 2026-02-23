-- Migrate canonical data from legacy JobDraft to JobDraft_v3.
-- Archives duplicate ACTIVE drafts (none expected but safe).
-- Uses gen_random_uuid() for id (legacy id is text, do not trust cast).

BEGIN;

-- Archive duplicate ACTIVE drafts (keep newest)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "userId"
           ORDER BY "createdAt" DESC
         ) AS rn
  FROM "JobDraft"
  WHERE status = 'ACTIVE'
)
UPDATE "JobDraft"
SET status = 'ARCHIVED'
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- Migrate canonical fields only
INSERT INTO "JobDraft_v3" (
  id,
  "userId",
  status,
  step,
  data,
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(), -- legacy id is text, do not trust cast
  "userId",
  status,
  step,
  data,
  "createdAt",
  COALESCE("updatedAt", now())
FROM "JobDraft";

COMMIT;
