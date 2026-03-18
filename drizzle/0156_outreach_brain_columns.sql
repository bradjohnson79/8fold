-- Outreach Brain: scoring + lifecycle columns on contractor_leads + message strategy on outreach_messages

-- contractor_leads additions
ALTER TABLE directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS lead_priority         TEXT        DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS priority_source       TEXT        DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS score_dirty           BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS outreach_stage        TEXT        DEFAULT 'not_contacted',
  ADD COLUMN IF NOT EXISTS followup_count        INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contacted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_replied_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_type_sent TEXT;

-- outreach_messages additions
ALTER TABLE directory_engine.outreach_messages
  ADD COLUMN IF NOT EXISTS message_type          TEXT        DEFAULT 'intro_standard',
  ADD COLUMN IF NOT EXISTS message_version_hash  TEXT;

-- Indexes to support follow-up engine queries
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
