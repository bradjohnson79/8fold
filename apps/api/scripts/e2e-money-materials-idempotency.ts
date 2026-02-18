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
import { jobs } from "../db/schema/job";
import { jobAssignments } from "../db/schema/jobAssignment";
import { materialsEscrows } from "../db/schema/materialsEscrow";
import { materialsEscrowLedgerEntries } from "../db/schema/materialsEscrowLedgerEntry";
import { materialsPayments } from "../db/schema/materialsPayment";
import { materialsReceiptSubmissions } from "../db/schema/materialsReceiptSubmission";
import { materialsRequests } from "../db/schema/materialsRequest";
import { users } from "../db/schema/user";
import { createMaterialsPaymentIntent, confirmMaterialsPayment } from "../src/payments/materialsPayments";
import { releaseMaterialsReimbursement } from "../src/payments/materialsReimbursements";
import { assertNotProductionSeed } from "./_seedGuard";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  assertNotProductionSeed("e2e-money-materials-idempotency.ts");
  const runId = crypto.randomUUID().slice(0, 8);
  const now = new Date();

  const posterUserId = `audit_poster_${runId}`;
  const contractorUserId = `audit_contractor_${runId}`;
  const jobId = `audit_job_${runId}`;
  const contractorId = `audit_contractor_row_${runId}`;
  const mrId = `audit_mr_${runId}`;

  const email = `contractor.audit.${runId}@8fold.local`;

  // Seed minimal entities.
  await db.transaction(async (tx) => {
    await tx.insert(users).values([
      {
        id: posterUserId,
        clerkUserId: `seed:${posterUserId}`,
        email: `poster.audit.${runId}@8fold.local`,
        role: "JOB_POSTER" as any,
        updatedAt: now,
      } as any,
      { id: contractorUserId, clerkUserId: `seed:${contractorUserId}`, email, role: "CONTRACTOR" as any, updatedAt: now } as any,
    ]);

    await tx.insert(contractors).values({
      id: contractorId,
      status: "APPROVED" as any,
      businessName: `Audit Contractor ${runId}`,
      email,
      regionCode: "BC",
      trade: "PLUMBING" as any,
      country: "CA" as any,
    } as any);

    await tx.insert(jobs).values({
      id: jobId,
      title: `Audit job ${runId}`,
      scope: "Test scope",
      region: "BC",
      jobType: "urban" as any,
      jobPosterUserId: posterUserId,
      contractorUserId: contractorUserId,
      isMock: false,
      paymentReleasedAt: now,
      status: "COMPLETED_APPROVED" as any,
    } as any);

    await tx.insert(jobAssignments).values({
      id: `audit_assign_${runId}`,
      jobId,
      contractorId,
      status: "ASSIGNED",
      assignedByAdminUserId: posterUserId,
    } as any);

    await tx.insert(materialsRequests).values({
      id: mrId,
      jobId,
      contractorId,
      jobPosterUserId: posterUserId,
      status: "SUBMITTED",
      currency: "CAD" as any,
      totalAmountCents: 10_00,
      updatedAt: now,
      submittedAt: now,
    } as any);
  });

  // Create + confirm twice (idempotent deposit).
  const pi = await createMaterialsPaymentIntent(mrId);
  await confirmMaterialsPayment(mrId, pi.paymentIntentId, posterUserId);
  await confirmMaterialsPayment(mrId, pi.paymentIntentId, posterUserId);

  // Prepare receipts + status for reimbursement (no remainder/overage).
  await db.transaction(async (tx) => {
    const escrowRow = await tx
      .select({ id: materialsEscrows.id, amountCents: materialsEscrows.amountCents })
      .from(materialsEscrows)
      .where(eq(materialsEscrows.requestId, mrId))
      .limit(1);
    assert(escrowRow[0]?.id, "escrow missing after confirm");
    const escrowId = escrowRow[0]!.id;
    const amount = escrowRow[0]!.amountCents;

    await tx
      .insert(materialsReceiptSubmissions)
      .values({
        id: `audit_sub_${runId}`,
        requestId: mrId,
        status: "SUBMITTED" as any,
        currency: "CAD" as any,
        receiptSubtotalCents: amount,
        receiptTaxCents: 0,
        receiptTotalCents: amount,
        submittedAt: now,
        updatedAt: now,
      } as any)
      .onConflictDoUpdate({
        target: [materialsReceiptSubmissions.requestId],
        set: { status: "SUBMITTED" as any, submittedAt: now, receiptTotalCents: amount, updatedAt: now } as any,
      });

    await tx.update(materialsRequests).set({ status: "RECEIPTS_SUBMITTED" as any, updatedAt: now } as any).where(eq(materialsRequests.id, mrId));

    // ensure payment has charge id for completeness (dev mode may keep null)
    await tx
      .update(materialsPayments)
      .set({ stripeChargeId: sql`coalesce(${materialsPayments.stripeChargeId}, 'dev_charge')`, updatedAt: now } as any)
      .where(eq(materialsPayments.requestId, mrId));

    // sanity: there is exactly one DEPOSIT
    const dep = await tx
      .select({ c: sql<number>`count(*)` })
      .from(materialsEscrowLedgerEntries)
      .where(and(eq(materialsEscrowLedgerEntries.escrowId, escrowId), eq(materialsEscrowLedgerEntries.type, "DEPOSIT")));
    assert(Number(dep[0]?.c ?? 0) === 1, "expected exactly 1 DEPOSIT ledger entry");
  });

  // Release twice (idempotent release)
  const r1 = await releaseMaterialsReimbursement({ requestId: mrId, actorUserId: contractorUserId });
  const r2 = await releaseMaterialsReimbursement({ requestId: mrId, actorUserId: contractorUserId });
  assert(r1.kind === "ok" || r1.kind === "already", "unexpected release result");
  assert(r2.kind === "ok" || r2.kind === "already", "unexpected release result");

  // Assert exactly one RELEASE ledger entry
  const escrow = await db
    .select({ id: materialsEscrows.id })
    .from(materialsEscrows)
    .where(eq(materialsEscrows.requestId, mrId))
    .limit(1);
  const escrowId = escrow[0]?.id;
  assert(escrowId, "escrow not found");
  const rel = await db
    .select({ c: sql<number>`count(*)` })
    .from(materialsEscrowLedgerEntries)
    .where(and(eq(materialsEscrowLedgerEntries.escrowId, escrowId), eq(materialsEscrowLedgerEntries.type, "RELEASE")));
  assert(Number(rel[0]?.c ?? 0) === 1, "expected exactly 1 RELEASE ledger entry");

  console.log("PASS e2e-money-materials-idempotency", { runId, mrId, escrowId });
}

main().catch((e) => {
  console.error("FAIL e2e-money-materials-idempotency", e);
  process.exit(1);
});

