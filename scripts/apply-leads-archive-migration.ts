/**
 * Apply migration 0152: Add archived + archived_at columns to contractor_leads.
 * Run: DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-leads-archive-migration.ts
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
  console.log("Applying 0152_leads_archive migration…");

  await client.query(`
    ALTER TABLE directory_engine.contractor_leads
      ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("  ✓ archived column added");

  await client.query(`
    ALTER TABLE directory_engine.contractor_leads
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ
  `);
  console.log("  ✓ archived_at column added");

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_leads_archived
      ON directory_engine.contractor_leads (archived)
  `);
  console.log("  ✓ index created");

  await client.end();
  console.log("Migration complete.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
