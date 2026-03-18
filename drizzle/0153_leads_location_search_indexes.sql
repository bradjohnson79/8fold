-- Add indexes for location-based search on contractor_leads
-- Used by the multi-term search in GET /api/dise/leads

CREATE INDEX IF NOT EXISTS idx_contractor_leads_city
  ON directory_engine.contractor_leads (city);

CREATE INDEX IF NOT EXISTS idx_contractor_leads_state
  ON directory_engine.contractor_leads (state);

CREATE INDEX IF NOT EXISTS idx_contractor_leads_country
  ON directory_engine.contractor_leads (country);

CREATE INDEX IF NOT EXISTS idx_contractor_leads_trade
  ON directory_engine.contractor_leads (trade);
