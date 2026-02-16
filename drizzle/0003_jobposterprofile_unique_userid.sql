-- Idempotent: some DBs may already have this constraint/index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.connamespace = '8fold_test'::regnamespace
      AND c.conrelid = '"8fold_test"."JobPosterProfile"'::regclass
      AND c.conname = 'jobposterprofile_userid_unique'
  ) THEN
    ALTER TABLE "8fold_test"."JobPosterProfile"
    ADD CONSTRAINT "jobposterprofile_userid_unique" UNIQUE ("userId");
  END IF;
END $$;

