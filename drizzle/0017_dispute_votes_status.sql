ALTER TABLE "8fold_test"."dispute_votes"
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS "dispute_votes_case_status_created_idx"
  ON "8fold_test"."dispute_votes" ("disputeCaseId", "status", "createdAt");

