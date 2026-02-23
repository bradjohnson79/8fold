-- Migrate canonical data from legacy JobDraft to JobDraft_v3.
-- Archives duplicate ACTIVE drafts (keeps newest per user).
-- Only migrates rows with valid UUID id (legacy may have text ids).

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

-- Migrate canonical fields only (filter valid UUID ids for cast safety)
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
  id::uuid,
  "userId",
  status,
  step,
  COALESCE("data", '{}'::jsonb),
  COALESCE("createdAt", now()),
  COALESCE("updatedAt", now())
FROM "JobDraft"
WHERE id::text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
ON CONFLICT (id) DO NOTHING;

COMMIT;
