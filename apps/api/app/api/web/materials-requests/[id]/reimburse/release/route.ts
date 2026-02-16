import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../../src/http/errors";
import { getApprovedContractorForUserId } from "../../../../../../../src/services/contractorIdentity";
import { nextBusinessDayUTC } from "../../../../../../../src/finance/businessDays";
import { refundCharge } from "../../../../../../../src/payments/stripe";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../../../../../db/drizzle";
import {
  auditLogs,
  contractorLedgerEntries,
  contractorPayouts,
  jobPosterCredits,
  materialsEscrowLedgerEntries,
  materialsEscrows,
  materialsPayments,
  materialsReceiptSubmissions,
  materialsRequests,
} from "../../../../../../../db/schema";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../materials-requests/:id/reimburse/release
  return parts[parts.length - 3] ?? "";
}

const BodySchema = z.object({
  acknowledge: z.literal(true)
});

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    if (String(u.role) !== "CONTRACTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const requestId = getIdFromUrl(req);
    const now = new Date();

    const result = await db.transaction(async (tx) => {
      const c = await getApprovedContractorForUserId(tx, u.userId);
      if (c.kind !== "ok") return { kind: "no_contractor" as const };

      const mr =
        (
          await tx
            .select({
              id: materialsRequests.id,
              status: materialsRequests.status,
              jobId: materialsRequests.jobId,
              contractorId: materialsRequests.contractorId,
              jobPosterUserId: materialsRequests.jobPosterUserId,
              currency: materialsRequests.currency,
              totalAmountCents: materialsRequests.totalAmountCents,
            })
            .from(materialsRequests)
            .where(eq(materialsRequests.id, requestId))
            .limit(1)
        )[0] ?? null;
      if (!mr) return { kind: "not_found" as const };
      if (mr.contractorId !== c.contractor.id) return { kind: "forbidden" as const };

      if (mr.status !== "RECEIPTS_SUBMITTED") return { kind: "not_ready" as const };

      const escrow =
        (
          await tx
            .select({
              id: materialsEscrows.id,
              status: materialsEscrows.status,
              amountCents: materialsEscrows.amountCents,
              releasedAt: materialsEscrows.releasedAt,
            })
            .from(materialsEscrows)
            .where(eq(materialsEscrows.requestId, mr.id))
            .limit(1)
        )[0] ?? null;
      if (!escrow || escrow.status !== "HELD") return { kind: "escrow_missing" as const };

      const receipts =
        (
          await tx
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
            .limit(1)
        )[0] ?? null;
      if (!receipts || receipts.status !== "SUBMITTED" || !receipts.submittedAt) return { kind: "no_receipts" as const };

      const payment =
        (
          await tx
            .select({ status: materialsPayments.status, stripeChargeId: materialsPayments.stripeChargeId })
            .from(materialsPayments)
            .where(eq(materialsPayments.requestId, mr.id))
            .limit(1)
        )[0] ?? null;
      if (!payment || payment.status !== "CAPTURED") return { kind: "not_funded" as const };

      // Idempotency: only one reimbursement per request (escrow release)
      if (escrow.releasedAt) return { kind: "already" as const };

      const escrowCents = escrow.amountCents;
      const receiptTotalCents = receipts.receiptTotalCents;
      const reimbursedCents = Math.min(receiptTotalCents, escrowCents);
      const remainderCents = Math.max(0, escrowCents - reimbursedCents);
      const overageCents = Math.max(0, receiptTotalCents - escrowCents);

      // Create contractor payout record (manual v1, scheduled next business day)
      const scheduledFor = nextBusinessDayUTC(now, (c.contractor.country ?? "US") as any);

      // Ledger: contractor reimbursement enters PENDING bucket (paid later)
      await tx.insert(contractorLedgerEntries).values({
        id: randomUUID(),
        contractorId: c.contractor.id,
        jobId: mr.jobId,
        type: "CONTRACTOR_EARNING" as any,
        bucket: "PENDING" as any,
        amountCents: reimbursedCents,
        memo: "Materials reimbursement (capped by escrow; receipt-verified)",
      });

      await tx.insert(contractorPayouts).values({
        id: randomUUID(),
        contractorId: c.contractor.id,
        jobId: null,
        materialsRequestId: mr.id,
        amountCents: reimbursedCents,
        scheduledFor,
      });

      // Escrow release record
      await tx
        .update(materialsEscrows)
        .set({
          status: "RELEASED" as any,
          releasedAt: now,
          reimbursedAmountCents: reimbursedCents,
          receiptTotalCents,
          overageCents,
          remainderCents,
          posterCreditCents: remainderCents > 0 && remainderCents <= 2000 ? remainderCents : 0,
          posterRefundCents: remainderCents > 2000 ? remainderCents : 0,
        })
        .where(eq(materialsEscrows.id, escrow.id));

      await tx.insert(materialsEscrowLedgerEntries).values({
        id: randomUUID(),
        escrowId: escrow.id,
        type: "RELEASE" as any,
        amountCents: reimbursedCents,
        currency: mr.currency as any,
        actorUserId: u.userId,
        memo: "Materials reimbursement released (receipt verified; capped by escrow)",
      });

      // Remainder handling is done outside the transaction if Stripe refund is needed.
      // For credit (<= $20), record a credit entry now.
      if (remainderCents > 0 && remainderCents <= 2000) {
        await tx.insert(jobPosterCredits).values({
          id: randomUUID(),
          userId: mr.jobPosterUserId,
          escrowId: escrow.id,
          amountCents: remainderCents,
          memo: "Materials escrow remainder credit (<= $20)",
        });
        await tx.insert(materialsEscrowLedgerEntries).values({
          id: randomUUID(),
          escrowId: escrow.id,
          type: "POSTER_CREDIT" as any,
          amountCents: remainderCents,
          currency: mr.currency as any,
          actorUserId: null,
          memo: "Remainder stored as Job Poster credit (<= $20)",
        });
      }

      await tx
        .update(materialsRequests)
        .set({ status: "REIMBURSED" as any, updatedAt: now })
        .where(eq(materialsRequests.id, mr.id));

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
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
        chargeId: payment.stripeChargeId
      };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.kind === "no_contractor") return NextResponse.json({ error: "Contractor not approved" }, { status: 403 });
    if (result.kind === "not_funded") return NextResponse.json({ error: "Escrow not funded yet" }, { status: 409 });
    if (result.kind === "not_ready") return NextResponse.json({ error: "Receipts must be submitted first" }, { status: 409 });
    if (result.kind === "escrow_missing") return NextResponse.json({ error: "Escrow missing" }, { status: 409 });
    if (result.kind === "no_receipts") return NextResponse.json({ error: "Receipts not submitted" }, { status: 409 });
    if (result.kind === "already") return NextResponse.json({ ok: true, alreadyReleased: true });

    // Stripe refund path (remainder > $20)
    if (result.remainderCents > 2000) {
      if (!result.chargeId) {
        return NextResponse.json({ error: "Cannot refund remainder: missing Stripe charge id" }, { status: 409 });
      }
      const refund = await refundCharge({ chargeId: result.chargeId, amountCents: result.remainderCents, reason: "requested_by_customer" });
      // Best-effort: record refund ledger entry + payment metadata
      await db.transaction(async (tx) => {
        const now2 = new Date();
        await tx.insert(materialsEscrowLedgerEntries).values({
          id: randomUUID(),
          escrowId: result.escrowId,
          type: "POSTER_REFUND" as any,
          amountCents: result.remainderCents,
          memo: `Remainder refunded to Job Poster via Stripe (${refund.refundId})`,
        });
        await tx
          .update(materialsPayments)
          .set({
            refundAmountCents: result.remainderCents,
            refundedAt: now2,
            stripeRefundId: refund.refundId,
            status: "REFUNDED" as any,
            updatedAt: now2,
          })
          .where(eq(materialsPayments.requestId, requestId));
      });
    }

    return NextResponse.json({
      ok: true,
      reimbursedCents: result.reimbursedCents,
      overageCents: result.overageCents,
      remainderCents: result.remainderCents
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

