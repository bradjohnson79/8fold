-- Add missing Job.customerCompletionSummary column (align DB with Drizzle schema).
-- Note: DB already has customerCompletionSummary (without "er") from prior migration; this adds the new field.
ALTER TABLE "8fold_test"."Job"
ADD COLUMN IF NOT EXISTS "customerCompletionSummary" TEXT NULL;

