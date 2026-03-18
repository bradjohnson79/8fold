/**
 * Apply migration 0145: add scraped_business_name column and backfill.
 */
import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: join(process.cwd(), "apps/api/.env.local") });

const sql = readFileSync(join(process.cwd(), "drizzle/0145_lgs_scraped_business_name.sql"), "utf-8");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  console.log("Applying migration 0145: scraped_business_name...");
  await client.query(sql);
  const { rows } = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM directory_engine.contractor_leads WHERE scraped_business_name IS NOT NULL`
  );
  console.log(`Done. Rows with scraped_business_name: ${rows[0]?.count ?? 0}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
