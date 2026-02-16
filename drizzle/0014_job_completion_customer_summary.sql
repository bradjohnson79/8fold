-- Job completion: add required customer completion summary field (triple confirmation)
ALTER TABLE "8fold_test"."Job"
ADD COLUMN IF NOT EXISTS "customerCompletionSummary" TEXT NULL;

