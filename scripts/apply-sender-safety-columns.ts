/**
 * Apply migration 0155: Add cooldown_until + health_score to sender_pool.
 * Run: DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-sender-safety-columns.ts
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
  console.log("Applying 0155_sender_safety_columns migration…");

  await client.query(`
    ALTER TABLE directory_engine.sender_pool
      ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ
  `);
  console.log("  ✓ cooldown_until column added");

  await client.query(`
    ALTER TABLE directory_engine.sender_pool
      ADD COLUMN IF NOT EXISTS health_score TEXT DEFAULT 'unknown'
  `);
  console.log("  ✓ health_score column added");

  await client.end();
  console.log("Migration complete.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
