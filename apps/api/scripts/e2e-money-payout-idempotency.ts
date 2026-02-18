import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Env isolation: load from apps/api/.env.local only (no repo-root fallback).
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { contractors } from "../db/schema/contractor";
import { contractorLedgerEntries } from "../db/schema/contractorLedgerEntry";
import { contractorPayouts } from "../db/schema/contractorPayout";
import { jobAssignments } from "../db/schema/jobAssignment";
import { jobs } from "../db/schema/job";
import { users } from "../db/schema/user";
import { scheduleContractorPayoutForJob } from "../src/finance/contractorPayouts";
import { assertNotProductionSeed } from "./_seedGuard";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  assertNotProductionSeed("e2e-money-payout-idempotency.ts");
  const runId = crypto.randomUUID().slice(0, 8);
  const now = new Date();

  const posterUserId = `audit_poster_${runId}`;
  const contractorUserId = `audit_contractor_user_${runId}`;
  const jobId = `audit_job_${runId}`;
  const contractorId = `audit_contractor_${runId}`;

  const email = `payout.contractor.${runId}@8fold.local`;

  await db.transaction(async (tx) => {
    await tx.insert(users).values([
      {
        id: posterUserId,
        clerkUserId: `seed:${posterUserId}`,
        email: `poster.payout.${runId}@8fold.local`,
        role: "JOB_POSTER" as any,
        updatedAt: now,
      } as any,
      { id: contractorUserId, clerkUserId: `seed:${contractorUserId}`, email, role: "CONTRACTOR" as any, updatedAt: now } as any,
    ]);

    await tx.insert(contractors).values({
      id: contractorId,
      status: "APPROVED" as any,
      businessName: `Payout Contractor ${runId}`,
      email,
      regionCode: "BC",
      trade: "PLUMBING" as any,
      country: "CA" as any,
    } as any);

    await tx.insert(jobs).values({
      id: jobId,
      title: `Payout job ${runId}`,
      scope: "Test scope",
      region: "BC",
      jobType: "urban" as any,
      jobPosterUserId: posterUserId,
      contractorUserId: contractorUserId,
      isMock: false,
      status: "COMPLETED_APPROVED" as any,
      paymentReleasedAt: now,
      contractorPayoutCents: 25_00,
    } as any);

    await tx.insert(jobAssignments).values({
      id: `audit_assign_${runId}`,
      jobId,
      contractorId,
      status: "ASSIGNED",
      assignedByAdminUserId: posterUserId,
    } as any);
  });

  const a1 = await scheduleContractorPayoutForJob(jobId);
  const a2 = await scheduleContractorPayoutForJob(jobId);
  assert(["ok", "already_scheduled"].includes(a1.kind), "unexpected schedule result");
  assert(["ok", "already_scheduled"].includes(a2.kind), "unexpected schedule result");

  const payoutCount = await db
    .select({ c: sql<number>`count(*)` })
    .from(contractorPayouts)
    .where(eq(contractorPayouts.jobId, jobId));
  assert(Number(payoutCount[0]?.c ?? 0) === 1, "expected exactly 1 ContractorPayout row");

  const ledgerCount = await db
    .select({ c: sql<number>`count(*)` })
    .from(contractorLedgerEntries)
    .where(
      and(
        eq(contractorLedgerEntries.contractorId, contractorId),
        eq(contractorLedgerEntries.jobId, jobId),
        eq(contractorLedgerEntries.type, "CONTRACTOR_EARNING"),
        eq(contractorLedgerEntries.bucket, "PENDING"),
      ),
    );
  assert(Number(ledgerCount[0]?.c ?? 0) === 1, "expected exactly 1 pending earning ledger entry");

  console.log("PASS e2e-money-payout-idempotency", { runId, jobId });
}

main().catch((e) => {
  console.error("FAIL e2e-money-payout-idempotency", e);
  process.exit(1);
});

