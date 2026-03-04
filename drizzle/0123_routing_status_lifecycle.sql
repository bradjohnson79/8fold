-- Router routing lifecycle: add INVITES_SENT, INVITE_ACCEPTED, INVITES_EXPIRED to RoutingStatus.
-- Additive only. No drop, no recreate, no reorder.
-- Also add unique constraint to prevent duplicate invites (job_id, contractor_user_id) under race conditions.

-- Enum extension (Postgres add-only evolution)
ALTER TYPE public."RoutingStatus" ADD VALUE IF NOT EXISTS 'INVITES_SENT';
ALTER TYPE public."RoutingStatus" ADD VALUE IF NOT EXISTS 'INVITE_ACCEPTED';
ALTER TYPE public."RoutingStatus" ADD VALUE IF NOT EXISTS 'INVITES_EXPIRED';

-- Invite duplication safeguard: one invite per (job, contractor) pair.
-- Pre-migration: run scripts/validate-router-pipeline.ts Step 6. Clean duplicates if any exist.
ALTER TABLE v4_contractor_job_invites
ADD CONSTRAINT unique_job_contractor_invite
UNIQUE (job_id, contractor_user_id);
