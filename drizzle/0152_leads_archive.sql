-- LGS: Add archived flag to contractor_leads
-- Archived leads are hidden from the active pipeline but kept for analytics / reprocessing.

ALTER TABLE directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contractor_leads_archived
  ON directory_engine.contractor_leads (archived);
