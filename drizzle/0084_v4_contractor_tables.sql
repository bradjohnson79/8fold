-- V4 Contractor Dashboard: invites, assignments, availability, strikes, suspensions, pm receipts.
-- Do not touch legacy tables.

-- Add approved_total_cents to v4_pm_requests for receipt calculation
ALTER TABLE "v4_pm_requests" ADD COLUMN IF NOT EXISTS "approved_total_cents" integer;

-- v4_contractor_job_invites
CREATE TABLE IF NOT EXISTS "v4_contractor_job_invites" (
  "id" text PRIMARY KEY,
  "route_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "contractor_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'PENDING',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "v4_contractor_job_invites_job_idx" ON "v4_contractor_job_invites" ("job_id");
CREATE INDEX IF NOT EXISTS "v4_contractor_job_invites_contractor_idx" ON "v4_contractor_job_invites" ("contractor_user_id");
CREATE INDEX IF NOT EXISTS "v4_contractor_job_invites_status_idx" ON "v4_contractor_job_invites" ("status");

-- v4_job_assignments
CREATE TABLE IF NOT EXISTS "v4_job_assignments" (
  "id" text PRIMARY KEY,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "contractor_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "assigned_at" timestamptz NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'ASSIGNED'
);
CREATE INDEX IF NOT EXISTS "v4_job_assignments_job_idx" ON "v4_job_assignments" ("job_id");
CREATE INDEX IF NOT EXISTS "v4_job_assignments_contractor_idx" ON "v4_job_assignments" ("contractor_user_id");
CREATE INDEX IF NOT EXISTS "v4_job_assignments_status_idx" ON "v4_job_assignments" ("status");

-- v4_contractor_availability_submissions
CREATE TABLE IF NOT EXISTS "v4_contractor_availability_submissions" (
  "id" text PRIMARY KEY,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "contractor_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "availability_json" jsonb NOT NULL,
  "submitted_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "v4_contractor_availability_job_idx" ON "v4_contractor_availability_submissions" ("job_id");
CREATE INDEX IF NOT EXISTS "v4_contractor_availability_contractor_idx" ON "v4_contractor_availability_submissions" ("contractor_user_id");

-- v4_contractor_strikes
CREATE TABLE IF NOT EXISTS "v4_contractor_strikes" (
  "id" text PRIMARY KEY,
  "contractor_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "v4_contractor_strikes_contractor_idx" ON "v4_contractor_strikes" ("contractor_user_id");

-- v4_contractor_suspensions
CREATE TABLE IF NOT EXISTS "v4_contractor_suspensions" (
  "contractor_user_id" text PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "suspended_until" timestamptz NOT NULL,
  "reason" text NOT NULL
);

-- v4_pm_receipts
CREATE TABLE IF NOT EXISTS "v4_pm_receipts" (
  "id" text PRIMARY KEY,
  "pm_request_id" text NOT NULL REFERENCES "v4_pm_requests"("id") ON DELETE CASCADE,
  "contractor_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "upload_id" text NOT NULL,
  "receipt_total_cents" integer NOT NULL,
  "calculated_difference_cents" integer NOT NULL,
  "refund_decision_status" text NOT NULL,
  "evaluated_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "v4_pm_receipts_pm_request_idx" ON "v4_pm_receipts" ("pm_request_id");
CREATE INDEX IF NOT EXISTS "v4_pm_receipts_contractor_idx" ON "v4_pm_receipts" ("contractor_user_id");
