/**
 * LGS Email Enrichment Worker — Phase 2
 *
 * Picks up contractor leads needing verification and queues them for the
 * shared email verification worker.
 *
 * Designed to run as a cron job or long-running background process.
 * Processes in small batches to avoid overwhelming DNS.
 *
 * Usage:
 *   npx tsx apps/api/scripts/lgs-email-enrichment-worker.ts
 *   npx tsx apps/api/scripts/lgs-email-enrichment-worker.ts --batch=50 --once
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });

import { eq, sql } from "drizzle-orm";
import { db } from "../db/drizzle";
import { contractorLeads } from "../db/schema/directoryEngine";
import { enqueueVerificationEmail } from "../src/services/lgs/emailVerificationService";

const BATCH_SIZE = parseInt(process.argv.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? "25", 10);
const RUN_ONCE = process.argv.includes("--once");
const POLL_INTERVAL_MS = 10_000;
const BACKPRESSURE_THRESHOLD = 1000;
const BACKPRESSURE_DELAY_MS = 30_000;

async function processBatch(): Promise<number> {
  const leads = await db
    .select({ id: contractorLeads.id, email: contractorLeads.email })
    .from(contractorLeads)
    .where(
      sql`(
        ${contractorLeads.email} is not null
        and ${contractorLeads.email} != ''
        and (
          ${contractorLeads.emailVerificationStatus} = 'pending'
          or ${contractorLeads.emailVerificationStatus} is null
        )
      )`
    )
    .limit(BATCH_SIZE);

  if (leads.length === 0) return 0;

  console.log(`[Enrichment] Queueing ${leads.length} leads for verification...`);

  let queued = 0;
  for (const lead of leads) {
    if (!lead.email) continue;
    const result = await enqueueVerificationEmail(lead.email);
    if (result.action === "queued" || result.action === "cached") {
      queued++;
    }
  }

  console.log(`[Enrichment] Batch queued: ${queued}/${leads.length}`);

  return leads.length;
}

async function main() {
  console.log(`[Enrichment] Starting worker — batch=${BATCH_SIZE}, once=${RUN_ONCE}`);

  if (RUN_ONCE) {
    let total = 0;
    let processed: number;
    do {
      processed = await processBatch();
      total += processed;
    } while (processed > 0);
    console.log(`[Enrichment] Done. Total processed: ${total}`);
    process.exit(0);
  }

  // Continuous mode with backpressure
  const loop = async () => {
    try {
      const [{ count: pending }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(contractorLeads)
        .where(
          sql`(
            ${contractorLeads.email} is not null
            and ${contractorLeads.email} != ''
            and (
              ${contractorLeads.emailVerificationStatus} = 'pending'
              or ${contractorLeads.emailVerificationStatus} is null
            )
          )`
        );
      const pendingCount = Number(pending);

      if (pendingCount === 0) {
        console.log("[Enrichment] No pending leads. Sleeping...");
        setTimeout(loop, POLL_INTERVAL_MS);
        return;
      }

      if (pendingCount > BACKPRESSURE_THRESHOLD) {
        console.log(`[Enrichment] Backpressure: ${pendingCount} pending (>${BACKPRESSURE_THRESHOLD}). Slowing to ${BACKPRESSURE_DELAY_MS / 1000}s intervals.`);
        await processBatch();
        setTimeout(loop, BACKPRESSURE_DELAY_MS);
        return;
      }

      await processBatch();
    } catch (err) {
      console.error("[Enrichment] Batch error:", err);
    }
    setTimeout(loop, POLL_INTERVAL_MS);
  };

  await loop();
}

main().catch((err) => {
  console.error("[Enrichment] Fatal:", err);
  process.exit(1);
});
