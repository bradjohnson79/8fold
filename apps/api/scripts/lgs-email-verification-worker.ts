/**
 * LGS Email Verification Worker.
 * Runs every 5 minutes. Verifies contractor leads with controlled concurrency.
 *
 *   DOTENV_CONFIG_PATH=apps/api/.env.local pnpm -C apps/api run lgs:verification:worker
 */
import path from "node:path";
import cron from "node-cron";
import dotenv from "dotenv";
import EmailValidator from "email-deep-validator";
import { eq, isNull, or, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { db } from "../db/drizzle";
import { contractorLeads } from "../db/schema/directoryEngine";
import {
  PENDING_24H_WINDOW_HOURS,
  VERIFY_CONCURRENCY,
  canRetryVerification,
  verifyLeadEmail,
} from "../src/services/lgs/simpleEmailVerification";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local") });

const BATCH_SIZE = 20;
const validator = new EmailValidator({ timeout: 8000 });

async function logPending24hPlusCount(): Promise<number> {
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
    console.log(`[LGS Verification] pending_24h_plus=${value}`);
  }
  return value;
}

async function runVerificationCycle(): Promise<number> {
  const rows = await db
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

  const retryableRows = rows
    .filter((row) => canRetryVerification(row.verificationSource))
    .slice(0, BATCH_SIZE);

  if (retryableRows.length === 0) {
    await logPending24hPlusCount();
    return 0;
  }

  const domainCache = new Map<string, { score: number; status: "pending" | "valid" | "invalid" }>();
  const limit = pLimit(VERIFY_CONCURRENCY);

  await Promise.all(
    retryableRows.map((row) =>
      limit(async () => {
        const result = await verifyLeadEmail({
          email: row.email,
          previousSource: row.verificationSource,
          validator,
          channel: "verification_worker",
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
          .where(eq(contractorLeads.id, row.id));
      })
    )
  );

  await logPending24hPlusCount();
  return retryableRows.length;
}

function runCycle() {
  runVerificationCycle()
    .then((n) => {
      if (n > 0) console.log(`[LGS Verification] processed ${n} lead(s)`);
    })
    .catch((err) => {
      console.error("[LGS Verification] error:", err);
    });
}

cron.schedule("*/5 * * * *", runCycle, { timezone: "America/Los_Angeles" });
runCycle();

console.log("[LGS Verification] Worker started. Cron: */5 * * * * (every 5 min)");

process.on("SIGINT", () => {
  console.log("[LGS Verification] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[LGS Verification] Shutting down...");
  process.exit(0);
});
