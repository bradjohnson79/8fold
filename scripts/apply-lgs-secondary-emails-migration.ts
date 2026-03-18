/**
 * Apply migration 0149: add secondary_emails and primary_email_score columns.
 */
import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: join(process.cwd(), "apps/api/.env.local") });

const sql = readFileSync(join(process.cwd(), "drizzle/0149_lgs_secondary_emails.sql"), "utf-8");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  console.log("Applying migration 0149: secondary_emails and primary_email_score...");
  await client.query(sql);
  const { rows } = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM directory_engine.contractor_leads`
  );
  console.log(`Done. Total leads: ${rows[0]?.count ?? 0}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
