-- JobDraft V3 structural purification: create clean V3-only table.
-- No legacy columns. Enforces one ACTIVE draft per user.

BEGIN;

CREATE TABLE "JobDraft_v3" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  status "JobDraftStatus" NOT NULL DEFAULT 'ACTIVE',
  step "JobDraftStep" NOT NULL DEFAULT 'DETAILS',
  data jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "JobDraft_v3_one_active_per_user"
ON "JobDraft_v3" ("userId")
WHERE status = 'ACTIVE';

COMMIT;
