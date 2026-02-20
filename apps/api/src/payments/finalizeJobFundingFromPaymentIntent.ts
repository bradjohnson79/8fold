import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type Stripe from "stripe";
import { db } from "../../db/drizzle";
import { jobs } from "../../db/schema/job";
import { jobPayments } from "../../db/schema/jobPayment";
import { escrows } from "../../db/schema/escrow";
import { auditLogs } from "../../db/schema/auditLog";
import { logEvent } from "../server/observability/log";

type FinalizeOpts = {
  route: string;
  source: "verify_route" | "webhook";
  authenticatedUserId?: string;
  webhookEventId?: string;
  tx?: any;
};

type FinalizeSuccess = {
  ok: true;
  idempotent: boolean;
  jobId: string;
  paymentIntentId: string;
  paidAt: string | null;
};

type FinalizeFailure = {
  ok: false;
  code: "PAYMENT_VERIFICATION_FAILED";
  reason: string;
  traceId: string;
  jobId: string | null;
  requiresSupportTicket: true;
};

export type FinalizeFundingResult = FinalizeSuccess | FinalizeFailure;

function fail(reason: string, jobId: string | null = null): FinalizeFailure {
  return {
    ok: false,
    code: "PAYMENT_VERIFICATION_FAILED",
    reason,
    traceId: randomUUID(),
    jobId,
    requiresSupportTicket: true,
  };
}

function metadataFromPi(pi: Stripe.PaymentIntent) {
  const jobId = String(pi.metadata?.jobId ?? "").trim();
  const jobPosterUserId = String(pi.metadata?.jobPosterUserId ?? "").trim();
  const userId = String(pi.metadata?.userId ?? "").trim();
  return { jobId, jobPosterUserId, userId };
}

export async function finalizeJobFundingFromPaymentIntent(
  pi: Stripe.PaymentIntent,
  opts: FinalizeOpts,
): Promise<FinalizeFundingResult> {
  const meta = metadataFromPi(pi);
  if (!meta.jobId) return fail("missing_job_id_metadata");
  if (!meta.jobPosterUserId) return fail("missing_job_poster_user_id_metadata", meta.jobId);

  const run = async (tx: any): Promise<FinalizeFundingResult> => {
    const rows = await tx
      .select({
        id: jobs.id,
        jobPosterUserId: jobs.jobPosterUserId,
        paymentStatus: jobs.paymentStatus,
        amountCents: jobs.amountCents,
        paymentCurrency: jobs.paymentCurrency,
        stripePaymentIntentId: jobs.stripePaymentIntentId,
        fundedAt: jobs.fundedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.id, meta.jobId), eq(jobs.archived, false)))
      .limit(1);
    const job = rows[0] ?? null;
    if (!job) return fail("job_not_found", meta.jobId);
    if (String(job.jobPosterUserId ?? "") !== meta.jobPosterUserId) {
      return fail("metadata_job_poster_mismatch", meta.jobId);
    }
    if (opts.authenticatedUserId && String(job.jobPosterUserId ?? "") !== opts.authenticatedUserId) {
      return fail("authenticated_user_not_owner", meta.jobId);
    }
    if (opts.authenticatedUserId && meta.userId !== opts.authenticatedUserId) {
      return fail("metadata_user_mismatch", meta.jobId);
    }

    const existingJobPi = String(job.stripePaymentIntentId ?? "").trim();
    if (existingJobPi && existingJobPi !== pi.id) {
      return fail("job_already_mapped_to_different_payment_intent", meta.jobId);
    }

    const expectedAmount = Number(job.amountCents ?? 0);
    const expectedCurrency = String(job.paymentCurrency ?? "").trim().toLowerCase();
    let incomingAmount = Number(pi.amount_received ?? 0);
    const amountSource = incomingAmount > 0 ? "amount_received" : "amount";
    if (amountSource === "amount") {
      incomingAmount = Number(pi.amount ?? 0);
      logEvent({
        level: "warn",
        event: "stripe.payment_verification_amount_received_missing",
        route: opts.route,
        method: "POST",
        status: 200,
        code: "AMOUNT_RECEIVED_MISSING_FALLBACK",
        context: {
          jobId: job.id,
          paymentIntentId: pi.id,
          source: opts.source,
          webhookEventId: opts.webhookEventId ?? null,
        },
      });
    }
    const incomingCurrency = String(pi.currency ?? "").trim().toLowerCase();

    const verificationFailed =
      pi.status !== "succeeded" ||
      !Number.isInteger(expectedAmount) ||
      expectedAmount <= 0 ||
      expectedAmount !== incomingAmount ||
      !expectedCurrency ||
      expectedCurrency !== incomingCurrency;
    if (verificationFailed) {
      return fail("status_or_amount_or_currency_mismatch", meta.jobId);
    }

    const paymentRows = await tx
      .select({
        id: jobPayments.id,
        status: jobPayments.status,
        stripePaymentIntentId: jobPayments.stripePaymentIntentId,
      })
      .from(jobPayments)
      .where(eq(jobPayments.jobId, job.id))
      .limit(1);
    const payment = paymentRows[0] ?? null;
    const existingPaymentPi = String(payment?.stripePaymentIntentId ?? "").trim();
    if (existingPaymentPi && existingPaymentPi !== pi.id) {
      return fail("payment_row_mapped_to_different_payment_intent", meta.jobId);
    }

    if (String(job.paymentStatus ?? "") === "FUNDED" || String(payment?.status ?? "") === "CAPTURED") {
      return {
        ok: true,
        idempotent: true,
        jobId: job.id,
        paymentIntentId: pi.id,
        paidAt: job.fundedAt instanceof Date ? job.fundedAt.toISOString() : null,
      };
    }

    const now = new Date();
    if (!payment?.id) {
      await tx.insert(jobPayments).values({
        id: randomUUID(),
        jobId: job.id,
        stripePaymentIntentId: pi.id,
        stripePaymentIntentStatus: String(pi.status ?? ""),
        stripeChargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null,
        amountCents: incomingAmount,
        status: "CAPTURED",
        escrowLockedAt: now,
        paymentCapturedAt: now,
        updatedAt: now,
      } as any);
    } else {
      await tx
        .update(jobPayments)
        .set({
          stripePaymentIntentId: pi.id,
          stripePaymentIntentStatus: String(pi.status ?? ""),
          stripeChargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null,
          amountCents: incomingAmount,
          status: "CAPTURED" as any,
          escrowLockedAt: now,
          paymentCapturedAt: now,
          updatedAt: now,
        } as any)
        .where(eq(jobPayments.id, payment.id));
    }

    await tx
      .update(jobs)
      .set({
        paymentStatus: "FUNDED" as any,
        fundedAt: now,
        stripePaymentIntentId: pi.id,
        stripeChargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null,
        status: "OPEN_FOR_ROUTING" as any,
        escrowLockedAt: now,
        paymentCapturedAt: now,
      } as any)
      .where(eq(jobs.id, job.id));

    const escrowRows = await tx
      .select({ id: escrows.id, status: escrows.status })
      .from(escrows)
      .where(and(eq(escrows.jobId, job.id), eq(escrows.kind, "JOB_ESCROW" as any)))
      .limit(1);
    const escrow = escrowRows[0] ?? null;
    if (!escrow?.id) {
      await tx.insert(escrows).values({
        jobId: job.id,
        kind: "JOB_ESCROW" as any,
        amountCents: expectedAmount,
        currency: expectedCurrency.toUpperCase() as any,
        status: "FUNDED" as any,
        stripePaymentIntentId: pi.id,
        webhookProcessedAt: now,
        updatedAt: now,
      } as any);
    } else if (String(escrow.status ?? "") === "PENDING") {
      await tx
        .update(escrows)
        .set({
          status: "FUNDED" as any,
          stripePaymentIntentId: pi.id,
          webhookProcessedAt: now,
          updatedAt: now,
        } as any)
        .where(eq(escrows.id, escrow.id));
    }

    await tx.insert(auditLogs).values({
      id: randomUUID(),
      actorUserId: String(job.jobPosterUserId ?? "system:stripe"),
      action: "PAYMENT_COMPLETED",
      entityType: "Job",
      entityId: job.id,
      metadata: {
        stripeWebhookEventId: opts.webhookEventId ?? null,
        stripePaymentIntentId: pi.id,
        amountCents: incomingAmount,
        amountSource,
        currency: incomingCurrency.toUpperCase(),
        source: opts.source,
      } as any,
    });

    return {
      ok: true,
      idempotent: false,
      jobId: job.id,
      paymentIntentId: pi.id,
      paidAt: now.toISOString(),
    };
  };

  return opts.tx ? run(opts.tx) : db.transaction(run);
}
