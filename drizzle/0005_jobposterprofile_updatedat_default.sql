-- Ensure JobPosterProfile inserts succeed without explicitly providing updatedAt.
-- Route logic relies on DB default for updatedAt on insert.
ALTER TABLE "8fold_test"."JobPosterProfile"
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

