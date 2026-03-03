-- Super Admin Control System: job and user lifecycle fields
-- Jobs: archived_at (authoritative), archived_by_admin_id, suspended_until, suspension_reason
-- Users: archivedByAdminId
-- archived boolean on jobs kept for legacy compatibility; archived_at is authoritative moving forward.

-- Jobs table (snake_case)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by_admin_id text,
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

-- User table (camelCase)
ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "archivedByAdminId" text;
