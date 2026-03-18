/**
 * Apply LGS Sender Pool + Verification migration (0138).
 *
 *   DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-lgs-sender-pool-migration.ts
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

async function main() {
  const sqlPath = path.join(process.cwd(), "drizzle", "0138_lgs_sender_pool_and_verification.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query(sql);
    console.log("LGS sender pool migration (0138) applied successfully.");
  } catch (e) {
    console.error("Migration failed:", e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
