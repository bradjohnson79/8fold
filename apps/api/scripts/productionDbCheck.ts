/**
 * Production DB verification: count Job rows and log sample.
 * Usage: DATABASE_URL="..." pnpm check:prod
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { desc, sql } from "drizzle-orm";
import { db } from "../src/server/db/drizzle";
import { jobs } from "../db/schema/job";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_ENV_PATH = path.join(SCRIPT_DIR, "..", ".env.local");
dotenv.config({ path: API_ENV_PATH });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required. Set it or ensure apps/api/.env.local exists.");
    process.exit(1);
  }

  const countRes = await db.select({ count: sql<number>`count(*)::int` }).from(jobs);
  const count = Number(countRes[0]?.count ?? 0);

  console.log(`[productionDbCheck] Job count: ${count}`);

  if (count > 0) {
    const rows = await db
      .select({ id: jobs.id, status: jobs.status, archived: jobs.archived })
      .from(jobs)
      .orderBy(desc(jobs.created_at))
      .limit(5);
    console.log("[productionDbCheck] Sample (newest 5):");
    for (const r of rows) {
      console.log(`  id=${r.id} status=${r.status} archived=${r.archived}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[productionDbCheck] Error:", err);
  process.exit(1);
});
