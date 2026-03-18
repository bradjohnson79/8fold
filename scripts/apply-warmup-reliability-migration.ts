/**
 * Apply migration 0158_warmup_reliability.sql
 * Adds warmup observability columns to sender_pool,
 * creates lgs_warmup_activity and lgs_worker_health tables.
 *
 * Usage:
 *   npx tsx scripts/apply-warmup-reliability-migration.ts
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "drizzle/0158_warmup_reliability.sql"),
    "utf-8"
  );

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query(sql);
    console.log("[Migration] 0158_warmup_reliability.sql applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[Migration] Failed:", e);
  process.exit(1);
});
