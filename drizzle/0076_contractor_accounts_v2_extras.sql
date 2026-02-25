-- V2 contractor profile extras (stateless setup portal).

ALTER TABLE contractor_accounts ADD COLUMN IF NOT EXISTS v2_extras jsonb;
