-- Migration: 0150_lead_finder_geo
-- Add geographic radius search fields to lead_finder_campaigns.
-- center_lat / center_lng: map center for locationBias.circle queries
-- radius_km: search radius in km (converted to meters for Google Places API)
-- max_api_calls: safety cap on Google Places API calls per campaign

ALTER TABLE directory_engine.lead_finder_campaigns
  ADD COLUMN IF NOT EXISTS center_lat  double precision,
  ADD COLUMN IF NOT EXISTS center_lng  double precision,
  ADD COLUMN IF NOT EXISTS radius_km   integer DEFAULT 25,
  ADD COLUMN IF NOT EXISTS max_api_calls integer DEFAULT 500;
