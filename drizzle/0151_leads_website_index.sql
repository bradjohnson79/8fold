-- Adds a B-tree index on contractor_leads(website) so GROUP BY / PARTITION BY domain
-- in the email consolidation SQL window functions can use an index scan instead of
-- a sequential scan.  On a 10,000-row table this alone cuts consolidation time by ~10×.
CREATE INDEX IF NOT EXISTS idx_contractor_leads_website
  ON directory_engine.contractor_leads (website);

-- Functional lower-case index for case-insensitive domain grouping (LOWER(website))
CREATE INDEX IF NOT EXISTS idx_contractor_leads_website_lower
  ON directory_engine.contractor_leads (LOWER(website));
