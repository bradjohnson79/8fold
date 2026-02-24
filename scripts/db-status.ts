#!/usr/bin/env tsx
/**
 * List applied and pending Drizzle migrations.
 *
 * Usage: DATABASE_URL="<url>" pnpm exec tsx scripts/db-status.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(repoRoot, "apps/api/.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

function listSqlFiles(dirAbs: string): string[] {
  return fs.readdirSync(dirAbs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".sql"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const drizzleDir = path.join(repoRoot, "drizzle");
  const allMigrations = listSqlFiles(drizzleDir);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  let applied: string[] = [];
  try {
    const res = await client.query<{ id: string }>(`SELECT id FROM drizzle_sql_migrations ORDER BY id`);
    applied = res.rows.map((r) => r.id);
  } catch {
    console.log("drizzle_sql_migrations table not found — no migrations applied yet.");
  }

  const pending = allMigrations.filter((f) => !applied.includes(f));
  const jobsRelated = ["0061_canonicalize_jobs_table.sql", "0063_jobs_legacy_cleanup.sql"];

  console.log("=== Migration Status ===\n");
  console.log("Applied:", applied.length);
  applied.forEach((id) => console.log("  -", id));
  console.log("\nPending:", pending.length);
  pending.forEach((id) => console.log("  -", id));
  console.log("\nJobs-related pending:", jobsRelated.filter((f) => pending.includes(f)).join(", ") || "none");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
