/**
 * Appraisal refactor migration — production-safe, idempotent.
 *
 * Changes:
 *  1. Drop NOT NULL on original_price_cents (still written on new rows as a snapshot)
 *  2. Drop NOT NULL on difference_cents (no longer written; computed dynamically)
 *  3. Rename status values: PENDING → PENDING_REVIEW, ACCEPTED_PENDING_PAYMENT → PAYMENT_PENDING
 *  4. Add APPRAISAL_PENDING to the JobStatus pgEnum
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/apply-appraisal-refactor-migration.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`[apply-appraisal-refactor-migration] ${name} is not set`);
  return v;
}

async function main() {
  const DATABASE_URL = mustEnv("DATABASE_URL");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("[apply-appraisal-refactor-migration] Connected ✓");

  // ── 1. Make original_price_cents nullable (still populated on new rows) ───────
  await client.query(`
    ALTER TABLE v4_job_price_adjustments
      ALTER COLUMN original_price_cents DROP NOT NULL
  `);
  console.log("[apply-appraisal-refactor-migration] original_price_cents: NOT NULL dropped ✓");

  // ── 2. Make difference_cents nullable (no longer written; computed dynamically) ─
  await client.query(`
    ALTER TABLE v4_job_price_adjustments
      ALTER COLUMN difference_cents DROP NOT NULL
  `);
  console.log("[apply-appraisal-refactor-migration] difference_cents: NOT NULL dropped ✓");

  // ── 3. Rename status values for existing rows ─────────────────────────────────
  const pendingResult = await client.query(`
    UPDATE v4_job_price_adjustments
       SET status = 'PENDING_REVIEW'
     WHERE status = 'PENDING'
    RETURNING id
  `);
  console.log(`[apply-appraisal-refactor-migration] PENDING → PENDING_REVIEW: ${pendingResult.rowCount} rows updated ✓`);

  const paymentResult = await client.query(`
    UPDATE v4_job_price_adjustments
       SET status = 'PAYMENT_PENDING'
     WHERE status = 'ACCEPTED_PENDING_PAYMENT'
    RETURNING id
  `);
  console.log(`[apply-appraisal-refactor-migration] ACCEPTED_PENDING_PAYMENT → PAYMENT_PENDING: ${paymentResult.rowCount} rows updated ✓`);

  // ── 4. Add APPRAISAL_PENDING to the JobStatus pgEnum ─────────────────────────
  // ADD VALUE IF NOT EXISTS is idempotent and requires no transaction.
  await client.query(`
    ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'APPRAISAL_PENDING'
  `);
  console.log("[apply-appraisal-refactor-migration] JobStatus enum: APPRAISAL_PENDING added ✓");

  await client.end();

  console.log("\n[apply-appraisal-refactor-migration] Migration complete.");
  console.log("  Next steps:");
  console.log("  1. Deploy API (schema + service changes)");
  console.log("  2. Deploy Web (poster consent page + contractor appraisals dashboard)");
  console.log("  3. Deploy Admin (updated appraisal panel)");
}

main().catch((err) => {
  console.error("[apply-appraisal-refactor-migration] FATAL:", err);
  process.exit(1);
});
