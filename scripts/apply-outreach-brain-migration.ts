/**
 * Apply migration: 0156_outreach_brain_columns
 * Adds lead scoring, lifecycle, and follow-up columns to contractor_leads
 * and message strategy columns to outreach_messages.
 */
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("Applying 0156_outreach_brain_columns migration…");

  await client.query(`
    ALTER TABLE directory_engine.contractor_leads
      ADD COLUMN IF NOT EXISTS lead_priority          TEXT        DEFAULT 'medium',
      ADD COLUMN IF NOT EXISTS priority_source        TEXT        DEFAULT 'auto',
      ADD COLUMN IF NOT EXISTS score_dirty            BOOLEAN     NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS outreach_stage         TEXT        DEFAULT 'not_contacted',
      ADD COLUMN IF NOT EXISTS followup_count         INTEGER     NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_contacted_at      TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_replied_at        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS next_followup_at       TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_message_type_sent TEXT
  `);
  console.log("  ✓ contractor_leads brain columns added");

  await client.query(`
    ALTER TABLE directory_engine.outreach_messages
      ADD COLUMN IF NOT EXISTS message_type         TEXT DEFAULT 'intro_standard',
      ADD COLUMN IF NOT EXISTS message_version_hash TEXT
  `);
  console.log("  ✓ outreach_messages strategy columns added");

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_leads_outreach_stage
      ON directory_engine.contractor_leads (outreach_stage)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_leads_next_followup_at
      ON directory_engine.contractor_leads (next_followup_at)
      WHERE next_followup_at IS NOT NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_leads_score_dirty
      ON directory_engine.contractor_leads (score_dirty)
      WHERE score_dirty = true
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_leads_lead_priority
      ON directory_engine.contractor_leads (lead_priority)
  `);
  console.log("  ✓ indexes created");

  await client.end();
  console.log("Migration 0156 complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
