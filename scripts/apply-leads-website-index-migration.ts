/**
 * Apply migration: 0151_leads_website_index.sql
 * Adds B-tree indexes on contractor_leads(website) and LOWER(website)
 * to accelerate the SQL window-function consolidation query.
 */
import * as fs from "fs";
import * as path from "path";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../apps/api/.env.local") });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const migrationPath = path.resolve(__dirname, "../drizzle/0151_leads_website_index.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8");

  console.log("Applying migration: 0151_leads_website_index.sql");
  await pool.query(sql);
  console.log("Migration applied successfully.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
