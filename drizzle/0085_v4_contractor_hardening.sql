-- V4 Contractor Hardening: prevent duplicate assignments, enforce one assignment per (job, contractor).
-- Do not touch legacy tables.

CREATE UNIQUE INDEX IF NOT EXISTS "v4_job_assignments_job_contractor_uniq"
  ON "v4_job_assignments" ("job_id", "contractor_user_id");
