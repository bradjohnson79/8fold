/**
 * Add PARTIALLY_REFUNDED to the PaymentStatus postgres enum.
 * Idempotent: uses ADD VALUE IF NOT EXISTS.
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/migrate-payment-status-partial-refund.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { Client } from "pg";

async function main() {
  const DATABASE_URL = String(process.env.DATABASE_URL ?? "").trim();
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("[migrate-payment-status-partial-refund] Connected ✓");

  await client.query(`ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED'`);
  console.log("[migrate-payment-status-partial-refund] PaymentStatus: PARTIALLY_REFUNDED added ✓");

  await client.end();
  console.log("[migrate-payment-status-partial-refund] Migration complete.");
}

main().catch((err) => {
  console.error("[migrate-payment-status-partial-refund] FATAL:", err);
  process.exit(1);
});
