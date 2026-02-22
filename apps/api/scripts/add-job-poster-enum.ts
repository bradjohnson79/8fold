/**
 * One-time fix: Add JOB_POSTER to UserRole enum in production.
 * Usage: DOTENV_CONFIG_PATH=.env.local tsx -r dotenv/config scripts/add-job-poster-enum.ts
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS \'JOB_POSTER\'');
    console.log("OK: JOB_POSTER added to UserRole enum");
  } catch (e: any) {
    console.error("Error:", e?.message ?? e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
