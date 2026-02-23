/**
 * Job refund (Stripe).
 *
 * Shared by:
 * - Admin manual refund endpoint
 * - Dispute resolution workflows
 *
 * Stripe implementation is unchanged; this service centralizes idempotency + DB updates.
 *
 * Financial safety contract:
 * - Refunds are ALWAYS refused once payout is released (`payoutStatus=RELEASED`).
 *   We do not implement clawback / reversal logic, so refund-after-release is unsafe.
 * - While a dispute is open (`jobs.status=DISPUTED`), refunds are blocked unless the dispute is resolved
 *   (`DisputeCase.status` in `DECIDED`/`CLOSED`).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { stripe } from "../stripe/stripe";
import { db } from "../../db/drizzle";
import { disputeCases } from "../../db/schema/disputeCase";
import { jobs } from "../../db/schema/job";
import { jobPayments } from "../../db/schema/jobPayment";
import { transferRecords } from "../../db/schema/transferRecord";

function requireStripe() {
  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  return stripe;
}

export type RefundJobFundsKind =
  | { kind: "ok"; refundId: string; status: string }
  | { kind: "not_found" }
  | { kind: "not_funded"; paymentStatus: string }
  | { kind: "already_refunded" }
  | { kind: "refund_after_release" }
  | { kind: "refund_after_partial_release" }
  | { kind: "disputed" }
  | { kind: "missing_stripe_ref" }
  | { kind: "bad_amount" };

export async function refundJobFunds(jobId: string): Promise<RefundJobFundsKind> {
  if (!jobId) return { kind: "not_found" };
  const s = requireStripe();

  return await db.transaction(async (tx: any) => {
    await tx.execute(sql`select id from jobs where id = ${jobId} for update`);

    const jobRows = await tx
      .select({
        id: jobs.id,
        status: jobs.status,
        paymentStatus: jobs.payment_status,
        payoutStatus: jobs.payout_status,
        stripePaymentIntentId: jobs.stripe_payment_intent_id,
        stripeChargeId: jobs.stripe_charge_id,
        amountCents: jobs.amount_cents,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return { kind: "not_found" as const };

    const ps = String(job.paymentStatus ?? "UNPAID");
    if (ps === "REFUNDED") return { kind: "already_refunded" as const };
    if (ps !== "FUNDED") return { kind: "not_funded" as const, paymentStatus: ps };

    // Block refund after payout release (no clawback logic exists).
    if (String(job.payoutStatus ?? "") === "RELEASED") return { kind: "refund_after_release" as const };

    // Also block refund after any partial release leg has been SENT (even if payoutStatus has not been updated yet).
    const sentLeg = await tx
      .select({ id: transferRecords.id })
      .from(transferRecords)
      .where(and(eq(transferRecords.jobId, jobId), eq(transferRecords.status, "SENT" as any)))
      .limit(1);
    if (sentLeg.length > 0) return { kind: "refund_after_partial_release" as const };

    // No payout movement while dispute open. Refund allowed only when dispute is DECIDED or CLOSED.
    if (String(job.status ?? "") === "DISPUTED") {
      const resolvedRows = await tx
        .select({ id: disputeCases.id })
        .from(disputeCases)
        .where(and(eq(disputeCases.jobId, jobId), inArray(disputeCases.status, ["DECIDED", "CLOSED"] as const)))
        .limit(1);
      if (resolvedRows.length === 0) return { kind: "disputed" as const };
    }

    const paymentIntentId = job.stripePaymentIntentId ? String(job.stripePaymentIntentId) : "";
    const chargeId = job.stripeChargeId ? String(job.stripeChargeId) : "";
    if (!paymentIntentId && !chargeId) return { kind: "missing_stripe_ref" as const };

    const amountCents = Number(job.amountCents ?? 0);
    if (!Number.isInteger(amountCents) || amountCents <= 0) return { kind: "bad_amount" as const };

    const refund =
      paymentIntentId
        ? await s.refunds.create({
            payment_intent: paymentIntentId,
            amount: amountCents,
            reason: "requested_by_customer",
            metadata: { jobId, type: "job_refund" },
          })
        : await s.refunds.create({
            charge: chargeId,
            amount: amountCents,
            reason: "requested_by_customer",
            metadata: { jobId, type: "job_refund" },
          });

    const now = new Date();
    await tx
      .update(jobs)
      .set({
        payment_status: "REFUNDED" as any,
        refunded_at: now,
      } as any)
      .where(eq(jobs.id, jobId));

    await tx
      .update(jobPayments)
      .set({
        status: "REFUNDED",
        refundedAt: now,
        refundAmountCents: amountCents,
        refundIssuedAt: now,
        updatedAt: now,
      } as any)
      .where(and(eq(jobPayments.jobId, jobId), isNull(jobPayments.refundedAt)));

    return { kind: "ok" as const, refundId: refund.id, status: refund.status ?? "unknown" };
  });
}

