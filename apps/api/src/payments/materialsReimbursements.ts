import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../db/schema/auditLog";
import { contractorLedgerEntries } from "../../db/schema/contractorLedgerEntry";
import { contractorPayouts } from "../../db/schema/contractorPayout";
import { jobPosterCredits } from "../../db/schema/jobPosterCredit";
import { materialsEscrows } from "../../db/schema/materialsEscrow";
import { materialsEscrowLedgerEntries } from "../../db/schema/materialsEscrowLedgerEntry";
import { materialsPayments } from "../../db/schema/materialsPayment";
import { materialsReceiptSubmissions } from "../../db/schema/materialsReceiptSubmission";
import { materialsRequests } from "../../db/schema/materialsRequest";
import { getApprovedContractorForUserId } from "../services/contractorIdentity";
import { nextBusinessDayUTC } from "../finance/businessDays";

export async function releaseMaterialsReimbursement(opts: {
  requestId: string;
  actorUserId: string; // contractor user id
}): Promise<
  | { kind: "ok"; reimbursedCents: number; remainderCents: number; overageCents: number; chargeId: string | null; escrowId: string }
  | { kind: "already" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "no_contractor" }
  | { kind: "not_ready" }
  | { kind: "escrow_missing" }
  | { kind: "no_receipts" }
  | { kind: "not_funded" }
> {
  const now = new Date();

  return await db.transaction(async (tx) => {
    const c = await getApprovedContractorForUserId(tx, opts.actorUserId);
    if (c.kind !== "ok") return { kind: "no_contractor" as const };

    const mrRows = await tx
      .select({
        id: materialsRequests.id,
        status: materialsRequests.status,
        jobId: materialsRequests.jobId,
        contractorId: materialsRequests.contractorId,
        jobPosterUserId: materialsRequests.jobPosterUserId,
        currency: materialsRequests.currency,
      })
      .from(materialsRequests)
      .where(eq(materialsRequests.id, opts.requestId))
      .limit(1);
    const mr = mrRows[0] ?? null;
    if (!mr) return { kind: "not_found" as const };
    if (mr.contractorId !== c.contractor.id) return { kind: "forbidden" as const };
    const status = String(mr.status);
    if (status !== "RECEIPTS_SUBMITTED" && status !== "REIMBURSED") return { kind: "not_ready" as const };

    const escrowRows = await tx
      .select({
        id: materialsEscrows.id,
        status: materialsEscrows.status,
        amountCents: materialsEscrows.amountCents,
        releasedAt: materialsEscrows.releasedAt,
      })
      .from(materialsEscrows)
      .where(eq(materialsEscrows.requestId, mr.id))
      .limit(1);
    const escrow = escrowRows[0] ?? null;
    if (!escrow) return { kind: "escrow_missing" as const };
    // Idempotency: if already released, treat as ok regardless of request status.
    if (escrow.releasedAt || escrow.status === "RELEASED") return { kind: "already" as const };
    if (escrow.status !== "HELD") return { kind: "escrow_missing" as const };

    const receiptsRows = await tx
      .select({
        id: materialsReceiptSubmissions.id,
        status: materialsReceiptSubmissions.status,
        receiptTotalCents: materialsReceiptSubmissions.receiptTotalCents,
        receiptSubtotalCents: materialsReceiptSubmissions.receiptSubtotalCents,
        receiptTaxCents: materialsReceiptSubmissions.receiptTaxCents,
        submittedAt: materialsReceiptSubmissions.submittedAt,
      })
      .from(materialsReceiptSubmissions)
      .where(eq(materialsReceiptSubmissions.requestId, mr.id))
      .limit(1);
    const receipts = receiptsRows[0] ?? null;
    if (!receipts || receipts.status !== "SUBMITTED" || !receipts.submittedAt) return { kind: "no_receipts" as const };

    const payRows = await tx
      .select({
        status: materialsPayments.status,
        stripeChargeId: materialsPayments.stripeChargeId,
      })
      .from(materialsPayments)
      .where(eq(materialsPayments.requestId, mr.id))
      .limit(1);
    const pay = payRows[0] ?? null;
    if (!pay || pay.status !== "CAPTURED") return { kind: "not_funded" as const };

    const escrowCents = escrow.amountCents;
    const receiptTotalCents = receipts.receiptTotalCents;
    const reimbursedCents = Math.min(receiptTotalCents, escrowCents);
    const remainderCents = Math.max(0, escrowCents - reimbursedCents);
    const overageCents = Math.max(0, receiptTotalCents - escrowCents);

    const scheduledFor = nextBusinessDayUTC(now, (c.contractor.country ?? "US") as any);

    // Idempotency: payout unique on materialsRequestId.
    const payoutRows = await tx
      .insert(contractorPayouts)
      .values({
        id: crypto.randomUUID(),
        contractorId: c.contractor.id,
        jobId: null,
        materialsRequestId: mr.id,
        amountCents: reimbursedCents,
        scheduledFor,
        status: "PENDING",
      } as any)
      .onConflictDoNothing({ target: [contractorPayouts.materialsRequestId] })
      .returning({ id: contractorPayouts.id });

    // Ledger: contractor reimbursement enters PENDING bucket (paid later).
    // Guard: only one reimbursement earning per (contractorId, jobId, amount, memo).
    const memo = "Materials reimbursement (capped by escrow; receipt-verified)";
    const existingLedger = await tx
      .select({ id: contractorLedgerEntries.id })
      .from(contractorLedgerEntries)
      .where(
        and(
          eq(contractorLedgerEntries.contractorId, c.contractor.id),
          eq(contractorLedgerEntries.jobId, mr.jobId),
          eq(contractorLedgerEntries.type, "CONTRACTOR_EARNING"),
          eq(contractorLedgerEntries.bucket, "PENDING"),
          eq(contractorLedgerEntries.amountCents, reimbursedCents),
          eq(contractorLedgerEntries.memo, memo),
        ),
      )
      .limit(1);
    if (!existingLedger[0]?.id) {
      await tx.insert(contractorLedgerEntries).values({
        id: crypto.randomUUID(),
        contractorId: c.contractor.id,
        jobId: mr.jobId,
        type: "CONTRACTOR_EARNING",
        bucket: "PENDING",
        amountCents: reimbursedCents,
        memo,
      } as any);
    }

    // Escrow release record (idempotent, relies on releasedAt guard above).
    await tx
      .update(materialsEscrows)
      .set({
        status: "RELEASED",
        releasedAt: now,
        reimbursedAmountCents: reimbursedCents,
        receiptTotalCents,
        overageCents,
        remainderCents,
        posterCreditCents: remainderCents > 0 && remainderCents <= 2000 ? remainderCents : 0,
        posterRefundCents: remainderCents > 2000 ? remainderCents : 0,
      } as any)
      .where(eq(materialsEscrows.id, escrow.id));

    // Ledger: RELEASE once.
    const existingRelease = await tx
      .select({ id: materialsEscrowLedgerEntries.id })
      .from(materialsEscrowLedgerEntries)
      .where(and(eq(materialsEscrowLedgerEntries.escrowId, escrow.id), eq(materialsEscrowLedgerEntries.type, "RELEASE")))
      .limit(1);
    if (!existingRelease[0]?.id) {
      await tx.insert(materialsEscrowLedgerEntries).values({
        id: crypto.randomUUID(),
        escrowId: escrow.id,
        type: "RELEASE",
        amountCents: reimbursedCents,
        currency: mr.currency as any,
        actorUserId: opts.actorUserId,
        memo: "Materials reimbursement released (receipt verified; capped by escrow)",
      } as any);
    }

    // Remainder credit (<= $20) is handled immediately (idempotent via unique on JobPosterCredit.escrowId).
    if (remainderCents > 0 && remainderCents <= 2000) {
      await tx
        .insert(jobPosterCredits)
        .values({
          id: crypto.randomUUID(),
          userId: mr.jobPosterUserId,
          escrowId: escrow.id,
          amountCents: remainderCents,
          memo: "Materials escrow remainder credit (<= $20)",
        })
        .onConflictDoNothing({ target: [jobPosterCredits.escrowId] });

      const existingCredit = await tx
        .select({ id: materialsEscrowLedgerEntries.id })
        .from(materialsEscrowLedgerEntries)
        .where(
          and(eq(materialsEscrowLedgerEntries.escrowId, escrow.id), eq(materialsEscrowLedgerEntries.type, "POSTER_CREDIT")),
        )
        .limit(1);
      if (!existingCredit[0]?.id) {
        await tx.insert(materialsEscrowLedgerEntries).values({
          id: crypto.randomUUID(),
          escrowId: escrow.id,
          type: "POSTER_CREDIT",
          amountCents: remainderCents,
          currency: mr.currency as any,
          actorUserId: null,
          memo: "Remainder stored as Job Poster credit (<= $20)",
        } as any);
      }
    }

    await tx
      .update(materialsRequests)
      .set({ status: "REIMBURSED", updatedAt: now } as any)
      .where(eq(materialsRequests.id, mr.id));

    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: opts.actorUserId,
      action: "MATERIALS_REIMBURSEMENT_RELEASED",
      entityType: "MaterialsRequest",
      entityId: mr.id,
      metadata: { escrowCents, receiptTotalCents, reimbursedCents, remainderCents, overageCents } as any,
    });

    return {
      kind: "ok" as const,
      reimbursedCents,
      remainderCents,
      overageCents,
      jobPosterUserId: mr.jobPosterUserId,
      escrowId: escrow.id,
      chargeId: pay.stripeChargeId ?? null,
    };
  });
}

