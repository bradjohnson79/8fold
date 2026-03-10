/**
 * Job cancel requests v2 migration — production-safe, idempotent.
 *
 * Changes:
 *  1. Add `requested_by_role` TEXT column to job_cancel_requests (default 'JOB_POSTER')
 *  2. Add `within_penalty_window` BOOLEAN column to job_cancel_requests (default false)
 *  3. Add `support_ticket_id` TEXT column to job_cancel_requests (nullable)
 *  4. Add `resolved_at` TIMESTAMP WITH TIME ZONE to job_cancel_requests (nullable)
 *  5. Add 'refunded' value to job_request_status enum (idempotent via IF NOT EXISTS)
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/migrate-job-cancel-requests-v2.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`[migrate-job-cancel-requests-v2] ${name} is not set`);
  return v;
}

async function main() {
  const DATABASE_URL = mustEnv("DATABASE_URL");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("[migrate-job-cancel-requests-v2] Connected ✓");

  // 1. Add requested_by_role
  await client.query(`
    ALTER TABLE job_cancel_requests
      ADD COLUMN IF NOT EXISTS requested_by_role TEXT NOT NULL DEFAULT 'JOB_POSTER'
  `);
  console.log("[migrate-job-cancel-requests-v2] requested_by_role: added ✓");

  // 2. Add within_penalty_window
  await client.query(`
    ALTER TABLE job_cancel_requests
      ADD COLUMN IF NOT EXISTS within_penalty_window BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("[migrate-job-cancel-requests-v2] within_penalty_window: added ✓");

  // 3. Add support_ticket_id
  await client.query(`
    ALTER TABLE job_cancel_requests
      ADD COLUMN IF NOT EXISTS support_ticket_id TEXT
  `);
  console.log("[migrate-job-cancel-requests-v2] support_ticket_id: added ✓");

  // 4. Add resolved_at
  await client.query(`
    ALTER TABLE job_cancel_requests
      ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE
  `);
  console.log("[migrate-job-cancel-requests-v2] resolved_at: added ✓");

  // 5. Add 'refunded' to job_request_status enum (ADD VALUE IF NOT EXISTS is idempotent)
  await client.query(`
    ALTER TYPE job_request_status ADD VALUE IF NOT EXISTS 'refunded'
  `);
  console.log("[migrate-job-cancel-requests-v2] job_request_status enum: 'refunded' added ✓");

  await client.end();

  console.log("\n[migrate-job-cancel-requests-v2] Migration complete.");
  console.log("  Next steps:");
  console.log("  1. Deploy API (schema + service changes)");
  console.log("  2. Deploy Admin (cancellation card + jobs list badge)");
}

main().catch((err) => {
  console.error("[migrate-job-cancel-requests-v2] FATAL:", err);
  process.exit(1);
});
