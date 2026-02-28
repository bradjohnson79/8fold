CREATE TABLE IF NOT EXISTS "role_terms_acceptances" (
  "id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "document_type" text NOT NULL,
  "version" text NOT NULL,
  "accepted_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "role_terms_acceptances_role_check"
    CHECK ("role" IN ('JOB_POSTER', 'CONTRACTOR', 'ROUTER')),
  CONSTRAINT "role_terms_acceptances_document_type_check"
    CHECK ("document_type" IN ('JOB_POSTER_TERMS', 'CONTRACTOR_TERMS', 'ROUTER_TERMS'))
);

CREATE INDEX IF NOT EXISTS "role_terms_acceptances_user_role_doc_accepted_idx"
  ON "role_terms_acceptances" ("user_id", "role", "document_type", "accepted_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "role_terms_acceptances_user_role_doc_version_uq"
  ON "role_terms_acceptances" ("user_id", "role", "document_type", "version");

-- Job Poster backfill from legacy users TOS columns.
INSERT INTO "role_terms_acceptances" ("id", "user_id", "role", "document_type", "version", "accepted_at", "created_at")
SELECT
  (gen_random_uuid())::text,
  u."id",
  'JOB_POSTER',
  'JOB_POSTER_TERMS',
  nullif(trim(u."tosVersion"), ''),
  u."acceptedTosAt",
  now()
FROM "User" u
WHERE u."role" = 'JOB_POSTER'
  AND u."acceptedTosAt" IS NOT NULL
  AND nullif(trim(u."tosVersion"), '') IS NOT NULL
ON CONFLICT ("user_id", "role", "document_type", "version") DO NOTHING;

-- Router backfill from legacy users TOS columns.
INSERT INTO "role_terms_acceptances" ("id", "user_id", "role", "document_type", "version", "accepted_at", "created_at")
SELECT
  (gen_random_uuid())::text,
  u."id",
  'ROUTER',
  'ROUTER_TERMS',
  nullif(trim(u."tosVersion"), ''),
  u."acceptedTosAt",
  now()
FROM "User" u
WHERE u."role" = 'ROUTER'
  AND u."acceptedTosAt" IS NOT NULL
  AND nullif(trim(u."tosVersion"), '') IS NOT NULL
ON CONFLICT ("user_id", "role", "document_type", "version") DO NOTHING;

-- Contractor terms backfill from contractor profile terms columns.
INSERT INTO "role_terms_acceptances" ("id", "user_id", "role", "document_type", "version", "accepted_at", "created_at")
SELECT
  (gen_random_uuid())::text,
  cp."user_id",
  'CONTRACTOR',
  'CONTRACTOR_TERMS',
  nullif(trim(cp."tos_version"), ''),
  cp."accepted_tos_at",
  now()
FROM "contractor_profiles_v4" cp
WHERE cp."accepted_tos_at" IS NOT NULL
  AND nullif(trim(cp."tos_version"), '') IS NOT NULL
ON CONFLICT ("user_id", "role", "document_type", "version") DO NOTHING;

-- Contractor fallback backfill from waiver acceptance when terms profile row is missing.
INSERT INTO "role_terms_acceptances" ("id", "user_id", "role", "document_type", "version", "accepted_at", "created_at")
SELECT
  (gen_random_uuid())::text,
  ca."userId",
  'CONTRACTOR',
  'CONTRACTOR_TERMS',
  'v1.0',
  ca."waiverAcceptedAt",
  now()
FROM "contractor_accounts" ca
LEFT JOIN "role_terms_acceptances" rta
  ON rta."user_id" = ca."userId"
  AND rta."role" = 'CONTRACTOR'
  AND rta."document_type" = 'CONTRACTOR_TERMS'
WHERE ca."waiverAccepted" = true
  AND ca."waiverAcceptedAt" IS NOT NULL
  AND rta."id" IS NULL
ON CONFLICT ("user_id", "role", "document_type", "version") DO NOTHING;
