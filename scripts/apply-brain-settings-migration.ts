/**
 * Apply migration: 0157_lgs_brain_settings
 * Creates the single-row lgs_outreach_settings config table.
 */
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("Applying 0157_lgs_brain_settings migration…");

  await client.query(`
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
    )
  `);
  console.log("  ✓ lgs_outreach_settings table created");

  await client.query(`
    INSERT INTO directory_engine.lgs_outreach_settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
  console.log("  ✓ default settings row seeded");

  await client.end();
  console.log("Migration 0157 complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
