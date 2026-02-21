-- V3 deploy phase: create-only migration.
-- No destructive changes to V2 tables/enums in this migration.

CREATE TYPE "JobDraftStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "JobDraftStep" AS ENUM ('DETAILS', 'PRICING', 'AVAILABILITY', 'PAYMENT', 'CONFIRMED');

CREATE TABLE "JobDraft" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  "status" "JobDraftStatus" NOT NULL DEFAULT 'ACTIVE',
  "step" "JobDraftStep" NOT NULL DEFAULT 'DETAILS',
  "data" jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "JobDraft_userId_status_idx" ON "JobDraft" ("userId", "status");
