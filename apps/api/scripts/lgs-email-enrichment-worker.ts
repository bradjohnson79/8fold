/**
 * LGS Email Enrichment Worker — Phase 2
 *
 * Picks up contractor_leads with verification_status = 'pending',
 * runs DNS + SMTP verification, updates score, and archives low-quality leads.
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

const BATCH_SIZE = parseInt(process.argv.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? "25", 10);
const RUN_ONCE = process.argv.includes("--once");
const VERIFY_CONCURRENCY = 5;
const POLL_INTERVAL_MS = 10_000;
const ARCHIVE_THRESHOLD = 85;
const BACKPRESSURE_THRESHOLD = 1000;
const BACKPRESSURE_DELAY_MS = 30_000;

const validator = new EmailValidator({ timeout: 5000 });
const verifyLimit = pLimit(VERIFY_CONCURRENCY);

async function verifyEmail(email: string): Promise<{ score: number; status: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return { score: 0, status: "rejected" };

  try {
    const result = await validator.verify(normalized);
    let score = 0;
    if (result.wellFormed) score += 20;
    if (result.validDomain) score += 50;
    if (result.validMailbox === true) score += 20;
    else if (result.validMailbox === null) score += 10;
    if (result.validDomain && result.validMailbox === true) score += 10;

    if (score >= 80) return { score, status: "verified" };
    if (score >= 70) return { score, status: "qualified" };
    return { score, status: "low_quality" };
  } catch {
    return { score: 0, status: "verification_failed" };
  }
}

async function processBatch(): Promise<number> {
  const leads = await db
    .select({ id: contractorLeads.id, email: contractorLeads.email })
    .from(contractorLeads)
    .where(
      or(
        eq(contractorLeads.verificationStatus, "pending"),
        isNull(contractorLeads.verificationStatus)
      )
    )
    .limit(BATCH_SIZE);

  if (leads.length === 0) return 0;

  console.log(`[Enrichment] Processing ${leads.length} leads...`);

  const results = await Promise.allSettled(
    leads.map((lead) =>
      verifyLimit(async () => {
        const { score, status } = await verifyEmail(lead.email);

        const shouldArchive = score > 0 && score < ARCHIVE_THRESHOLD;

        await db
          .update(contractorLeads)
          .set({
            verificationScore: score,
            verificationStatus: status,
            verificationSource: "enrichment_worker",
            archived: shouldArchive ? true : undefined,
            archivedAt: shouldArchive ? new Date() : undefined,
          })
          .where(eq(contractorLeads.id, lead.id));

        return { id: lead.id, email: lead.email, score, status, archived: shouldArchive };
      })
    )
  );

  let verified = 0;
  let archived = 0;
  let failed = 0;

  for (const r of results) {
    if (r.status === "fulfilled") {
      verified++;
      if (r.value.archived) archived++;
    } else {
      failed++;
    }
  }

  console.log(
    `[Enrichment] Batch done: ${verified} verified, ${archived} archived (<${ARCHIVE_THRESHOLD}), ${failed} failed`
  );

  return leads.length;
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
