-- Migration 0148: Lead Finder tables
-- Supports city×trade domain discovery campaigns that feed the Domain Discovery pipeline.

CREATE TABLE IF NOT EXISTS directory_engine.lead_finder_campaigns (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  state                 text NOT NULL DEFAULT 'CA',
  cities                jsonb NOT NULL DEFAULT '[]',
  trades                jsonb NOT NULL DEFAULT '[]',
  sources               jsonb NOT NULL DEFAULT '[]',
  max_results_per_combo integer NOT NULL DEFAULT 25,
  max_domains_total     integer NOT NULL DEFAULT 10000,
  max_runtime_minutes   integer NOT NULL DEFAULT 30,
  jobs_total            integer NOT NULL DEFAULT 0,
  jobs_complete         integer NOT NULL DEFAULT 0,
  domains_found         integer NOT NULL DEFAULT 0,
  unique_domains        integer NOT NULL DEFAULT 0,
  domains_sent          integer NOT NULL DEFAULT 0,
  started_at            timestamptz,
  finished_at           timestamptz,
  elapsed_seconds       integer,
  domains_per_second    text,
  status                text NOT NULL DEFAULT 'draft',
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS directory_engine.lead_finder_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES directory_engine.lead_finder_campaigns(id),
  city         text NOT NULL,
  state        text NOT NULL,
  trade        text NOT NULL,
  source       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  domains_found integer NOT NULL DEFAULT 0,
  error_message text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_finder_jobs_campaign_idx
  ON directory_engine.lead_finder_jobs (campaign_id);

CREATE TABLE IF NOT EXISTS directory_engine.lead_finder_domains (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       uuid NOT NULL REFERENCES directory_engine.lead_finder_campaigns(id),
  job_id            uuid REFERENCES directory_engine.lead_finder_jobs(id),
  domain            text NOT NULL,
  business_name     text,
  trade             text,
  city              text,
  state             text,
  source            text,
  sent_to_discovery boolean NOT NULL DEFAULT false,
  discovery_run_id  uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, domain)
);

CREATE INDEX IF NOT EXISTS lead_finder_domains_campaign_idx
  ON directory_engine.lead_finder_domains (campaign_id);

CREATE INDEX IF NOT EXISTS lead_finder_domains_domain_idx
  ON directory_engine.lead_finder_domains (domain);
