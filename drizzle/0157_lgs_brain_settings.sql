-- Outreach Brain: single-row settings table for operator-configurable parameters

CREATE TABLE IF NOT EXISTS directory_engine.lgs_outreach_settings (
  id                          SERIAL PRIMARY KEY,
  min_lead_score_to_queue     INTEGER     NOT NULL DEFAULT 0,
  domain_cooldown_days        INTEGER     NOT NULL DEFAULT 7,
  followup1_delay_days        INTEGER     NOT NULL DEFAULT 4,
  followup2_delay_days        INTEGER     NOT NULL DEFAULT 6,
  max_followups_per_lead      INTEGER     NOT NULL DEFAULT 2,
  auto_generate_followups     BOOLEAN     NOT NULL DEFAULT true,
  require_followup_approval   BOOLEAN     NOT NULL DEFAULT true,
  max_sends_per_company_30d   INTEGER     NOT NULL DEFAULT 3,
  min_sender_health_level     TEXT        NOT NULL DEFAULT 'risk',
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single settings row if it doesn't already exist
INSERT INTO directory_engine.lgs_outreach_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
