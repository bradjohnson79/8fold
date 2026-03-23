ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS response_received boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_replied_at timestamptz;

ALTER TABLE IF EXISTS directory_engine.outreach_messages
  ADD COLUMN IF NOT EXISTS reply_received boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS directory_engine.job_poster_email_messages
  ADD COLUMN IF NOT EXISTS reply_received boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS directory_engine.lgs_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'manual',
  external_event_id text,
  campaign_type text NOT NULL DEFAULT 'contractor',
  event_type text NOT NULL,
  from_email text NOT NULL,
  to_email text NOT NULL,
  subject text,
  body text,
  matched_message_id uuid,
  matched_lead_id uuid,
  matched_campaign_id uuid,
  raw_payload jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lgs_inbound_events_provider_external
  ON directory_engine.lgs_inbound_events (provider, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lgs_inbound_events_campaign_type
  ON directory_engine.lgs_inbound_events (campaign_type, event_type);

CREATE INDEX IF NOT EXISTS idx_lgs_inbound_events_matched_message
  ON directory_engine.lgs_inbound_events (matched_message_id);
