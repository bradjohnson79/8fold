import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { jobPayments } from "@/db/schema/jobPayment";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { refundPaymentIntent } from "@/src/payments/stripe";
import { getRefundWindowDays, getUnassignedRefundEligibility, type RefundEligibility, type RefundIneligibleCode } from "@/src/services/escrow/refundEligibility";
import { writeRefundLedger } from "@/src/services/escrow/ledger";

type RefundActor = {
  actorUserId: string;
  actorType: "JOB_POSTER" | "SYSTEM";
};

function toCurrency(job: { currency: string | null; country: string | null }): "USD" | "CAD" {
  if (String(job.currency ?? "").toUpperCase() === "CAD") return "CAD";
  if (String(job.country ?? "").toUpperCase() === "CA") return "CAD";
  return "USD";
}

export type RefundUnassignedJobResult = {
  ok: boolean;
  idempotent: boolean;
  jobId: string;
  refundedAt: string | null;
  paymentStatus: string;
  stripePaymentIntentStatus: string | null;
  refundId: string | null;
  reasonCode?: RefundIneligibleCode | "MISSING_PAYMENT_INTENT" | "NOT_FOUND" | "FORBIDDEN";
};

export async function refundUnassignedJob(
  jobId: string,
  actor: RefundActor,
  opts?: { expectedPosterUserId?: string; now?: Date },
): Promise<RefundUnassignedJobResult> {
  const now = opts?.now ?? new Date();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from jobs where id = ${jobId} for update`);

    const rows = await tx
      .select({
        id: jobs.id,
        status: jobs.status,
        jobPosterUserId: jobs.job_poster_user_id,
        contractorUserId: jobs.contractor_user_id,
        paymentStatus: jobs.payment_status,
        stripePaymentIntentId: jobs.stripe_payment_intent_id,
        stripePaymentIntentStatus: jobs.stripe_payment_intent_status,
        stripePaidAt: jobs.stripe_paid_at,
        stripeRefundedAt: jobs.stripe_refunded_at,
        totalAmountCents: jobs.total_amount_cents,
        amountCents: jobs.amount_cents,
        currency: jobs.currency,
        country: jobs.country,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    const job = rows[0] ?? null;
    if (!job) {
      return {
        ok: false,
        idempotent: false,
        jobId,
        refundedAt: null,
        paymentStatus: "",
        stripePaymentIntentStatus: null,
        refundId: null,
        reasonCode: "NOT_FOUND",
      };
    }

    if (opts?.expectedPosterUserId && String(job.jobPosterUserId ?? "") !== opts.expectedPosterUserId) {
      return {
        ok: false,
        idempotent: false,
        jobId,
        refundedAt: null,
        paymentStatus: String(job.paymentStatus ?? ""),
        stripePaymentIntentStatus: job.stripePaymentIntentStatus ?? null,
        refundId: null,
        reasonCode: "FORBIDDEN",
      };
    }

    const activeAssignmentRows = await tx
      .select({ id: v4JobAssignments.id })
      .from(v4JobAssignments)
      .where(and(eq(v4JobAssignments.jobId, jobId), inArray(v4JobAssignments.status, ["ASSIGNED", "IN_PROGRESS", "COMPLETED"])))
      .limit(1);

    const eligibility = getUnassignedRefundEligibility({
      status: String(job.status ?? ""),
      paymentStatus: String(job.paymentStatus ?? ""),
      contractorUserId: job.contractorUserId ?? null,
      hasActiveAssignment: Boolean(activeAssignmentRows[0]?.id),
      stripePaidAt: job.stripePaidAt ?? null,
      stripeRefundedAt: job.stripeRefundedAt ?? null,
      now,
    });

    if (!eligibility.eligible) {
      const refundLedgerRows = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.jobId, jobId), eq(ledgerEntries.type, "REFUND" as any)))
        .limit(1);
      const idempotent = eligibility.code === "ALREADY_REFUNDED" || Boolean(refundLedgerRows[0]?.id);
      return {
        ok: idempotent,
        idempotent,
        jobId,
        refundedAt: job.stripeRefundedAt ? job.stripeRefundedAt.toISOString() : null,
        paymentStatus: String(job.paymentStatus ?? ""),
        stripePaymentIntentStatus: job.stripePaymentIntentStatus ?? null,
        refundId: null,
        reasonCode: eligibility.code,
      };
    }

    const paymentIntentId = String(job.stripePaymentIntentId ?? "").trim();
    if (!paymentIntentId) {
      return {
        ok: false,
        idempotent: false,
        jobId,
        refundedAt: null,
        paymentStatus: String(job.paymentStatus ?? ""),
        stripePaymentIntentStatus: job.stripePaymentIntentStatus ?? null,
        refundId: null,
        reasonCode: "MISSING_PAYMENT_INTENT",
      };
    }

    const amountCents = Math.max(0, Number(job.totalAmountCents ?? 0) || Number(job.amountCents ?? 0));
    const refund = await refundPaymentIntent({
      paymentIntentId,
      amountCents,
      reason: "requested_by_customer",
      idempotencyKey: `escrow-refund:${job.id}:${paymentIntentId}`,
      metadata: {
        jobId: String(job.id),
        actorUserId: actor.actorUserId,
        actorType: actor.actorType,
        reason: "REFUNDED_UNASSIGNED_TIMEOUT",
      },
    });

    await tx
      .update(jobs)
      .set({
        payment_status: "REFUNDED" as any,
        stripe_refunded_at: now,
        refunded_at: now,
        archived: true,
        completion_flag_reason: "REFUNDED_UNASSIGNED_TIMEOUT",
        updated_at: now,
      } as any)
      .where(eq(jobs.id, job.id));

    await tx
      .update(jobPayments)
      .set({
        status: "REFUNDED" as any,
        refundedAt: now,
        refundAmountCents: amountCents,
        refundIssuedAt: now,
        updatedAt: now,
      } as any)
      .where(eq(jobPayments.jobId, job.id));

    await writeRefundLedger(tx as any, {
      jobId: job.id,
      totalAmountCents: amountCents,
      currency: toCurrency({ currency: job.currency ?? null, country: job.country ?? null }),
      paymentIntentId,
      refundId: refund.refundId,
    });

    return {
      ok: true,
      idempotent: false,
      jobId,
      refundedAt: now.toISOString(),
      paymentStatus: "REFUNDED",
      stripePaymentIntentStatus: job.stripePaymentIntentStatus ?? null,
      refundId: refund.refundId,
    };
  });
}

export type RefundStaleSweepResult = {
  scanned: number;
  refunded: number;
  idempotent: number;
  failed: Array<{ jobId: string; reason: string }>;
};

export async function refundStaleUnassignedJobs(now = new Date()): Promise<RefundStaleSweepResult> {
  const threshold = new Date(now.getTime() - getRefundWindowDays() * 24 * 60 * 60 * 1000);
  const staleRows = await db
    .select({ id: jobs.id, jobPosterUserId: jobs.job_poster_user_id })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "OPEN_FOR_ROUTING" as any),
        inArray(jobs.payment_status, ["FUNDS_SECURED", "FUNDED"] as any),
        isNull(jobs.stripe_refunded_at),
        isNull(jobs.contractor_user_id),
        isNotNull(jobs.stripe_paid_at),
        lte(jobs.stripe_paid_at, threshold),
      ),
    );

  const failed: Array<{ jobId: string; reason: string }> = [];
  let refunded = 0;
  let idempotent = 0;

  for (const row of staleRows) {
    const result = await refundUnassignedJob(
      row.id,
      {
        actorUserId: String(row.jobPosterUserId ?? "system:escrow-refund-sweep"),
        actorType: "SYSTEM",
      },
      { now },
    );

    if (result.ok && result.idempotent) {
      idempotent += 1;
      continue;
    }
    if (result.ok) {
      refunded += 1;
      continue;
    }
    failed.push({ jobId: row.id, reason: result.reasonCode ?? "UNKNOWN" });
  }

  return {
    scanned: staleRows.length,
    refunded,
    idempotent,
    failed,
  };
}
