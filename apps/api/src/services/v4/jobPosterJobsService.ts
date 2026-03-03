import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { refundUnassignedJob } from "@/src/services/escrow/refundService";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { badRequest, conflict, forbidden } from "@/src/services/v4/v4Errors";
import { logEvent } from "@/src/server/observability/log";
import {
  computeExecutionEligibility,
  mapLegacyStatusForExecution,
  promoteDuePublishedJobsForJobPoster,
} from "./jobExecutionService";

export type JobListItem = {
  id: string;
  title: string;
  scope: string;
  status: string;
  routingStatus: string;
  tradeCategory: string;
  amountCents: number;
  currency: string;
  createdAt: string;
};

export async function listJobsForJobPoster(userId: string): Promise<JobListItem[]> {
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.job_poster_user_id, userId), eq(jobs.archived, false)))
    .orderBy(desc(jobs.created_at));

  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    scope: String(r.scope ?? ""),
    status: String(r.status ?? ""),
    routingStatus: String(r.routing_status ?? ""),
    tradeCategory: String(r.trade_category ?? ""),
    amountCents: Number(r.amount_cents ?? 0),
    currency: String(r.currency ?? ""),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : "",
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
  canMarkComplete: boolean;
  executionStatus: string;
  contractorMarkedCompleteAt: string | null;
  posterMarkedCompleteAt: string | null;
  completedAt: string | null;
};

export async function getJobDetailForJobPoster(jobId: string, userId: string): Promise<JobDetail | null> {
  console.warn("[JOB_DETAIL_SAFE_READ]", { jobId });

  try {
    await promoteDuePublishedJobsForJobPoster(userId);
  } catch (error) {
    logEvent({
      level: "error",
      event: "job_poster.detail.promote_due_failed",
      userId,
      context: { jobId, error: error instanceof Error ? error.message : String(error) },
    });
  }

  const rows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const row = rows[0];
  if (!row || String(row.job_poster_user_id ?? "") !== userId) return null;

  const appointmentAt = row.appointment_at instanceof Date ? row.appointment_at : null;
  const completedAt = row.completed_at instanceof Date ? row.completed_at : null;
  const contractorMarkedCompleteAt =
    row.contractor_marked_complete_at instanceof Date ? row.contractor_marked_complete_at : null;
  const posterMarkedCompleteAt =
    row.poster_marked_complete_at instanceof Date ? row.poster_marked_complete_at : null;

  const eligibility = computeExecutionEligibility(
    {
      id: row.id,
      status: mapLegacyStatusForExecution(String(row.status ?? "")),
      appointment_at: appointmentAt,
      completed_at: completedAt,
      contractor_marked_complete_at: contractorMarkedCompleteAt,
      poster_marked_complete_at: posterMarkedCompleteAt,
    },
    new Date(),
  );

  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    scope: String(row.scope ?? ""),
    status: mapLegacyStatusForExecution(String(row.status ?? "")),
    routingStatus: String(row.routing_status ?? ""),
    amountCents: Number(row.amount_cents ?? 0),
    addressFull: row.address_full != null ? String(row.address_full) : null,
    tradeCategory: String(row.trade_category ?? ""),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : "",
    canMarkComplete: eligibility.canMarkComplete,
    executionStatus: eligibility.executionStatus,
    contractorMarkedCompleteAt: contractorMarkedCompleteAt != null ? contractorMarkedCompleteAt.toISOString() : null,
    posterMarkedCompleteAt: posterMarkedCompleteAt != null ? posterMarkedCompleteAt.toISOString() : null,
    completedAt: completedAt != null ? completedAt.toISOString() : null,
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
      contractorUserId: jobs.contractor_user_id,
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

    if (job.contractorUserId) {
      await emitDomainEvent({
        type: "POSTER_ACCEPTED_CONTRACTOR",
        payload: {
          jobId,
          contractorId: String(job.contractorUserId),
          createdAt: now,
          dedupeKey: `poster_accepted:${jobId}:${String(job.contractorUserId)}`,
        },
      });
    }
  }

  return { success: true as const, jobId };
}

export async function acceptAppointmentForJobPoster(
  jobId: string,
  userId: string,
): Promise<{ success: true; jobId: string; appointmentAcceptedAt: string }> {
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      jobPosterUserId: jobs.job_poster_user_id,
      contractorUserId: jobs.contractor_user_id,
      appointmentAt: jobs.appointment_at,
      appointmentAcceptedAt: jobs.appointment_accepted_at,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = rows[0] ?? null;
  if (!job || job.jobPosterUserId !== userId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (!job.contractorUserId) throw conflict("V4_JOB_NOT_ASSIGNED", "No contractor is assigned to this job");
  if (!(job.appointmentAt instanceof Date)) {
    throw conflict("V4_APPOINTMENT_NOT_BOOKED", "Contractor has not booked an appointment");
  }

  if (job.appointmentAcceptedAt instanceof Date) {
    return {
      success: true as const,
      jobId,
      appointmentAcceptedAt: job.appointmentAcceptedAt.toISOString(),
    };
  }

  const now = new Date();
  await db
    .update(jobs)
    .set({
      appointment_accepted_at: now,
      updated_at: now,
    })
    .where(eq(jobs.id, jobId));

  await emitDomainEvent({
    type: "APPOINTMENT_ACCEPTED",
    payload: {
      jobId,
      contractorId: String(job.contractorUserId),
      createdAt: now,
      dedupeKey: `appointment_accepted:${jobId}:${String(job.contractorUserId)}`,
    },
  });

  return {
    success: true as const,
    jobId,
    appointmentAcceptedAt: now.toISOString(),
  };
}
