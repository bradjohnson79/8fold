/**
 * Apply migration 0153: Add search indexes on city, state, country, trade.
 * Run: npx tsx scripts/apply-leads-location-search-indexes.ts
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
  console.log("Applying 0153_leads_location_search_indexes migration…");

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_leads_city
      ON directory_engine.contractor_leads (city)
  `);
  console.log("  ✓ city index");

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_leads_state
      ON directory_engine.contractor_leads (state)
  `);
  console.log("  ✓ state index");

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_leads_country
      ON directory_engine.contractor_leads (country)
  `);
  console.log("  ✓ country index");

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_leads_trade
      ON directory_engine.contractor_leads (trade)
  `);
  console.log("  ✓ trade index");

  await client.end();
  console.log("Migration complete.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
