/**
 * LGS Email Enrichment Worker — Phase 2
 *
 * Picks up contractor leads with pending verification and processes them in batches.
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

import { eq, sql, isNull, or } from "drizzle-orm";
import pLimit from "p-limit";
import EmailValidator from "email-deep-validator";
import { db } from "../db/drizzle";
import { contractorLeads } from "../db/schema/directoryEngine";
import {
  PENDING_24H_WINDOW_HOURS,
  VERIFY_CONCURRENCY,
  canRetryVerification,
  verifyLeadEmail,
} from "../src/services/lgs/simpleEmailVerification";

const BATCH_SIZE = parseInt(process.argv.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? "25", 10);
const RUN_ONCE = process.argv.includes("--once");
const POLL_INTERVAL_MS = 10_000;
const BACKPRESSURE_THRESHOLD = 1000;
const BACKPRESSURE_DELAY_MS = 30_000;

const validator = new EmailValidator({ timeout: 5000 });
const verifyLimit = pLimit(VERIFY_CONCURRENCY);

async function readPending24hPlusCount(): Promise<number> {
  const threshold = new Date(Date.now() - PENDING_24H_WINDOW_HOURS * 60 * 60 * 1000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contractorLeads)
    .where(
      sql`(
        ${contractorLeads.verificationStatus} IS NULL
        OR ${contractorLeads.verificationStatus} = 'pending'
      )
      AND ${contractorLeads.createdAt} <= ${threshold}`
    );

  const value = Number(count ?? 0);
  if (value > 0) {
    console.log(`[Enrichment] pending_24h_plus=${value}`);
  }
  return value;
}

async function processBatch(): Promise<number> {
  const leads = await db
    .select({
      id: contractorLeads.id,
      email: contractorLeads.email,
      verificationSource: contractorLeads.verificationSource,
    })
    .from(contractorLeads)
    .where(
      or(
        eq(contractorLeads.verificationStatus, "pending"),
        isNull(contractorLeads.verificationStatus)
      )
    )
    .limit(BATCH_SIZE * 4);

  const retryableLeads = leads
    .filter((lead) => canRetryVerification(lead.verificationSource))
    .slice(0, BATCH_SIZE);

  if (retryableLeads.length === 0) {
    await readPending24hPlusCount();
    return 0;
  }

  console.log(`[Enrichment] Processing ${retryableLeads.length} leads...`);
  const domainCache = new Map<string, { score: number; status: "pending" | "valid" | "invalid" }>();

  const results = await Promise.allSettled(
    retryableLeads.map((lead) =>
      verifyLimit(async () => {
        const result = await verifyLeadEmail({
          email: lead.email,
          previousSource: lead.verificationSource,
          validator,
          channel: "enrichment_worker",
          domainCache,
        });

        await db
          .update(contractorLeads)
          .set({
            verificationScore: result.score,
            verificationStatus: result.status,
            verificationSource: result.source,
            updatedAt: new Date(),
          })
          .where(eq(contractorLeads.id, lead.id));

        return result;
      })
    )
  );

  let valid = 0;
  let invalid = 0;
  let pending = 0;
  let failed = 0;

  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.status === "valid") valid++;
      else if (r.value.status === "invalid") invalid++;
      else pending++;
    } else {
      failed++;
    }
  }

  console.log(
    `[Enrichment] Batch done: ${valid} valid, ${invalid} invalid, ${pending} pending, ${failed} failed`
  );

  await readPending24hPlusCount();
  return retryableLeads.length;
}

async function main() {
  console.log(`[Enrichment] Starting worker — batch=${BATCH_SIZE}, concurrency=${VERIFY_CONCURRENCY}, once=${RUN_ONCE}`);

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
          or(
            eq(contractorLeads.verificationStatus, "pending"),
            isNull(contractorLeads.verificationStatus)
          )
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
