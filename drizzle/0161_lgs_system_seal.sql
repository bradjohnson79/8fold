-- Seal missing LGS schema drift between live DB and Drizzle/runtime.

-- 0156 contractor brain columns + message strategy
ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS lead_priority TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS priority_source TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS score_dirty BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS outreach_stage TEXT DEFAULT 'not_contacted',
  ADD COLUMN IF NOT EXISTS followup_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_type_sent TEXT;

ALTER TABLE IF EXISTS directory_engine.outreach_messages
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'intro_standard',
  ADD COLUMN IF NOT EXISTS message_version_hash TEXT,
  ADD COLUMN IF NOT EXISTS reply_received BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contractor_leads_outreach_stage
  ON directory_engine.contractor_leads (outreach_stage);

CREATE INDEX IF NOT EXISTS idx_contractor_leads_next_followup_at
  ON directory_engine.contractor_leads (next_followup_at)
  WHERE next_followup_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contractor_leads_score_dirty
  ON directory_engine.contractor_leads (score_dirty)
  WHERE score_dirty = true;

CREATE INDEX IF NOT EXISTS idx_contractor_leads_lead_priority
  ON directory_engine.contractor_leads (lead_priority);

-- 0157 outreach brain settings
CREATE TABLE IF NOT EXISTS directory_engine.lgs_outreach_settings (
  id SERIAL PRIMARY KEY,
  min_lead_score_to_queue INTEGER NOT NULL DEFAULT 0,
  domain_cooldown_days INTEGER NOT NULL DEFAULT 7,
  followup1_delay_days INTEGER NOT NULL DEFAULT 4,
  followup2_delay_days INTEGER NOT NULL DEFAULT 6,
  max_followups_per_lead INTEGER NOT NULL DEFAULT 2,
  auto_generate_followups BOOLEAN NOT NULL DEFAULT true,
  require_followup_approval BOOLEAN NOT NULL DEFAULT true,
  max_sends_per_company_30d INTEGER NOT NULL DEFAULT 3,
  min_sender_health_level TEXT NOT NULL DEFAULT 'risk',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO directory_engine.lgs_outreach_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 0160 shared inbound reply/bounce audit + reply flags
ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS response_received BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS directory_engine.job_poster_email_messages
  ADD COLUMN IF NOT EXISTS reply_received BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS directory_engine.lgs_inbound_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'manual',
  external_event_id TEXT,
  campaign_type TEXT NOT NULL DEFAULT 'contractor',
  event_type TEXT NOT NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  matched_message_id UUID,
  matched_lead_id UUID,
  matched_campaign_id UUID,
  raw_payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lgs_inbound_events_provider_external
  ON directory_engine.lgs_inbound_events (provider, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lgs_inbound_events_campaign_type
  ON directory_engine.lgs_inbound_events (campaign_type, event_type);

CREATE INDEX IF NOT EXISTS idx_lgs_inbound_events_matched_message
  ON directory_engine.lgs_inbound_events (matched_message_id);

-- Additional queue/message indexes for contractor + job-poster runtime
CREATE INDEX IF NOT EXISTS idx_lgs_outreach_queue_send_status
  ON directory_engine.lgs_outreach_queue (send_status);

CREATE INDEX IF NOT EXISTS idx_lgs_outreach_queue_lead_id
  ON directory_engine.lgs_outreach_queue (lead_id);

CREATE INDEX IF NOT EXISTS idx_lgs_outreach_queue_outreach_message_id
  ON directory_engine.lgs_outreach_queue (outreach_message_id);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_lead_id
  ON directory_engine.outreach_messages (lead_id);

CREATE INDEX IF NOT EXISTS idx_job_poster_email_messages_campaign_id
  ON directory_engine.job_poster_email_messages (campaign_id);

CREATE INDEX IF NOT EXISTS idx_job_poster_email_messages_lead_id
  ON directory_engine.job_poster_email_messages (lead_id);

CREATE INDEX IF NOT EXISTS idx_job_poster_email_queue_message_id
  ON directory_engine.job_poster_email_queue (message_id);

CREATE INDEX IF NOT EXISTS idx_job_poster_leads_outreach_stage
  ON directory_engine.job_poster_leads (outreach_stage);

CREATE INDEX IF NOT EXISTS idx_job_poster_leads_next_followup_at
  ON directory_engine.job_poster_leads (next_followup_at)
  WHERE next_followup_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_poster_leads_score_dirty
  ON directory_engine.job_poster_leads (score_dirty)
  WHERE score_dirty = true;

CREATE INDEX IF NOT EXISTS idx_job_poster_leads_lead_priority
  ON directory_engine.job_poster_leads (lead_priority);

-- Safety checks for shared discriminator columns
ALTER TABLE IF EXISTS directory_engine.sender_pool
  DROP CONSTRAINT IF EXISTS sender_pool_warmup_status_check;

ALTER TABLE IF EXISTS directory_engine.sender_pool
  ADD CONSTRAINT sender_pool_warmup_status_check
  CHECK (warmup_status = ANY (ARRAY['not_started'::text, 'warming'::text, 'ready'::text, 'paused'::text, 'disabled'::text]));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_finder_campaigns_campaign_type_check'
      AND connamespace = 'directory_engine'::regnamespace
  ) THEN
    ALTER TABLE directory_engine.lead_finder_campaigns
      ADD CONSTRAINT lead_finder_campaigns_campaign_type_check
      CHECK (campaign_type IN ('contractor', 'jobs'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'discovery_runs_campaign_type_check'
      AND connamespace = 'directory_engine'::regnamespace
  ) THEN
    ALTER TABLE directory_engine.discovery_runs
      ADD CONSTRAINT discovery_runs_campaign_type_check
      CHECK (campaign_type IN ('contractor', 'jobs'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'discovery_run_leads_campaign_type_check'
      AND connamespace = 'directory_engine'::regnamespace
  ) THEN
    ALTER TABLE directory_engine.discovery_run_leads
      ADD CONSTRAINT discovery_run_leads_campaign_type_check
      CHECK (campaign_type IN ('contractor', 'jobs'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_finder_domains_campaign_type_check'
      AND connamespace = 'directory_engine'::regnamespace
  ) THEN
    ALTER TABLE directory_engine.lead_finder_domains
      ADD CONSTRAINT lead_finder_domains_campaign_type_check
      CHECK (campaign_type IN ('contractor', 'jobs'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'outreach_messages_campaign_type_check'
      AND connamespace = 'directory_engine'::regnamespace
  ) THEN
    ALTER TABLE directory_engine.outreach_messages
      ADD CONSTRAINT outreach_messages_campaign_type_check
      CHECK (campaign_type IN ('contractor', 'jobs'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_messages_campaign_type_check'
      AND connamespace = 'directory_engine'::regnamespace
  ) THEN
    ALTER TABLE directory_engine.email_messages
      ADD CONSTRAINT email_messages_campaign_type_check
      CHECK (campaign_type IN ('contractor', 'jobs'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lgs_inbound_events_campaign_type_check'
      AND connamespace = 'directory_engine'::regnamespace
  ) THEN
    ALTER TABLE directory_engine.lgs_inbound_events
      ADD CONSTRAINT lgs_inbound_events_campaign_type_check
      CHECK (campaign_type IN ('contractor', 'jobs'));
  END IF;
END $$;
