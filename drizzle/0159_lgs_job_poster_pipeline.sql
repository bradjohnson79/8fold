ALTER TABLE IF EXISTS directory_engine.email_messages
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'contractor';

ALTER TABLE IF EXISTS directory_engine.outreach_messages
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'contractor';

CREATE TABLE IF NOT EXISTS directory_engine.job_poster_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES directory_engine.lead_finder_campaigns(id) ON DELETE SET NULL,
  website text NOT NULL,
  company_name text,
  contact_name text,
  email text,
  phone text,
  category text NOT NULL DEFAULT 'business',
  city text,
  state text,
  country text,
  source text,
  status text NOT NULL DEFAULT 'new',
  contact_attempts integer NOT NULL DEFAULT 0,
  response_received boolean NOT NULL DEFAULT false,
  signed_up boolean NOT NULL DEFAULT false,
  lead_score integer NOT NULL DEFAULT 0,
  email_bounced boolean DEFAULT false,
  bounce_reason text,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  lead_priority text DEFAULT 'medium',
  priority_source text DEFAULT 'auto',
  score_dirty boolean NOT NULL DEFAULT true,
  outreach_stage text DEFAULT 'not_contacted',
  followup_count integer NOT NULL DEFAULT 0,
  last_contacted_at timestamptz,
  last_replied_at timestamptz,
  next_followup_at timestamptz,
  last_message_type_sent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_poster_campaign
  ON directory_engine.job_poster_leads (campaign_id);

CREATE INDEX IF NOT EXISTS idx_job_poster_city
  ON directory_engine.job_poster_leads (city);

CREATE INDEX IF NOT EXISTS idx_job_poster_website
  ON directory_engine.job_poster_leads (website);

CREATE TABLE IF NOT EXISTS directory_engine.job_poster_email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES directory_engine.lead_finder_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES directory_engine.job_poster_leads(id) ON DELETE CASCADE,
  subject text,
  body text,
  message_hash text,
  generation_context jsonb,
  generated_by text DEFAULT 'gpt5-nano',
  status text DEFAULT 'draft',
  message_type text DEFAULT 'intro_standard',
  message_version_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewer text
);

CREATE TABLE IF NOT EXISTS directory_engine.job_poster_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES directory_engine.job_poster_email_messages(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  scheduled_at timestamptz,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  retry_count integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status
  ON directory_engine.job_poster_email_queue (status);

CREATE INDEX IF NOT EXISTS idx_job_queue_scheduled
  ON directory_engine.job_poster_email_queue (scheduled_at);

ALTER TABLE IF EXISTS directory_engine.discovery_runs
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'contractor',
  ADD COLUMN IF NOT EXISTS target_campaign_id uuid,
  ADD COLUMN IF NOT EXISTS target_category text;

ALTER TABLE IF EXISTS directory_engine.discovery_run_leads
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'contractor';

ALTER TABLE IF EXISTS directory_engine.lead_finder_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'contractor',
  ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounce_count integer NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS directory_engine.lead_finder_jobs
  ALTER COLUMN trade DROP NOT NULL;

ALTER TABLE IF EXISTS directory_engine.lead_finder_jobs
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE IF EXISTS directory_engine.lead_finder_domains
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'contractor',
  ADD COLUMN IF NOT EXISTS category text;
