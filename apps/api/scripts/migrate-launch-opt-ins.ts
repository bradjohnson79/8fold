/**
 * Migration: launch_opt_ins table (idempotent).
 *
 * Creates the launch_opt_ins table for the simplified contractor Phase 1 launch form.
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/migrate-launch-opt-ins.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`[migrate-launch-opt-ins] ${name} is not set`);
  return v;
}

async function main() {
  const DATABASE_URL = mustEnv("DATABASE_URL");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("[migrate-launch-opt-ins] Connected ✓");

  await client.query(`
    CREATE TABLE IF NOT EXISTS launch_opt_ins (
      id         TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
      first_name TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      city       TEXT,
      state      TEXT NOT NULL DEFAULT 'California',
      source     TEXT NOT NULL DEFAULT 'homepage_launch_list',
      status     TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[migrate-launch-opt-ins] launch_opt_ins table created ✓");

  await client.query(`
    CREATE INDEX IF NOT EXISTS launch_opt_ins_email_idx ON launch_opt_ins (email)
  `);
  console.log("[migrate-launch-opt-ins] Index on email ensured ✓");

  await client.end();
  console.log("\n[migrate-launch-opt-ins] Migration complete.");
}

main().catch((err) => {
  console.error("[migrate-launch-opt-ins] FATAL:", err);
  process.exit(1);
});
