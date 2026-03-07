-- One assignment per job: unique on job_id for race-condition safe insert.
-- Complements job_contractor_uniq (job_id, contractor_user_id).
CREATE UNIQUE INDEX IF NOT EXISTS "v4_job_assignments_job_uniq"
  ON "v4_job_assignments" ("job_id");
