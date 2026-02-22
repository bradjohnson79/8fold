import crypto from "node:crypto";
import { calculatePayoutBreakdown } from "@8fold/shared";
import { cancelPaymentIntent, createPaymentIntent } from "./stripe";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobPayments } from "../../db/schema/jobPayment";
import { jobs } from "../../db/schema/job";

export type PaymentStatus =
  | { state: "unpaid" }
  | { state: "pending"; paymentIntentId: string; stripeStatus: string; amountCents: number }
  | { state: "captured"; paymentIntentId: string; stripeStatus: string; amountCents: number }
  | { state: "failed"; paymentIntentId: string; stripeStatus: string; amountCents: number }
  | { state: "refunded"; paymentIntentId: string; stripeStatus: string; amountCents: number; refundAmountCents: number };

function idempotencyKeyForJobPayment(jobId: string, amountCents: number) {
  return `job_${jobId}_amount_${amountCents}`;
}

export async function getPaymentStatus(jobId: string): Promise<PaymentStatus> {
  const rows = await db
    .select({
      stripePaymentIntentId: jobPayments.stripePaymentIntentId,
      stripePaymentIntentStatus: jobPayments.stripePaymentIntentStatus,
      amountCents: jobPayments.amountCents,
      status: jobPayments.status,
      refundAmountCents: jobPayments.refundAmountCents,
    })
    .from(jobPayments)
    .where(eq(jobPayments.jobId, jobId))
    .limit(1);
  const p = rows[0] ?? null;

  if (!p) return { state: "unpaid" };

  if (String(p.status) === "CAPTURED") {
    return {
      state: "captured",
      paymentIntentId: String(p.stripePaymentIntentId ?? ""),
      stripeStatus: String(p.stripePaymentIntentStatus ?? ""),
      amountCents: Number(p.amountCents ?? 0)
    };
  }
  if (String(p.status) === "FAILED") {
    return {
      state: "failed",
      paymentIntentId: String(p.stripePaymentIntentId ?? ""),
      stripeStatus: String(p.stripePaymentIntentStatus ?? ""),
      amountCents: Number(p.amountCents ?? 0)
    };
  }
  if (String(p.status) === "REFUNDED") {
    return {
      state: "refunded",
      paymentIntentId: String(p.stripePaymentIntentId ?? ""),
      stripeStatus: String(p.stripePaymentIntentStatus ?? ""),
      amountCents: Number(p.amountCents ?? 0),
      refundAmountCents: p.refundAmountCents == null ? Number(p.amountCents ?? 0) : Number(p.refundAmountCents ?? 0)
    };
  }

  return {
    state: "pending",
    paymentIntentId: String(p.stripePaymentIntentId ?? ""),
    stripeStatus: String(p.stripePaymentIntentStatus ?? ""),
    amountCents: Number(p.amountCents ?? 0)
  };
}

/**
 * Create or reuse a Stripe PaymentIntent for a job.
 * - Amount is ALWAYS derived from Job totals (labor + materials + tx fee)
 * - Idempotent by (jobId, amountCents)
 * - Prevents double-charging by cancelling prior pending intents if amount changes
 */
export async function createJobPaymentIntent(jobId: string) {
  const jobRows = await db
    .select({
      id: jobs.id,
      laborTotalCents: jobs.labor_total_cents,
      materialsTotalCents: jobs.materials_total_cents,
      escrowLockedAt: jobs.escrow_locked_at,
      jobPosterUserId: jobs.job_poster_user_id,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.archived, false)))
    .limit(1);
  const job = jobRows[0] ?? null;
  if (!job) throw Object.assign(new Error("Job not found"), { status: 404 });
  if (!job.jobPosterUserId) throw Object.assign(new Error("Job missing poster"), { status: 400 });
  if (job.escrowLockedAt) {
    throw Object.assign(new Error("Payment already captured/escrow locked"), { status: 409 });
  }

  // Amount is authoritative from canonical payout breakdown.
  // Revenue split is fixed and transaction fees are absorbed (no fee added to poster invoice here).
  const breakdown = calculatePayoutBreakdown(job.laborTotalCents ?? 0, job.materialsTotalCents ?? 0);
  const amountCents = breakdown.totalJobPosterPaysCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw Object.assign(new Error("Invalid job totals for payment"), { status: 400 });
  }

  const existingRows = await db
    .select({
      stripePaymentIntentId: jobPayments.stripePaymentIntentId,
      status: jobPayments.status,
      amountCents: jobPayments.amountCents,
    })
    .from(jobPayments)
    .where(eq(jobPayments.jobId, job.id))
    .limit(1);
  const existing = existingRows[0] ?? null;

  // If existing pending intent has different amount, cancel it.
  if (existing && String(existing.status) === "PENDING" && Number(existing.amountCents ?? 0) !== amountCents) {
    try {
      await cancelPaymentIntent(String(existing.stripePaymentIntentId ?? ""));
    } catch {
      // Best effort; we still create a new one deterministically below.
    }
    await db.delete(jobPayments).where(eq(jobPayments.jobId, job.id));
  }

  const idempotencyKey = idempotencyKeyForJobPayment(job.id, amountCents);
  const pi = await createPaymentIntent(amountCents, {
    currency: "usd",
    idempotencyKey,
    metadata: { jobId: job.id, jobPosterUserId: job.jobPosterUserId }
  });

  const now = new Date();
  const inserted = await db
    .insert(jobPayments)
    .values({
      id: crypto.randomUUID(),
      jobId: job.id,
      stripePaymentIntentId: pi.paymentIntentId,
      stripePaymentIntentStatus: pi.status,
      amountCents,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: jobPayments.jobId,
      set: {
        stripePaymentIntentId: pi.paymentIntentId,
        stripePaymentIntentStatus: pi.status,
        amountCents,
        status: "PENDING",
        updatedAt: now,
      } as any,
    })
    .returning({
      stripePaymentIntentId: jobPayments.stripePaymentIntentId,
      stripePaymentIntentStatus: jobPayments.stripePaymentIntentStatus,
      amountCents: jobPayments.amountCents,
    });
  const payment = inserted[0]!;

  return {
    clientSecret: pi.clientSecret,
    paymentIntentId: String(payment.stripePaymentIntentId ?? ""),
    stripeStatus: String(payment.stripePaymentIntentStatus ?? ""),
    amountCents: Number(payment.amountCents ?? 0)
  };
}
