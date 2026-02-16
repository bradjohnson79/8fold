-- Dispute system scaffolding: evidence + advisory votes (additive, safe)

CREATE TABLE IF NOT EXISTS "8fold_test"."dispute_evidence" (
  "id" text PRIMARY KEY,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "disputeCaseId" text NOT NULL,
  "submittedByUserId" text NOT NULL,
  "kind" text NOT NULL,
  "summary" text,
  "url" text,
  "metadata" jsonb
);

CREATE INDEX IF NOT EXISTS "dispute_evidence_case_created_idx"
  ON "8fold_test"."dispute_evidence" ("disputeCaseId", "createdAt");

CREATE TABLE IF NOT EXISTS "8fold_test"."dispute_votes" (
  "id" text PRIMARY KEY,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "disputeCaseId" text NOT NULL,

  -- voterType examples: ADMIN, AI_GPT5_NANO, USER
  "voterType" text NOT NULL,
  "voterUserId" text,

  -- vote examples: SUPPORT_FILED_BY, SUPPORT_AGAINST, NEEDS_MORE_INFO, NEUTRAL
  "vote" text NOT NULL,
  "rationale" text,

  -- AI advisory storage
  "model" text,
  "confidence" integer,
  "payload" jsonb
);

CREATE INDEX IF NOT EXISTS "dispute_votes_case_created_idx"
  ON "8fold_test"."dispute_votes" ("disputeCaseId", "createdAt");

