import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { stripe } from "@/src/stripe/stripe";
import { escrows } from "@/db/schema/escrow";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { jobPosterCredits } from "@/db/schema/jobPosterCredit";
import { contractorPayouts } from "@/db/schema/contractorPayout";
import { pmRequests } from "@/db/schema/pmRequest";
import { pmReceipts } from "@/db/schema/pmReceipt";
import { nextBusinessDayUTC } from "@/src/finance/businessDays";
import { contractors } from "@/db/schema/contractor";

const REMAINDER_WALLET_THRESHOLD_CENTS = 2000; // $20

export type ReleasePmFundsResult =
  | { ok: true; releaseAmountCents: number; remainderCents: number; alreadyReleased: boolean }
  | { ok: false; code: string; reason: string };

export function computePmReleaseAmounts(receiptTotalCents: number, approvedTotalCents: number): {
  releaseAmountCents: number;
  remainderCents: number;
} {
  // Overruns are contractor liability. Never exceed approvedQuoteTotal.
  const releaseAmountCents = Math.min(receiptTotalCents, approvedTotalCents);
  const remainderCents = Math.max(0, approvedTotalCents - releaseAmountCents);
  return { releaseAmountCents, remainderCents };
}

export async function releasePmFunds(opts: {
  pmRequestId: string;
  actorUserId: string;
  tx?: any;
}): Promise<ReleasePmFundsResult> {
  const run = async (tx: any): Promise<ReleasePmFundsResult> => {
    const pmRows = await tx
      .select({
        id: pmRequests.id,
        status: pmRequests.status,
        jobId: pmRequests.jobId,
        contractorId: pmRequests.contractorId,
        jobPosterUserId: pmRequests.jobPosterUserId,
        approvedTotal: pmRequests.approvedTotal,
        currency: pmRequests.currency,
        escrowId: pmRequests.escrowId,
        stripePaymentIntentId: pmRequests.stripePaymentIntentId,
      })
      .from(pmRequests)
      .where(eq(pmRequests.id, opts.pmRequestId))
      .limit(1);
    const pm = pmRows[0] ?? null;
    if (!pm) return { ok: false, code: "NOT_FOUND", reason: "PM request not found" };
    if (pm.status === "RELEASED" || pm.status === "CLOSED") {
      return { ok: true, releaseAmountCents: 0, remainderCents: 0, alreadyReleased: true };
    }
    if (pm.status !== "VERIFIED") {
      return { ok: false, code: "INVALID_STATUS", reason: "PM request must be VERIFIED to release" };
    }

    if (String(pm.jobPosterUserId) !== String(opts.actorUserId)) {
      return { ok: false, code: "FORBIDDEN", reason: "Only job poster can release funds" };
    }

    const escrowRows = await tx
      .select({
        id: escrows.id,
        status: escrows.status,
        amountCents: escrows.amountCents,
        releasedAt: escrows.releasedAt,
      })
      .from(escrows)
      .where(eq(escrows.id, pm.escrowId))
      .limit(1);
    const escrow = escrowRows[0] ?? null;
    if (!escrow) return { ok: false, code: "ESCROW_MISSING", reason: "Escrow not found" };
    if (escrow.releasedAt || String(escrow.status) === "RELEASED") {
      return { ok: true, releaseAmountCents: 0, remainderCents: 0, alreadyReleased: true };
    }

    const receiptRows = await tx
      .select({
        id: pmReceipts.id,
        extractedTotal: pmReceipts.extractedTotal,
        verified: pmReceipts.verified,
      })
      .from(pmReceipts)
      .where(and(eq(pmReceipts.pmRequestId, opts.pmRequestId), eq(pmReceipts.verified, true)));
    const receiptTotal = receiptRows.reduce((sum: number, r: { extractedTotal: string | null }) => {
      const val = Number(r.extractedTotal ?? 0);
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);
    const receiptTotalCents = Math.round(receiptTotal * 100);
    const approvedTotalCents = Math.round(Number(pm.approvedTotal ?? 0) * 100);
    const { releaseAmountCents, remainderCents } = computePmReleaseAmounts(receiptTotalCents, approvedTotalCents);

    const now = new Date();
    const currency = String(pm.currency ?? "USD").toUpperCase() as "USD" | "CAD";

    await tx
      .update(escrows)
      .set({
        status: "RELEASED" as any,
        releasedAt: now,
        updatedAt: now,
      } as any)
      .where(eq(escrows.id, escrow.id));

    await tx
      .update(pmRequests)
      .set({
        status: "RELEASED",
        updatedAt: now,
      })
      .where(and(eq(pmRequests.id, opts.pmRequestId), inArray(pmRequests.status, ["VERIFIED"] as any)));

    const ledgerId = randomUUID();
    await tx.insert(ledgerEntries).values({
      id: ledgerId,
      userId: pm.jobPosterUserId,
      jobId: pm.jobId,
      escrowId: escrow.id,
      type: "PM_RELEASE" as any,
      direction: "CREDIT" as any,
      bucket: "PAID" as any,
      amountCents: releaseAmountCents,
      currency: currency as any,
      memo: `P&M release to contractor for request ${opts.pmRequestId}`,
    } as any);

    const existingPayout = await tx
      .select({ id: contractorPayouts.id })
      .from(contractorPayouts)
      .where(eq(contractorPayouts.pmRequestId, opts.pmRequestId))
      .limit(1)
      .then((r: Array<{ id: string }>) => r[0]);
    if (!existingPayout) {
      const contractorRows = await tx
        .select({ country: contractors.country })
        .from(contractors)
        .where(eq(contractors.id, pm.contractorId))
        .limit(1);
      const contractorCountry = contractorRows[0]?.country ?? "US";
      const scheduledFor = nextBusinessDayUTC(now, contractorCountry as any);
      const payoutId = randomUUID();
      await tx
        .insert(contractorPayouts)
        .values({
          id: payoutId,
          contractorId: pm.contractorId,
          jobId: pm.jobId,
          pmRequestId: opts.pmRequestId,
          amountCents: releaseAmountCents,
          scheduledFor,
          status: "PENDING",
        } as any)
        .onConflictDoNothing();
    }

    if (remainderCents > 0) {
      if (
        remainderCents < REMAINDER_WALLET_THRESHOLD_CENTS ||
        !stripe ||
        !pm.stripePaymentIntentId
      ) {
        const creditId = randomUUID();
        await tx.insert(jobPosterCredits).values({
          id: creditId,
          userId: pm.jobPosterUserId,
          escrowId: String(escrow.id),
          amountCents: remainderCents,
          memo: `P&M remainder credit for request ${opts.pmRequestId}`,
        } as any);
        await tx.insert(ledgerEntries).values({
          id: randomUUID(),
          userId: pm.jobPosterUserId,
          jobId: pm.jobId,
          escrowId: escrow.id,
          type: "PM_CREDIT" as any,
          direction: "CREDIT" as any,
          bucket: "AVAILABLE" as any,
          amountCents: remainderCents,
          currency: currency as any,
          memo: `P&M remainder wallet credit for request ${opts.pmRequestId}`,
        } as any);
      } else {
        const refund = await stripe.refunds.create({
          payment_intent: pm.stripePaymentIntentId,
          amount: remainderCents,
          reason: "requested_by_customer",
          metadata: { type: "pm_remainder", pmRequestId: opts.pmRequestId },
        });
        await tx.insert(ledgerEntries).values({
          id: randomUUID(),
          userId: pm.jobPosterUserId,
          jobId: pm.jobId,
          escrowId: escrow.id,
          type: "PM_REFUND" as any,
          direction: "CREDIT" as any,
          bucket: "PAID" as any,
          amountCents: remainderCents,
          currency: currency as any,
          stripeRef: refund.id,
          memo: `P&M remainder refund for request ${opts.pmRequestId}`,
        } as any);
      }
    }

    await tx
      .update(pmRequests)
      .set({ status: "CLOSED", updatedAt: now })
      .where(eq(pmRequests.id, opts.pmRequestId));

    return {
      ok: true,
      releaseAmountCents,
      remainderCents,
      alreadyReleased: false,
    };
  };

  return opts.tx ? run(opts.tx) : db.transaction(run);
}
