CREATE TABLE IF NOT EXISTS "job_posters" (
  "userId" text PRIMARY KEY NOT NULL,
  "createdByAdmin" boolean NOT NULL DEFAULT false,
  "isActive" boolean NOT NULL DEFAULT true,
  "isMock" boolean NOT NULL DEFAULT false,
  "isTest" boolean NOT NULL DEFAULT false,
  "defaultRegion" text,
  "totalJobsPosted" integer NOT NULL DEFAULT 0,
  "lastJobPostedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- Backfill compatibility rows from legacy table when available.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'job_poster_accounts'
  ) THEN
    EXECUTE '
      INSERT INTO "job_posters" ("userId", "isActive", "createdAt")
      SELECT "userId", true, COALESCE("createdAt"::timestamp, now())
      FROM "job_poster_accounts"
      ON CONFLICT ("userId") DO NOTHING
    ';
  END IF;
END $$;
