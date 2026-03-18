/**
 * Apply migration 0154: Add rolling 24h warmup columns to sender_pool.
 * Run: DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-sender-warmup-columns.ts
 */
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("Applying 0154_sender_warmup_columns migration…");

  await client.query(`
    ALTER TABLE directory_engine.sender_pool
      ADD COLUMN IF NOT EXISTS current_day_started_at TIMESTAMPTZ
  `);
  console.log("  ✓ current_day_started_at column added");

  await client.query(`
    ALTER TABLE directory_engine.sender_pool
      ADD COLUMN IF NOT EXISTS outreach_sent_today INTEGER NOT NULL DEFAULT 0
  `);
  console.log("  ✓ outreach_sent_today column added");

  await client.query(`
    ALTER TABLE directory_engine.sender_pool
      ADD COLUMN IF NOT EXISTS warmup_sent_today INTEGER NOT NULL DEFAULT 0
  `);
  console.log("  ✓ warmup_sent_today column added");

  await client.query(`
    ALTER TABLE directory_engine.sender_pool
      ADD COLUMN IF NOT EXISTS outreach_enabled BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("  ✓ outreach_enabled column added");

  await client.end();
  console.log("Migration complete.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
