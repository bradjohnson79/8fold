-- Migration: 0149_lgs_secondary_emails
-- Add domain-level email consolidation columns to contractor_leads.
-- secondary_emails: stores all non-primary emails discovered for the same domain
-- primary_email_score: priority score of the chosen outreach email (for auditing)

ALTER TABLE directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS secondary_emails jsonb,
  ADD COLUMN IF NOT EXISTS primary_email_score integer;
