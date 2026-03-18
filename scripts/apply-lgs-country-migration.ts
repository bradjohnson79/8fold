/**
 * Apply LGS country + location normalization migration (0144).
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-lgs-country-migration.ts
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.join(process.cwd(), "apps/api/.env.local"),
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function main() {
  const sqlPath = path.join(process.cwd(), "drizzle", "0144_lgs_country_and_location_defaults.sql");
  const sqlText = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query(sqlText);
    console.log("✓ Migration 0144 applied: country column added, existing leads normalized.");

    // Report updated rows
    const res = await client.query(
      "SELECT COUNT(*) FROM directory_engine.contractor_leads WHERE country IS NOT NULL"
    );
    console.log(`  Leads with country set: ${(res.rows[0] as { count: string }).count}`);
  } catch (e) {
    console.error("Migration failed:", e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
