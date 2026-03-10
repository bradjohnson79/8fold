/**
 * Assigned job cancellation migration — production-safe, idempotent.
 *
 * Changes:
 *  1. Add 'ASSIGNED_CANCEL_PENDING' to JobStatus enum
 *  2. Add 'PARTIALLY_REFUNDED' to EscrowStatus enum
 *  3. Add refund_processed_at, payout_processed_at, suspension_processed_at
 *     columns to job_cancel_requests
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/migrate-assigned-cancel-status.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`[migrate-assigned-cancel-status] ${name} is not set`);
  return v;
}

async function main() {
  const DATABASE_URL = mustEnv("DATABASE_URL");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("[migrate-assigned-cancel-status] Connected ✓");

  // 1. New job status for assigned job cancellations awaiting admin resolution
  await client.query(`ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED_CANCEL_PENDING'`);
  console.log("[migrate-assigned-cancel-status] JobStatus: ASSIGNED_CANCEL_PENDING added ✓");

  // 2. New escrow status for partial-refund-with-contractor-payout case
  await client.query(`ALTER TYPE "EscrowStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED'`);
  console.log("[migrate-assigned-cancel-status] EscrowStatus: PARTIALLY_REFUNDED added ✓");

  // 3. Resolution timestamp columns on job_cancel_requests
  await client.query(`
    ALTER TABLE job_cancel_requests
      ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS payout_processed_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS suspension_processed_at TIMESTAMP WITH TIME ZONE
  `);
  console.log("[migrate-assigned-cancel-status] job_cancel_requests: resolution timestamp columns added ✓");

  await client.end();

  console.log("\n[migrate-assigned-cancel-status] Migration complete.");
  console.log("  Next steps:");
  console.log("  1. Update apps/api/db/schema/enums.ts (add new enum values)");
  console.log("  2. Update apps/api/db/schema/jobCancelRequest.ts (add new columns)");
  console.log("  3. Deploy API");
}

main().catch((err) => {
  console.error("[migrate-assigned-cancel-status] FATAL:", err);
  process.exit(1);
});
