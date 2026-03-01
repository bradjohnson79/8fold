import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { refundUnassignedJob } from "@/src/services/escrow/refundService";
import { badRequest, conflict, forbidden } from "@/src/services/v4/v4Errors";

export type JobListItem = {
  id: string;
  title: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  createdAt: string;
};

export async function listJobsForJobPoster(userId: string): Promise<JobListItem[]> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      routingStatus: jobs.routing_status,
      amountCents: jobs.amount_cents,
      createdAt: jobs.created_at,
    })
    .from(jobs)
    .where(and(eq(jobs.job_poster_user_id, userId), ne(jobs.status, "DRAFT")))
    .orderBy(desc(jobs.created_at));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: String(r.status ?? ""),
    routingStatus: String(r.routingStatus ?? ""),
    amountCents: Number(r.amountCents ?? 0),
    createdAt: r.createdAt?.toISOString?.() ?? "",
  }));
}

export type JobDetail = {
  id: string;
  title: string;
  scope: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  addressFull: string | null;
  tradeCategory: string;
  createdAt: string;
};

export async function getJobDetailForJobPoster(jobId: string, userId: string): Promise<JobDetail | null> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      scope: jobs.scope,
      status: jobs.status,
      routingStatus: jobs.routing_status,
      amountCents: jobs.amount_cents,
      address_full: jobs.address_full,
      trade_category: jobs.trade_category,
      createdAt: jobs.created_at,
      jobPosterUserId: jobs.job_poster_user_id,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const r = rows[0];
  if (!r || r.jobPosterUserId !== userId) return null;

  return {
    id: r.id,
    title: r.title,
    scope: r.scope,
    status: String(r.status ?? ""),
    routingStatus: String(r.routingStatus ?? ""),
    amountCents: Number(r.amountCents ?? 0),
    addressFull: r.address_full ?? null,
    tradeCategory: String(r.trade_category ?? ""),
    createdAt: r.createdAt?.toISOString?.() ?? "",
  };
}

export async function releaseCompletedJobForPoster(jobId: string, userId: string): Promise<{ jobId: string; payoutStatus: string }> {
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      jobPosterUserId: jobs.job_poster_user_id,
      paymentStatus: jobs.payment_status,
      payoutStatus: jobs.payout_status,
      stripePaidAt: jobs.stripe_paid_at,
      stripeRefundedAt: jobs.stripe_refunded_at,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  const job = rows[0] ?? null;
  if (!job) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (job.jobPosterUserId !== userId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (String(job.status ?? "").toUpperCase() !== "COMPLETED") {
    throw conflict("V4_JOB_NOT_COMPLETED", "Job must be completed before release");
  }
  const paymentStatus = String(job.paymentStatus ?? "").toUpperCase();
  if (!["FUNDS_SECURED", "FUNDED"].includes(paymentStatus)) {
    throw conflict("V4_PAYMENT_NOT_PAID", "Paid funds are required before release");
  }
  if (!job.stripePaidAt) {
    throw conflict("V4_PAYMENT_NOT_PAID", "Paid funds are required before release");
  }
  if (job.stripeRefundedAt || paymentStatus === "REFUNDED") {
    throw conflict("V4_PAYMENT_REFUNDED", "Refunded jobs cannot be released");
  }

  await db
    .update(jobs)
    .set({
      payout_status: "READY" as any,
      payment_released_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(jobs.id, jobId));

  return { jobId, payoutStatus: "READY" };
}

export async function refundRoutableUnassignedJobForPoster(jobId: string, userId: string): Promise<{
  jobId: string;
  refunded: boolean;
  idempotent: boolean;
  refundedAt: string | null;
  paymentStatus: string;
}> {
  const result = await refundUnassignedJob(
    jobId,
    {
      actorUserId: userId,
      actorType: "JOB_POSTER",
    },
    { expectedPosterUserId: userId },
  );

  if (result.ok) {
    return {
      jobId,
      refunded: true,
      idempotent: result.idempotent,
      refundedAt: result.refundedAt,
      paymentStatus: result.paymentStatus,
    };
  }

  if (result.reasonCode === "NOT_FOUND") throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (result.reasonCode === "FORBIDDEN") throw forbidden("V4_JOB_NOT_FOUND", "Job not found");
  if (result.reasonCode === "MISSING_PAYMENT_INTENT") {
    throw conflict("V4_REFUND_MISSING_PAYMENT_INTENT", "Stripe payment intent is missing");
  }
  if (result.reasonCode === "REFUND_WINDOW_NOT_REACHED") {
    throw conflict("V4_REFUND_WINDOW_NOT_REACHED", "Refund is available 7 days after payment when unassigned");
  }
  if (result.reasonCode === "ASSIGNED") {
    throw conflict("V4_REFUND_NOT_ALLOWED_ASSIGNED", "Assigned jobs cannot be refunded");
  }
  if (result.reasonCode === "NOT_ROUTABLE") {
    throw conflict("V4_REFUND_NOT_ALLOWED_STATUS", "Refund is only allowed while the job remains routable");
  }
  if (result.reasonCode === "NOT_PAID") {
    throw conflict("V4_REFUND_NOT_ALLOWED_UNPAID", "Paid funds are required before refund");
  }
  if (result.reasonCode === "ALREADY_REFUNDED") {
    return {
      jobId,
      refunded: true,
      idempotent: true,
      refundedAt: result.refundedAt,
      paymentStatus: result.paymentStatus,
    };
  }

  throw conflict("V4_REFUND_FAILED", "Refund could not be processed");
}

export async function acceptAssignedContractorForJobPoster(jobId: string, userId: string): Promise<{ success: true; jobId: string }> {
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      jobPosterUserId: jobs.job_poster_user_id,
      posterAcceptExpiresAt: jobs.poster_accept_expires_at,
      posterAcceptedAt: jobs.poster_accepted_at,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = rows[0] ?? null;
  if (!job || job.jobPosterUserId !== userId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (String(job.status ?? "").toUpperCase() !== "ASSIGNED") {
    throw conflict("V4_JOB_NOT_ASSIGNABLE", "Job is not awaiting poster acceptance");
  }

  const now = new Date();
  if (!job.posterAcceptExpiresAt || job.posterAcceptExpiresAt.getTime() <= now.getTime()) {
    throw conflict("V4_POSTER_ACCEPT_WINDOW_EXPIRED", "Poster acceptance window has expired");
  }

  if (!job.posterAcceptedAt) {
    await db
      .update(jobs)
      .set({ poster_accepted_at: now, updated_at: now })
      .where(eq(jobs.id, jobId));
  }

  return { success: true as const, jobId };
}
