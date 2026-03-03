-- Job Poster Job Review Request System
-- job_edit_requests, job_cancel_requests, job_request_status enum
-- jobs.cancel_request_pending to lock routing while cancel request is pending
-- JobStatus: add CANCELLED for admin-approved cancel requests

-- Add CANCELLED to JobStatus enum (add-only; safe if already exists)
DO $$ BEGIN
  ALTER TYPE public."JobStatus" ADD VALUE 'CANCELLED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enum for request status
DO $$ BEGIN
  CREATE TYPE public.job_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Jobs: add cancel_request_pending
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS cancel_request_pending boolean NOT NULL DEFAULT false;

-- job_edit_requests
CREATE TABLE IF NOT EXISTS public.job_edit_requests (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  job_id text NOT NULL,
  job_poster_id text NOT NULL,
  original_title text NOT NULL,
  original_description text NOT NULL,
  requested_title text NOT NULL,
  requested_description text NOT NULL,
  status public.job_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by_admin_id text
);

CREATE INDEX IF NOT EXISTS job_edit_requests_job_id_idx ON public.job_edit_requests (job_id);
CREATE INDEX IF NOT EXISTS job_edit_requests_job_poster_id_idx ON public.job_edit_requests (job_poster_id);
CREATE INDEX IF NOT EXISTS job_edit_requests_status_idx ON public.job_edit_requests (status);
CREATE INDEX IF NOT EXISTS job_edit_requests_created_at_idx ON public.job_edit_requests (created_at);

-- job_cancel_requests
CREATE TABLE IF NOT EXISTS public.job_cancel_requests (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  job_id text NOT NULL,
  job_poster_id text NOT NULL,
  reason text NOT NULL,
  status public.job_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by_admin_id text
);

CREATE INDEX IF NOT EXISTS job_cancel_requests_job_id_idx ON public.job_cancel_requests (job_id);
CREATE INDEX IF NOT EXISTS job_cancel_requests_job_poster_id_idx ON public.job_cancel_requests (job_poster_id);
CREATE INDEX IF NOT EXISTS job_cancel_requests_status_idx ON public.job_cancel_requests (status);
CREATE INDEX IF NOT EXISTS job_cancel_requests_created_at_idx ON public.job_cancel_requests (created_at);
